'use strict';
const crypto = require('node:crypto');
const { now } = require('./db');
const { randomCode, UserError } = require('./auth');
const { Hand, GameError } = require('./engine/holdem');
const { currentHand } = require('./engine/evaluator');
const { parseAvatar } = require('./avatar');
const { sessionAccounts } = require('./history');

const LIMITS = {
  minPlayers: 2, maxPlayers: 9,
  minTurn: 10, maxTurn: 300,
  maxChips: 10_000_000,
};

function minBuyinFor(t) {
  return Math.max(1, Math.min(t.starting_stack, (t.big_blind || t.small_blind || 1) * 10));
}

function validateTableSettings(input) {
  const name = String(input.name || '').trim();
  const num = (k) => {
    const v = Number(input[k]);
    if (!Number.isInteger(v)) throw new UserError('Todos los valores numéricos deben ser números enteros');
    return v;
  };
  if (name.length < 1 || name.length > 40) throw new UserError('El nombre de la mesa debe tener entre 1 y 40 caracteres');
  // blindMode: 'both' (SB y BB), 'sb' (solo SB, la pone el de la izquierda del botón) o 'none'.
  const blindMode = ['both', 'sb', 'none'].includes(input.blindMode) ? input.blindMode : (input.useBlinds === false ? 'none' : 'both');
  const useBlinds = blindMode === 'both';
  const s = {
    name,
    max_players: num('maxPlayers'),
    starting_stack: num('startingStack'),
    small_blind: blindMode === 'none' ? 0 : num('smallBlind'),
    big_blind: useBlinds ? num('bigBlind') : 0,
    turn_seconds: num('turnSeconds'),
    allow_rebuy: input.allowRebuy ? 1 : 0,
    bonus72: input.bonus72 ? 1 : 0,
    max_buyin: num('maxBuyin'),
  };
  if (s.max_players < LIMITS.minPlayers || s.max_players > LIMITS.maxPlayers) throw new UserError('La cantidad de jugadores debe estar entre 2 y 9');
  if (useBlinds) {
    if (s.small_blind < 1) throw new UserError('La small blind debe ser al menos 1');
    if (s.big_blind < s.small_blind) throw new UserError('La big blind no puede ser menor que la small blind (lo habitual es el doble)');
    if (s.starting_stack < s.big_blind * 10) throw new UserError(`La entrada inicial debe ser al menos 10 big blinds (Bs ${s.big_blind * 10})`);
  } else if (blindMode === 'sb') {
    if (s.small_blind < 1) throw new UserError('La small blind debe ser al menos 1');
    if (s.starting_stack < s.small_blind * 10) throw new UserError(`La entrada inicial debe ser al menos 10 small blinds (Bs ${s.small_blind * 10})`);
  } else if (s.starting_stack < 10) {
    throw new UserError('La entrada inicial debe ser al menos Bs 10');
  }
  if (s.max_buyin < s.starting_stack) throw new UserError('El importe máximo de entrada no puede ser menor que la entrada inicial');
  if (s.max_buyin > LIMITS.maxChips) throw new UserError(`El importe máximo no puede superar Bs ${LIMITS.maxChips.toLocaleString('es')}`);
  if (s.turn_seconds < LIMITS.minTurn || s.turn_seconds > LIMITS.maxTurn) throw new UserError('El tiempo por turno debe estar entre 10 y 300 segundos');
  return s;
}

function publicTable(t) {
  return {
    id: t.id, code: t.code, name: t.name, ownerId: t.owner_id, status: t.status,
    maxPlayers: t.max_players, startingStack: t.starting_stack, smallBlind: t.small_blind, useBlinds: t.big_blind > 0,
    blindMode: t.big_blind > 0 ? 'both' : t.small_blind > 0 ? 'sb' : 'none',
    bigBlind: t.big_blind, turnSeconds: t.turn_seconds, allowRebuy: !!t.allow_rebuy, bonus72: !!t.bonus72,
    maxBuyin: t.max_buyin, minBuyin: minBuyinFor(t), createdAt: t.created_at,
  };
}

class Room {
  constructor(mgr, table) {
    this.mgr = mgr;
    this.db = mgr.db;
    this.io = mgr.io;
    this.cfg = mgr.config;
    this.t = table;
    this.seats = new Array(table.max_players).fill(null);
    this.sockets = new Map(); // userId -> Set<socket>
    this.session = null;
    this.hand = null;
    this.handNumber = 0;
    this.handRowId = null;
    this.dealerSeat = null;
    this.lastResult = null;
    this.turnId = 0;
    this.turnDeadline = null;
    this.turnTimer = null;
    this.nextHandTimer = null;
    this.processedActions = new Set();
    this.closing = false;
    this.chat = []; // últimos mensajes (en memoria)
    this.chatTimes = new Map(); // userId -> marcas de tiempo recientes (anti-spam)
    this._restore();
  }

  get id() { return this.t.id; }
  get roomName() { return `t:${this.t.id}`; }

  // ------------------------------------------------------------------ persistencia
  _restore() {
    const s = this.db.prepare('SELECT * FROM table_sessions WHERE table_id = ? AND ended_at IS NULL').get(this.t.id);
    if (!s) return;
    this.session = s;
    this.dealerSeat = s.last_dealer_seat;
    const max = this.db.prepare('SELECT MAX(hand_number) AS n FROM hands WHERE session_id = ?').get(s.id);
    this.handNumber = max.n || 0;
    // Manos que quedaron abiertas por un reinicio del servidor: se anulan (las pilas guardadas son las previas).
    this.db.prepare(`UPDATE hands SET ended_at = ?, summary = ? WHERE session_id = ? AND ended_at IS NULL`)
      .run(now(), JSON.stringify({ voided: true, reason: 'Mano anulada por reinicio del servidor' }), s.id);
    const rows = this.db.prepare(`SELECT sp.*, u.username, u.code FROM session_players sp JOIN users u ON u.id = sp.user_id
      WHERE sp.session_id = ? AND sp.seated = 1`).all(s.id);
    for (const r of rows) {
      if (r.seat == null || r.seat >= this.seats.length || this.seats[r.seat]) continue;
      this.seats[r.seat] = this._newSeat(r.user_id, r.username, r.code, r.stack);
      this.seats[r.seat].disconnectedAt = Date.now();
      this.seats[r.seat].ready = true;
    }
    if (this.seatedCount() === 0) this._endSession();
    else this._scheduleNextHand(this.cfg.resultDelayMs);
  }

  _newSeat(userId, username, code, stack) {
    return { userId, username, code, stack, ready: false, disconnectedAt: null, pendingRebuys: [], leaving: false };
  }

  _ensureSession() {
    if (this.session) return this.session;
    const id = crypto.randomUUID();
    this.db.prepare('INSERT INTO table_sessions (id, table_id, started_at) VALUES (?,?,?)').run(id, this.t.id, now());
    this.session = this.db.prepare('SELECT * FROM table_sessions WHERE id = ?').get(id);
    this.handNumber = 0;
    this.dealerSeat = null;
    this.lastResult = null;
    return this.session;
  }

  _endSession() {
    if (!this.session) return;
    this.db.prepare('UPDATE table_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(now(), this.session.id);
    this.session = null;
    this.handNumber = 0;
    this.lastResult = null;
    this.dealerSeat = null;
    clearTimeout(this.nextHandTimer);
  }

  // ------------------------------------------------------------------ utilidades
  seatOf(userId) { return this.seats.findIndex((s) => s && s.userId === userId); }
  seatedCount() { return this.seats.filter(Boolean).length; }
  isConnected(userId) { const s = this.sockets.get(userId); return !!(s && s.size); }

  /** ¿El asiento participa (aunque se haya retirado) de la mano en curso? */
  _inHand(seatIdx) {
    return !!(this.hand && !this.hand.finished && this.hand.player(seatIdx));
  }

  _graceExpired(seat) {
    return seat.disconnectedAt && Date.now() - seat.disconnectedAt > this.cfg.graceMs;
  }

  _eligibleSeats() {
    const out = [];
    this.seats.forEach((s, i) => { if (s && s.stack > 0 && !s.leaving && !this._graceExpired(s)) out.push(i); });
    return out;
  }

  // ------------------------------------------------------------------ conexión
  attachSocket(socket, user) {
    socket.join(this.roomName);
    if (!this.sockets.has(user.id)) this.sockets.set(user.id, new Set());
    this.sockets.get(user.id).add(socket);
    const si = this.seatOf(user.id);
    if (si >= 0) this.seats[si].disconnectedAt = null;
    this.db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, joined_at) VALUES (?,?,?)').run(this.t.id, user.id, now());
    this.broadcast();
  }

  detachSocket(socket, userId) {
    socket.leave(this.roomName);
    const set = this.sockets.get(userId);
    if (set) { set.delete(socket); if (!set.size) this.sockets.delete(userId); }
    const si = this.seatOf(userId);
    if (si >= 0 && !this.isConnected(userId)) this.seats[si].disconnectedAt = Date.now();
    this.broadcast();
  }

  /** Revisión periódica: libera asientos de quienes superaron el período de gracia. */
  sweep() {
    let changed = false;
    this.seats.forEach((s, i) => {
      if (s && this._graceExpired(s) && !this._inHand(i)) {
        this._standUp(i, 'disconnect');
        changed = true;
      }
    });
    if (changed) this.broadcast();
  }

  // ------------------------------------------------------------------ acciones de jugadores
  sit(user, { amount, seat, requestId }) {
    if (this.t.status !== 'open') throw new UserError('La mesa está cerrada');
    if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 80) throw new UserError('Solicitud inválida');
    const key = `sit:${this.t.id}:${user.id}:${requestId}`;
    if (this.db.prepare('SELECT 1 FROM chip_ledger WHERE idempotency_key = ?').get(key)) return; // reintento: ya aplicado
    if (this.seatOf(user.id) >= 0) throw new UserError('Ya estás sentado en esta mesa');
    amount = Number(amount);
    const min = minBuyinFor(this.t);
    if (!Number.isInteger(amount) || amount < min || amount > this.t.max_buyin) {
      throw new UserError(`El importe debe ser un número entero entre Bs ${min} y Bs ${this.t.max_buyin}`);
    }
    let idx = Number.isInteger(seat) && seat >= 0 && seat < this.seats.length && !this.seats[seat] ? seat : this.seats.findIndex((s) => !s);
    if (idx < 0) throw new UserError('La mesa está completa');

    this.db.tx(() => {
      const session = this._ensureSession();
      const prev = this.db.prepare('SELECT * FROM session_players WHERE session_id = ? AND user_id = ?').get(session.id, user.id);
      if (prev) {
        this.db.prepare('UPDATE session_players SET seat = ?, stack = ?, seated = 1 WHERE session_id = ? AND user_id = ?')
          .run(idx, amount, session.id, user.id);
      } else {
        this.db.prepare('INSERT INTO session_players (session_id, user_id, seat, stack, seated, first_joined_at) VALUES (?,?,?,?,1,?)')
          .run(session.id, user.id, idx, amount, now());
      }
      this.db.prepare('INSERT INTO chip_ledger (session_id, user_id, kind, amount, created_at, idempotency_key) VALUES (?,?,?,?,?,?)')
        .run(session.id, user.id, prev ? 'reentry' : 'buyin', amount, now(), key);
    });
    this.seats[idx] = this._newSeat(user.id, user.username, user.code, amount);
    if (!this.isConnected(user.id)) this.seats[idx].disconnectedAt = Date.now();
    if (this.session.game_started) this.seats[idx].ready = true;
    this.emitEvent({ kind: 'sit', seat: idx });
    this.pushAccounts();
    this._scheduleNextHand(300);
    this.broadcast();
  }

  setReady(user, ready) {
    const si = this.seatOf(user.id);
    if (si < 0) throw new UserError('No estás sentado');
    this.seats[si].ready = !!ready;
    this.broadcast();
  }

  canStart(userId) {
    if (!this.session || this.session.game_started) return false;
    const ownerSeated = this.seatOf(this.t.owner_id) >= 0;
    if (userId !== this.t.owner_id && (ownerSeated || this.seatOf(userId) < 0)) return false;
    return this.seats.filter((s) => s && s.ready && s.stack > 0).length >= 2;
  }

  startGame(user) {
    if (!this.session) throw new UserError('No hay jugadores sentados');
    if (this.session.game_started) throw new UserError('La partida ya comenzó');
    const isOwner = user.id === this.t.owner_id;
    if (!isOwner && this.seatOf(this.t.owner_id) >= 0) throw new UserError('Solo el creador de la mesa puede iniciar la partida');
    if (!isOwner && this.seatOf(user.id) < 0) throw new UserError('Tenés que estar sentado para iniciar la partida');
    if (this.seats.filter((s) => s && s.ready && s.stack > 0).length < 2) throw new UserError('Se necesitan al menos dos jugadores listos');
    this.db.prepare('UPDATE table_sessions SET game_started = 1 WHERE id = ?').run(this.session.id);
    this.session.game_started = 1;
    for (const s of this.seats) if (s) s.ready = true;
    this._startHand();
  }

  rebuy(user, { amount, requestId }) {
    if (!this.t.allow_rebuy) throw new UserError('Esta mesa no permite recargas');
    const si = this.seatOf(user.id);
    if (si < 0) throw new UserError('No estás sentado');
    if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 80) throw new UserError('Solicitud inválida');
    const key = `rebuy:${this.t.id}:${user.id}:${requestId}`;
    const seat = this.seats[si];
    if (seat.pendingRebuys.some((r) => r.key === key)) return;
    if (this.db.prepare('SELECT 1 FROM chip_ledger WHERE idempotency_key = ?').get(key)) return;
    amount = Number(amount);
    const pending = seat.pendingRebuys.reduce((s, r) => s + r.amount, 0);
    const room = this.t.max_buyin - seat.stack - pending;
    if (!Number.isInteger(amount) || amount < 1) throw new UserError('El importe de la recarga debe ser un número entero positivo');
    if (amount > room) throw new UserError(room > 0 ? `Podés recargar como máximo Bs ${room} (tope por jugador: Bs ${this.t.max_buyin})` : `Ya tenés el máximo permitido (Bs ${this.t.max_buyin})`);
    seat.pendingRebuys.push({ amount, key });
    if (!this.hand || this.hand.finished) this._applyPendingRebuys();
    this.broadcast();
  }

  _applyPendingRebuys() {
    let applied = false;
    for (const s of this.seats) {
      if (!s || !s.pendingRebuys.length) continue;
      const list = s.pendingRebuys;
      s.pendingRebuys = [];
      for (const r of list) {
        if (s.stack + r.amount > this.t.max_buyin) continue;
        this.db.tx(() => {
          this.db.prepare('INSERT INTO chip_ledger (session_id, user_id, kind, amount, created_at, idempotency_key) VALUES (?,?,?,?,?,?)')
            .run(this.session.id, s.userId, 'rebuy', r.amount, now(), r.key);
          this.db.prepare('UPDATE session_players SET stack = stack + ? WHERE session_id = ? AND user_id = ?')
            .run(r.amount, this.session.id, s.userId);
        });
        s.stack += r.amount;
        applied = true;
        this.emitEvent({ kind: 'rebuy', seat: this.seats.indexOf(s), amount: r.amount });
      }
    }
    if (applied) this.pushAccounts();
  }

  leave(user) {
    const si = this.seatOf(user.id);
    if (si < 0) return;
    if (this._inHand(si)) {
      // Sigue ocupando el asiento hasta que termine la mano; si todavía no se retiró, se retira ya.
      this.seats[si].leaving = true;
      if (!this.hand.player(si).folded) {
        this.hand.forceFold(si);
        this._afterHandProgress();
      }
    } else {
      this._standUp(si, 'leave');
    }
    this.broadcast();
  }

  _standUp(si, reason) {
    const s = this.seats[si];
    if (!s) return;
    this.db.tx(() => {
      this.db.prepare('INSERT INTO chip_ledger (session_id, user_id, kind, amount, created_at, idempotency_key) VALUES (?,?,?,?,?,?)')
        .run(this.session.id, s.userId, 'cashout', s.stack, now(), `cashout:${crypto.randomUUID()}`);
      this.db.prepare('UPDATE session_players SET stack = 0, seated = 0 WHERE session_id = ? AND user_id = ?')
        .run(this.session.id, s.userId);
    });
    this.seats[si] = null;
    this.emitEvent({ kind: 'standup', seat: si, username: s.username, reason });
    const sid = this.session.id;
    if (this.seatedCount() === 0) this._endSession();
    this.pushAccounts(sid);
  }

  close(user) {
    if (user.id !== this.t.owner_id) throw new UserError('Solo el creador puede cerrar la mesa');
    if (this.hand && !this.hand.finished) throw new UserError('Esperá a que termine la mano en curso para cerrar la mesa');
    this.db.tx(() => {
      this.db.prepare("UPDATE poker_tables SET status = 'closed' WHERE id = ?").run(this.t.id);
      if (this.session) {
        // Las pilas que quedan en la mesa se registran como "fichas restantes".
        for (const s of this.seats) {
          if (s) this.db.prepare('UPDATE session_players SET stack = ?, seated = 0 WHERE session_id = ? AND user_id = ?').run(s.stack, this.session.id, s.userId);
        }
      }
    });
    const finalAccounts = this.session ? sessionAccounts(this.db, this.session.id) : null;
    this.t.status = 'closed';
    this.seats.fill(null);
    this._endSession();
    if (finalAccounts) finalAccounts.endedAt = new Date().toISOString();
    clearTimeout(this.turnTimer);
    this.io.to(this.roomName).emit('table:closed', { message: 'El creador cerró la mesa.', accounts: finalAccounts });
    this.broadcast();
  }

  // ------------------------------------------------------------------ manos
  _scheduleNextHand(delay) {
    if (!this.session || !this.session.game_started || this.t.status !== 'open') return;
    if (this.hand && !this.hand.finished) return;
    clearTimeout(this.nextHandTimer);
    this.nextHandTimer = setTimeout(() => {
      try { this._startHand(); } catch (e) { console.error('Error al iniciar mano', e); }
    }, delay);
  }

  _startHand() {
    if (this.hand && !this.hand.finished) return;
    if (!this.session || !this.session.game_started) return;
    clearTimeout(this.nextHandTimer);
    // limpiar asientos: quienes se van o superaron el período de gracia
    this.seats.forEach((s, i) => { if (s && (s.leaving || this._graceExpired(s))) this._standUp(i, s.leaving ? 'leave' : 'disconnect'); });
    if (!this.session) { this.broadcast(); return; }
    this._applyPendingRebuys();
    const eligible = this._eligibleSeats();
    if (eligible.length < 2) { this.hand = null; this.broadcast(); return; }

    let dealer;
    if (this.dealerSeat == null) dealer = eligible[crypto.randomInt(eligible.length)];
    else dealer = eligible.find((i) => i > this.dealerSeat) ?? eligible[0];
    this.dealerSeat = dealer;

    const hand = new Hand({
      players: eligible.map((i) => ({ seat: i, userId: this.seats[i].userId, stack: this.seats[i].stack })),
      dealerSeat: dealer, smallBlind: this.t.small_blind, bigBlind: this.t.big_blind,
    });
    this.handNumber += 1;
    const startedAt = now();
    const r = this.db.prepare('INSERT INTO hands (session_id, hand_number, started_at) VALUES (?,?,?)')
      .run(this.session.id, this.handNumber, startedAt);
    this.db.prepare('UPDATE table_sessions SET last_dealer_seat = ? WHERE id = ?').run(dealer, this.session.id);
    this.handRowId = r.lastInsertRowid;
    this.hand = hand;
    this.handStartedAt = startedAt;
    this.lastResult = null;
    this.processedActions = new Set();
    this.emitEvent({ kind: 'deal', handNumber: this.handNumber });
    this._afterHandProgress();
  }

  action(user, { type, amount, turnId, actionId }) {
    if (!this.hand || this.hand.finished) throw new UserError('No hay una mano en curso');
    const si = this.seatOf(user.id);
    if (si < 0) throw new UserError('No estás sentado en esta mesa');
    if (typeof actionId !== 'string' || actionId.length < 8 || actionId.length > 80) throw new UserError('Solicitud inválida');
    if (this.processedActions.has(actionId)) return { duplicate: true };
    if (this.hand.turnSeat !== si) throw new UserError('No es tu turno');
    if (turnId !== this.turnId) throw new UserError('La acción llegó tarde: el estado de la mesa cambió');
    const allowed = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
    if (!allowed.includes(type)) throw new UserError('Acción desconocida');
    const amt = amount == null ? undefined : Number(amount);
    try {
      this.hand.act(si, { type, amount: amt });
    } catch (e) {
      if (e instanceof GameError) throw new UserError(e.message);
      throw e;
    }
    this.processedActions.add(actionId);
    this.emitEvent({ kind: 'action', seat: si, type });
    this._afterHandProgress();
    return { ok: true };
  }

  _afterHandProgress() {
    clearTimeout(this.turnTimer);
    if (!this.hand) return;
    if (this.hand.finished) { this._finishHand(); return; }
    this.turnId += 1;
    const ms = this.cfg.turnMsOverride || this.t.turn_seconds * 1000;
    this.turnDeadline = Date.now() + ms;
    const seat = this.hand.turnSeat;
    const tid = this.turnId;
    this.turnTimer = setTimeout(() => {
      if (!this.hand || this.hand.finished || this.turnId !== tid) return;
      try {
        const e = this.hand.timeout(seat);
        if (e) this.emitEvent({ kind: 'action', seat, type: e.type, auto: true });
      } catch (err) { console.error('Error en vencimiento de turno', err); }
      this._afterHandProgress();
    }, ms);
    this.emitEvent({ kind: 'turn', seat });
    this.broadcast();
  }

  _finishHand() {
    const h = this.hand;
    const res = h.result;
    // Bono 7-2: si la mesa lo tiene activado y alguien gana con 7 y 2 en la mano,
    // cada uno de los demás jugadores de esa mano le paga Bs 1 (si le queda).
    const bonus = [];
    if (this.t.bonus72) {
      for (const w of res.winners) {
        const wp = h.player(w.seat);
        const ranks = wp.hole.map((c) => c[0]).sort().join('');
        if (ranks !== '27') continue;
        let total = 0;
        for (const p of h.players) {
          if (p === wp) continue;
          const amt = Math.min(1, p.stack);
          p.stack -= amt; total += amt;
        }
        wp.stack += total;
        if (total > 0) bonus.push({ seat: w.seat, amount: total, cards: wp.hole.slice() });
      }
    }
    for (const p of h.players) if (this.seats[p.seat]) this.seats[p.seat].stack = p.stack;
    const name = (seat) => (this.seats[seat] ? this.seats[seat].username : '—');
    const userOf = (seat) => h.player(seat).userId;
    this.lastResult = {
      handNumber: this.handNumber,
      type: res.type,
      board: res.board,
      winners: res.winners.map((w) => ({ ...w, username: name(w.seat) })),
      pots: res.pots.map((p) => ({ amount: p.amount, winners: p.winners.map((w) => ({ ...w, username: name(w.seat) })) })),
      showdown: res.showdown.map((s) => ({ seat: s.seat, cards: s.cards, handName: s.handName, bestCards: s.bestCards, username: name(s.seat) })),
      uncalled: res.uncalled,
      shown: [],
      bonus72: bonus.map((b) => ({ ...b, username: name(b.seat) })),
      at: Date.now(),
    };
    // Quien cobra el bono muestra su 7-2 (si no se vio en el showdown).
    for (const b of bonus) {
      if (!res.showdown.some((x) => x.seat === b.seat)) this.lastResult.shown.push({ seat: b.seat, cards: b.cards, username: name(b.seat) });
    }
    const summary = {
      board: res.board,
      type: res.type,
      dealerSeat: h.dealerSeat,
      players: h.players.map((p) => ({ userId: p.userId, username: name(p.seat), seat: p.seat, start: p.startStack, end: p.stack })),
      winners: res.winners.map((w) => ({ userId: userOf(w.seat), username: name(w.seat), amount: w.amount, handName: w.handName })),
      showdown: res.showdown.map((s) => ({ userId: userOf(s.seat), username: name(s.seat), cards: s.cards, handName: s.handName })),
      actions: h.log.map((a) => ({ ...a, username: name(a.seat) })),
      bonus72: bonus.map((b) => ({ userId: userOf(b.seat), username: name(b.seat), amount: b.amount })),
      shown: this.lastResult.shown.map((x) => ({ userId: userOf(x.seat), username: x.username, cards: x.cards })),
    };
    this.db.tx(() => {
      this.db.prepare('UPDATE hands SET ended_at = ?, summary = ? WHERE id = ?').run(now(), JSON.stringify(summary), this.handRowId);
      for (const s of this.seats) {
        if (s) this.db.prepare('UPDATE session_players SET stack = ? WHERE session_id = ? AND user_id = ?').run(s.stack, this.session.id, s.userId);
      }
    });
    this.emitEvent({ kind: 'win', winners: this.lastResult.winners });
    this.lastHoles = new Map(h.players.map((p) => [p.userId, p.hole.slice()]));
    this.hand = null;
    this.turnDeadline = null;
    // aplicar recargas y salidas entre manos
    this._applyPendingRebuys();
    this.seats.forEach((s, i) => { if (s && (s.leaving || this._graceExpired(s))) this._standUp(i, s.leaving ? 'leave' : 'disconnect'); });
    this._scheduleNextHand(this.cfg.resultDelayMs);
    this.pushAccounts();
    this.broadcast();
  }

  // ------------------------------------------------------------------ vistas
  /** Tras terminar la mano, un jugador puede mostrar voluntariamente sus cartas. */
  showCards(user) {
    if (this.hand && !this.hand.finished) throw new UserError('Solo podés mostrar tus cartas cuando termina la mano');
    const si = this.seatOf(user.id);
    if (!this.lastResult || si < 0 || !this.lastHoles || !this.lastHoles.has(user.id)) throw new UserError('No tenés cartas para mostrar');
    const lr = this.lastResult;
    if (lr.showdown.some((x) => x.seat === si) || lr.shown.some((x) => x.seat === si)) return;
    const cards = this.lastHoles.get(user.id);
    lr.shown.push({ seat: si, cards, username: this.seats[si].username });
    const row = this.db.prepare('SELECT summary FROM hands WHERE id = ?').get(this.handRowId);
    if (row && row.summary) {
      const sum = JSON.parse(row.summary);
      sum.shown = (sum.shown || []).concat([{ userId: user.id, username: this.seats[si].username, cards }]);
      this.db.prepare('UPDATE hands SET summary = ? WHERE id = ?').run(JSON.stringify(sum), this.handRowId);
    }
    this.emitEvent({ kind: 'show', seat: si, username: this.seats[si].username });
    this.broadcast();
  }

  sendChat(user, { text, quick }) {
    const QUICK = this.mgr.constructor.QUICK_CHAT;
    let msg;
    if (quick != null) {
      msg = QUICK[Number(quick)];
      if (!msg) throw new UserError('Mensaje rápido desconocido');
    } else {
      msg = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      if (!msg) throw new UserError('El mensaje está vacío');
      if (msg.length > 200) throw new UserError('El mensaje es demasiado largo (máximo 200 caracteres)');
    }
    const now = Date.now();
    const recent = (this.chatTimes.get(user.id) || []).filter((t) => now - t < 10000);
    if (recent.length >= 6) throw new UserError('Estás enviando mensajes muy rápido. Esperá unos segundos.');
    recent.push(now);
    this.chatTimes.set(user.id, recent);
    const si = this.seatOf(user.id);
    const m = { id: `${now}-${user.id}-${recent.length}`, userId: user.id, username: user.username, seat: si >= 0 ? si : null, text: msg, quick: quick != null, at: now };
    this.chat.push(m);
    if (this.chat.length > 60) this.chat.shift();
    this.io.to(this.roomName).emit('table:chat', m);
    return m;
  }

  /** Manda a todos los de la mesa las cuentas actualizadas (cada uno las guarda en su dispositivo). */
  pushAccounts(sessionId = this.session && this.session.id) {
    if (!sessionId) return;
    const acc = sessionAccounts(this.db, sessionId);
    if (acc) this.io.to(this.roomName).emit('table:accounts', acc);
  }

  /** Cuentas de la sesión: cargas, saldos y quién le paga a quién. */
  accounts() {
    if (!this.session) return null;
    return sessionAccounts(this.db, this.session.id);
  }

  emitEvent(ev) { this.io.to(this.roomName).emit('table:event', ev); }

  broadcast() {
    const sockets = this.io.sockets.adapter.rooms.get(this.roomName);
    if (!sockets) return;
    for (const sid of sockets) {
      const sock = this.io.sockets.sockets.get(sid);
      if (sock && sock.data.user) sock.emit('table:state', this.view(sock.data.user.id));
    }
  }

  view(userId) {
    const h = this.hand && !this.hand.finished ? this.hand : null;
    const mySeat = this.seatOf(userId);
    const revealed = new Map();
    if (!h && this.lastResult) for (const s of [...this.lastResult.showdown, ...this.lastResult.shown]) revealed.set(s.seat, s.cards);

    const seats = this.seats.map((s, i) => {
      if (!s) return null;
      const hp = h ? h.player(i) : null;
      let cards = null;
      if (hp && s.userId === userId) cards = hp.hole.slice();
      else if (revealed.has(i)) cards = revealed.get(i);
      else if (!h && this.lastResult && s.userId === userId && this.lastHoles && this.lastHoles.has(userId)) cards = this.lastHoles.get(userId);
      return {
        seat: i, userId: s.userId, username: s.username, code: s.code, avatar: this.mgr.avatarOf(s.userId),
        stack: hp ? hp.stack : s.stack,
        connected: this.isConnected(s.userId),
        ready: s.ready,
        inHand: !!hp,
        folded: hp ? hp.folded : false,
        allIn: hp ? hp.allIn : false,
        bet: hp ? hp.bet : 0,
        lastAction: hp ? hp.lastAction : null,
        hasCards: !!(hp && !hp.folded),
        cards,
        leaving: s.leaving,
        pendingRebuy: s.pendingRebuys.reduce((a, r) => a + r.amount, 0),
        waiting: !!(this.session && this.session.game_started && h && !hp),
      };
    });

    let hand = null;
    if (h) {
      const pots = h.pots(true);
      hand = {
        number: this.handNumber,
        street: h.street,
        board: h.board.slice(),
        pots: pots.map((p) => ({ amount: p.amount, players: p.eligible.length })),
        totalPot: h.players.reduce((s, p) => s + p.total, 0),
        currentBet: h.currentBet,
        dealerSeat: h.dealerSeat, sbSeat: h.sbSeat, bbSeat: h.bbSeat,
        dealOrder: h._positionOrder(),
        turnSeat: h.turnSeat,
        turnId: this.turnId,
        deadline: this.turnDeadline,
        legal: mySeat >= 0 ? h.legalActions(mySeat) : null,
        // Solo el propio jugador recibe su juego actual (calculado con sus cartas y las de la mesa).
        myHand: (() => {
          const me = mySeat >= 0 ? h.player(mySeat) : null;
          return me && !me.folded ? currentHand(me.hole, h.board) : null;
        })(),
      };
    }
    return {
      table: { ...publicTable(this.t), ownerName: this.mgr.usernameOf(this.t.owner_id) },
      sessionId: this.session ? this.session.id : null,
      gameStarted: !!(this.session && this.session.game_started),
      isOwner: userId === this.t.owner_id,
      canStart: this.canStart(userId),
      mySeat: mySeat >= 0 ? mySeat : null,
      canShowCards: !!(!h && this.lastResult && mySeat >= 0 && this.lastHoles && this.lastHoles.has(userId) && !revealed.has(mySeat)),
      seats,
      hand,
      dealerSeat: h ? h.dealerSeat : this.dealerSeat,
      lastResult: this.lastResult,
      nextHandAt: !h && this.lastResult ? this.lastResult.at + this.cfg.resultDelayMs : null,
      serverTime: Date.now(),
    };
  }

  /** Información pública para la pantalla previa a entrar. */
  preview() {
    return {
      ...publicTable(this.t),
      ownerName: this.mgr.usernameOf(this.t.owner_id),
      players: this.seats.filter(Boolean).map((s) => ({ username: s.username, code: s.code, stack: s.stack, avatar: this.mgr.avatarOf(s.userId) })),
      freeSeats: this.seats.filter((s) => !s).length,
      gameStarted: !!(this.session && this.session.game_started),
      handInProgress: !!(this.hand && !this.hand.finished),
    };
  }
}

class TableManager {
  static QUICK_CHAT = [
    '¿Vas de farol, verdad?',
    'Te recomiendo irte',
    'Te recomiendo pagar',
    'Cagón',
    '¡Escalera!',
    '¡Faroleada histórica!',
    '¡Color!',
    '¡Trica!',
    '¡Masivo!',
    'Checkea',
    'Foldea',
    'Si subís te pago',
    'Resubo',
    'No te voy a pagar',
    '¡Te chingué!',
  ];

  constructor({ db, io, config }) {
    this.db = db;
    this.io = io;
    this.config = config;
    this.rooms = new Map();
    this._names = new Map();
  }

  avatarOf(id) {
    if (!this._avatars) this._avatars = new Map();
    if (!this._avatars.has(id)) {
      const u = this.db.prepare('SELECT avatar FROM users WHERE id = ?').get(id);
      this._avatars.set(id, parseAvatar(u && u.avatar, id));
    }
    return this._avatars.get(id);
  }

  /** Tras cambiar el personaje, se actualiza en las mesas donde está el usuario. */
  avatarChanged(id) {
    if (this._avatars) this._avatars.delete(id);
    for (const r of this.rooms.values()) if (r.seatOf(id) >= 0 || r.sockets.has(id)) r.broadcast();
  }

  /** ¿Tiene alguna pestaña abierta en alguna mesa? */
  isUserOnline(id) {
    for (const r of this.rooms.values()) if (r.isConnected(id)) return true;
    return false;
  }

  usernameOf(id) {
    if (!this._names.has(id)) {
      const u = this.db.prepare('SELECT username FROM users WHERE id = ?').get(id);
      this._names.set(id, u ? u.username : '—');
    }
    return this._names.get(id);
  }

  restoreAll() {
    const rows = this.db.prepare('SELECT DISTINCT table_id FROM table_sessions WHERE ended_at IS NULL').all();
    for (const r of rows) this.room(r.table_id);
    this._sweepTimer = setInterval(() => { for (const room of this.rooms.values()) room.sweep(); }, this.config.sweepMs);
    this._sweepTimer.unref();
  }

  stop() {
    clearInterval(this._sweepTimer);
    for (const r of this.rooms.values()) { clearTimeout(r.turnTimer); clearTimeout(r.nextHandTimer); }
  }

  room(tableId) {
    let r = this.rooms.get(tableId);
    if (!r) {
      const t = this.db.prepare('SELECT * FROM poker_tables WHERE id = ?').get(tableId);
      if (!t) return null;
      r = new Room(this, t);
      this.rooms.set(tableId, r);
    }
    return r;
  }

  roomByCode(code) {
    const t = this.db.prepare('SELECT id FROM poker_tables WHERE code = ?').get(String(code || '').toUpperCase().trim());
    return t ? this.room(t.id) : null;
  }

  createTable(user, input) {
    const s = validateTableSettings(input);
    for (let i = 0; i < 20; i++) {
      const code = randomCode(6);
      try {
        const id = this.db.tx(() => {
          const r = this.db.prepare(`INSERT INTO poker_tables (code, name, owner_id, max_players, starting_stack, small_blind, big_blind,
            turn_seconds, allow_rebuy, max_buyin, bonus72, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(code, s.name, user.id, s.max_players, s.starting_stack, s.small_blind, s.big_blind, s.turn_seconds, s.allow_rebuy, s.max_buyin, s.bonus72, now());
          this.db.prepare('INSERT INTO table_members (table_id, user_id, joined_at) VALUES (?,?,?)').run(r.lastInsertRowid, user.id, now());
          return r.lastInsertRowid;
        });
        return publicTable(this.db.prepare('SELECT * FROM poker_tables WHERE id = ?').get(id));
      } catch (e) {
        if (!/UNIQUE/.test(e.message)) throw e;
      }
    }
    throw new Error('No se pudo generar el código de mesa');
  }

  lobby(user) {
    const rows = this.db.prepare(`SELECT t.* FROM poker_tables t JOIN table_members m ON m.table_id = t.id
      WHERE m.user_id = ? ORDER BY (t.status = 'open') DESC, t.created_at DESC LIMIT 100`).all(user.id);
    return rows.map((t) => {
      const live = this.rooms.get(t.id);
      return {
        ...publicTable(t),
        ownerName: this.usernameOf(t.owner_id),
        isOwner: t.owner_id === user.id,
        seated: live ? live.seatedCount() : 0,
        gameStarted: !!(live && live.session && live.session.game_started),
        mySeat: live ? live.seatOf(user.id) >= 0 : false,
      };
    });
  }
}

module.exports = { TableManager, validateTableSettings, minBuyinFor, publicTable };
