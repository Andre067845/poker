'use strict';
/**
 * Motor de una mano de Texas Hold'em No Limit.
 * Es puro y determinista dado un mazo: no sabe nada de red ni de base de datos.
 * Los asientos se numeran en sentido horario; "a la izquierda" = siguiente asiento.
 */
const { shuffledDeck } = require('./cards');
const { bestHand } = require('./evaluator');

class GameError extends Error {
  constructor(message) { super(message); this.name = 'GameError'; this.userFacing = true; }
}

const STREETS = ['preflop', 'flop', 'turn', 'river'];

class Hand {
  /**
   * @param {object} o
   * @param {{seat:number,userId:any,stack:number}[]} o.players jugadores con fichas (>=2)
   * @param {number} o.dealerSeat asiento del botón (debe estar entre los jugadores)
   * @param {number} o.smallBlind
   * @param {number} o.bigBlind  0 para jugar sin ciegas
   * @param {number} [o.minBet]  apuesta mínima cuando no hay ciegas (por defecto 1)
   * @param {string[]} [o.deck] mazo ya barajado (para pruebas). Si falta se baraja con crypto.
   */
  constructor({ players, dealerSeat, smallBlind, bigBlind, minBet, deck }) {
    const ps = players.filter((p) => p.stack > 0).sort((a, b) => a.seat - b.seat);
    if (ps.length < 2) throw new GameError('Se necesitan al menos dos jugadores con fichas');
    if (new Set(ps.map((p) => p.seat)).size !== ps.length) throw new Error('Asientos duplicados');
    this.players = ps.map((p) => ({
      seat: p.seat, userId: p.userId, startStack: p.stack, stack: p.stack,
      bet: 0, total: 0, folded: false, allIn: false, acted: false, actedAtBet: null,
      hole: [], lastAction: null,
    }));
    this.blinds = bigBlind > 0;
    // "Solo SB": hay small blind pero no big blind.
    this.sbOnly = !this.blinds && smallBlind > 0;
    this.sb = this.blinds || this.sbOnly ? smallBlind : 0;
    this.bb = this.blinds ? bigBlind : 0;
    // Apuesta mínima: la big blind; con "solo SB", la SB; sin ciegas, 1 (o la indicada).
    this.minBet = this.blinds ? bigBlind : this.sbOnly ? smallBlind : Math.max(1, minBet || 1);
    this.deck = deck ? deck.slice() : shuffledDeck();
    if (new Set(this.deck).size !== this.deck.length) throw new Error('Mazo con cartas repetidas');
    this.burned = [];
    this.board = [];
    this.street = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.minBet;
    this.turnIdx = -1;
    this.finished = false;
    this.result = null;
    this.log = [];
    this.actionCount = 0;

    const n = this.players.length;
    this.dealerIdx = this.players.findIndex((p) => p.seat === dealerSeat);
    if (this.dealerIdx < 0) throw new Error('El botón debe estar en un jugador activo');
    if (this.sbOnly) {
      // Solo SB: la pone siempre el jugador a la izquierda del botón (también mano a mano).
      this.sbIdx = (this.dealerIdx + 1) % n;
      this.bbIdx = -1;
    } else if (n === 2) {
      // Mano a mano: el botón pone la ciega chica y actúa primero antes del flop.
      this.sbIdx = this.dealerIdx;
      this.bbIdx = (this.dealerIdx + 1) % n;
    } else {
      this.sbIdx = (this.dealerIdx + 1) % n;
      this.bbIdx = (this.dealerIdx + 2) % n;
    }
    this._start();
  }

  get dealerSeat() { return this.players[this.dealerIdx].seat; }
  get sbSeat() { return this.blinds || this.sbOnly ? this.players[this.sbIdx].seat : null; }
  get bbSeat() { return this.blinds ? this.players[this.bbIdx].seat : null; }
  get turnSeat() { return this.finished || this.turnIdx < 0 ? null : this.players[this.turnIdx].seat; }

  player(seat) { return this.players.find((p) => p.seat === seat); }

  _draw() {
    const c = this.deck.shift();
    if (!c) throw new Error('Mazo agotado');
    return c;
  }

  _put(p, amount) {
    const a = Math.min(amount, p.stack);
    p.stack -= a; p.bet += a; p.total += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  _start() {
    const n = this.players.length;
    if (this.sbOnly) {
      const sbP = this.players[this.sbIdx];
      const sbAmt = this._put(sbP, this.sb);
      sbP.lastAction = { type: 'sb', amount: sbAmt };
      this.log.push({ street: 'preflop', seat: sbP.seat, type: 'sb', amount: sbAmt });
      // Los demás deben igualar la SB completa; quien la puso tiene la opción al final, como la BB.
      this.currentBet = this.sb;
      this.minRaise = this.sb;
      this._deal();
      this.turnIdx = this._nextNeeding(this.sbIdx);
      if (this.turnIdx < 0) this._endStreet();
      return;
    }
    if (!this.blinds) {
      // Sin ciegas: nadie pone nada al empezar y habla primero el de la izquierda del botón.
      this.currentBet = 0;
      this.minRaise = this.minBet;
      this._deal();
      this.turnIdx = this._nextNeeding(this.dealerIdx);
      if (this.turnIdx < 0) this._endStreet();
      return;
    }
    const sbP = this.players[this.sbIdx];
    const bbP = this.players[this.bbIdx];
    const sbAmt = this._put(sbP, this.sb);
    sbP.lastAction = { type: 'sb', amount: sbAmt };
    this.log.push({ street: 'preflop', seat: sbP.seat, type: 'sb', amount: sbAmt });
    const bbAmt = this._put(bbP, this.bb);
    bbP.lastAction = { type: 'bb', amount: bbAmt };
    this.log.push({ street: 'preflop', seat: bbP.seat, type: 'bb', amount: bbAmt });
    // Aunque la ciega grande esté all-in por menos, el resto debe igualar la ciega completa.
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    this._deal();
    this.turnIdx = this._nextNeeding(this.bbIdx);
    if (this.turnIdx < 0) this._endStreet();
  }

  /** Reparto: una carta por vez, empezando a la izquierda del botón. */
  _deal() {
    const n = this.players.length;
    for (let round = 0; round < 2; round++) {
      for (let k = 1; k <= n; k++) this.players[(this.dealerIdx + k) % n].hole.push(this._draw());
    }
  }

  _live() { return this.players.filter((p) => !p.folded); }
  _canActPlayers() { return this.players.filter((p) => !p.folded && !p.allIn); }

  _needsAction(p) {
    if (p.folded || p.allIn) return false;
    if (p.acted && p.bet >= this.currentBet) return false;
    // Si todos los demás están all-in (o retirados) y ya cubre la mayor apuesta, no hay nada que decidir.
    const others = this.players.filter((o) => o !== p && !o.folded);
    const othersCanAct = others.some((o) => !o.allIn);
    if (!othersCanAct) {
      const maxOther = Math.max(0, ...others.map((o) => o.bet));
      if (p.bet >= maxOther) return false;
    }
    return true;
  }

  _nextNeeding(fromIdx) {
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (fromIdx + k) % n;
      if (this._needsAction(this.players[i])) return i;
    }
    return -1;
  }

  /** Acciones legales para un asiento (solo si es su turno). */
  legalActions(seat) {
    if (this.finished || this.turnSeat !== seat) return null;
    const p = this.player(seat);
    const toCall = Math.max(0, this.currentBet - p.bet);
    const callAmount = Math.min(toCall, p.stack);
    const maxTo = p.bet + p.stack;
    const othersCanAct = this.players.some((o) => o !== p && !o.folded && !o.allIn);
    const reopened = p.actedAtBet === null || this.currentBet - p.actedAtBet >= this.minRaise;
    const canAggress = othersCanAct && reopened && maxTo > this.currentBet;
    const minTo = Math.min(this.currentBet === 0 ? this.minBet : this.currentBet + this.minRaise, maxTo);
    return {
      toCall,
      callAmount,
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canBet: this.currentBet === 0 && canAggress,
      canRaise: this.currentBet > 0 && canAggress,
      minTo: canAggress ? minTo : null,
      maxTo: canAggress ? maxTo : null,
      canAllIn: p.stack > 0 && (canAggress || p.stack <= toCall),
      stack: p.stack,
      bet: p.bet,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
    };
  }

  /**
   * Ejecuta una acción. action = { type: fold|check|call|bet|raise|allin, amount? }
   * `amount` en bet/raise es el total al que se apuesta ("subir a").
   */
  act(seat, action) {
    if (this.finished) throw new GameError('La mano ya terminó');
    if (this.turnSeat !== seat) throw new GameError('No es tu turno');
    const L = this.legalActions(seat);
    const p = this.player(seat);
    const type = action && action.type;
    let entry;

    switch (type) {
      case 'fold':
        p.folded = true;
        entry = { type: 'fold' };
        break;
      case 'check':
        if (!L.canCheck) throw new GameError('No podés pasar: hay una apuesta por igualar');
        entry = { type: 'check' };
        break;
      case 'call': {
        if (!L.canCall) throw new GameError('No hay apuesta para igualar');
        const a = this._put(p, L.callAmount);
        entry = { type: p.allIn ? 'allin' : 'call', amount: p.bet, added: a };
        break;
      }
      case 'bet':
      case 'raise':
      case 'allin': {
        let to;
        if (type === 'allin') {
          if (!L.canAllIn) throw new GameError('No podés ir all-in en este momento');
          to = p.bet + p.stack;
        } else {
          if (type === 'bet' && !L.canBet) throw new GameError('No podés apostar ahora');
          if (type === 'raise' && !L.canRaise) throw new GameError('No podés subir ahora');
          to = Number(action.amount);
          if (!Number.isInteger(to)) throw new GameError('Importe inválido');
          if (to > L.maxTo) throw new GameError(`No tenés Bs suficientes (máximo Bs ${L.maxTo})`);
          if (to < L.minTo) throw new GameError(`El mínimo es Bs ${L.minTo}`);
        }
        if (to <= this.currentBet) {
          // All-in que no alcanza (o iguala) la apuesta actual: es un call.
          const a = this._put(p, to - p.bet);
          entry = { type: 'allin', amount: p.bet, added: a };
        } else {
          const increment = to - this.currentBet;
          const wasBet = this.currentBet === 0;
          if (increment >= this.minRaise) this.minRaise = increment; // subida completa: reabre la acción
          this.currentBet = to;
          const a = this._put(p, to - p.bet);
          for (const o of this.players) if (o !== p && !o.folded && !o.allIn) o.acted = false;
          entry = { type: p.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: to, added: a };
        }
        break;
      }
      default:
        throw new GameError('Acción desconocida');
    }

    p.acted = true;
    p.actedAtBet = this.currentBet;
    p.lastAction = entry;
    this.actionCount++;
    this.log.push({ street: this.street, seat, ...entry });
    this._afterChange();
    return entry;
  }

  /** Vencimiento del tiempo: pasa si es legal; si no, se retira. */
  timeout(seat) {
    const L = this.legalActions(seat);
    if (!L) return null;
    const e = this.act(seat, { type: L.canCheck ? 'check' : 'fold' });
    e.auto = true;
    return e;
  }

  /** Retira a un jugador fuera de turno (por ejemplo, si abandona la mesa). */
  forceFold(seat) {
    if (this.finished) return;
    const p = this.player(seat);
    if (!p || p.folded) return;
    if (this.turnSeat === seat) { this.act(seat, { type: 'fold' }); return; }
    p.folded = true;
    p.lastAction = { type: 'fold' };
    this.log.push({ street: this.street, seat, type: 'fold', forced: true });
    this.actionCount++;
    this._afterChange(true);
  }

  _afterChange(outOfTurn = false) {
    if (this._live().length === 1) { this._finishUncontested(); return; }
    const anyNeeding = this.players.some((p) => this._needsAction(p));
    if (!anyNeeding) { this._endStreet(); return; }
    if (outOfTurn && this._needsAction(this.players[this.turnIdx])) return;
    this.turnIdx = this._nextNeeding(this.turnIdx);
  }

  /** Devuelve la parte de la apuesta que nadie igualó en esta ronda. */
  _returnUncalled() {
    const sorted = this.players.slice().sort((a, b) => b.bet - a.bet);
    const top = sorted[0];
    const second = sorted[1] ? sorted[1].bet : 0;
    const excess = top.bet - second;
    // Si el que más puso ya se retiró (p. ej. ciega grande forzada), esas fichas quedan en el bote.
    if (excess > 0 && !top.folded) {
      top.bet -= excess; top.total -= excess; top.stack += excess;
      if (top.stack > 0) top.allIn = false;
      this.log.push({ street: this.street, seat: top.seat, type: 'return', amount: excess });
      return { seat: top.seat, amount: excess };
    }
    return null;
  }

  _collect() { for (const p of this.players) p.bet = 0; }

  _dealStreet() {
    this.burned.push(this._draw());
    const k = this.board.length === 0 ? 3 : 1;
    for (let i = 0; i < k; i++) this.board.push(this._draw());
    this.street = STREETS[STREETS.indexOf(this.street) + 1];
  }

  _endStreet() {
    this.uncalled = this._returnUncalled() || this.uncalled || null;
    this._collect();
    if (this._live().length === 1) { this._finishUncontested(); return; }
    if (this.street === 'river') { this._showdown(); return; }
    if (this._canActPlayers().length <= 1) {
      while (this.street !== 'river') this._dealStreet();
      this._showdown();
      return;
    }
    this._dealStreet();
    this.currentBet = 0;
    this.minRaise = this.minBet;
    for (const p of this.players) { p.acted = false; p.actedAtBet = null; if (!p.folded && !p.allIn) p.lastAction = null; }
    this.turnIdx = this._nextNeeding(this.dealerIdx);
    if (this.turnIdx < 0) this._endStreet();
  }

  /**
   * Calcula botes a partir de los aportes. Con `collectedOnly` usa solo lo ya
   * recogido en el centro (sin las apuestas de la ronda actual).
   */
  pots(collectedOnly = false) {
    const contrib = this.players.map((p) => ({ p, c: collectedOnly ? p.total - p.bet : p.total }));
    const levels = [...new Set(contrib.map((x) => x.c).filter((c) => c > 0))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      let amount = 0;
      for (const x of contrib) amount += Math.min(x.c, L) - Math.min(x.c, prev);
      const eligible = contrib.filter((x) => !x.p.folded && x.c >= L).map((x) => x.p.seat);
      const last = pots[pots.length - 1];
      if (last && (eligible.length === 0 || sameSet(last.eligible, eligible))) last.amount += amount;
      else if (last && last.eligible.length === 0) { last.amount += amount; last.eligible = eligible; }
      else pots.push({ amount, eligible });
      prev = L;
    }
    return pots.filter((p) => p.amount > 0);
  }

  /** Orden de asientos empezando por el primero a la izquierda del botón. */
  _positionOrder() {
    const n = this.players.length;
    const out = [];
    for (let k = 1; k <= n; k++) out.push(this.players[(this.dealerIdx + k) % n].seat);
    return out;
  }

  _finishUncontested() {
    const r = this._returnUncalled();
    if (r) this.uncalled = r;
    this._collect();
    const winner = this._live()[0];
    const pots = this.pots();
    const amount = pots.reduce((s, x) => s + x.amount, 0);
    winner.stack += amount;
    this._finish({
      type: 'uncontested',
      pots: pots.map((x) => ({ amount: x.amount, winners: [{ seat: winner.seat, amount: x.amount }] })),
      winners: [{ seat: winner.seat, amount, handName: null }],
      showdown: [],
    });
  }

  _showdown() {
    this._collect();
    const live = this._live();
    const evals = new Map();
    for (const p of live) evals.set(p.seat, bestHand(p.hole.concat(this.board)));
    const order = this._positionOrder();
    const won = new Map();
    const potResults = [];
    for (const pot of this.pots()) {
      let best = -1;
      for (const s of pot.eligible) best = Math.max(best, evals.get(s).value);
      const winners = pot.eligible.filter((s) => evals.get(s).value === best)
        .sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const share = Math.floor(pot.amount / winners.length);
      let rest = pot.amount - share * winners.length;
      const pr = { amount: pot.amount, winners: [] };
      for (const s of winners) {
        // Las fichas sobrantes van, de a una, al ganador más cercano a la izquierda del botón.
        const amt = share + (rest > 0 ? 1 : 0);
        if (rest > 0) rest--;
        this.player(s).stack += amt;
        won.set(s, (won.get(s) || 0) + amt);
        pr.winners.push({ seat: s, amount: amt, handName: evals.get(s).name });
      }
      potResults.push(pr);
    }
    this._finish({
      type: 'showdown',
      pots: potResults,
      winners: [...won.entries()].map(([seat, amount]) => ({ seat, amount, handName: evals.get(seat).name })),
      showdown: live.map((p) => ({
        seat: p.seat, cards: p.hole.slice(), handName: evals.get(p.seat).name,
        bestCards: evals.get(p.seat).cards,
      })),
    });
  }

  _finish(result) {
    this.finished = true;
    this.turnIdx = -1;
    this.result = { ...result, board: this.board.slice(), uncalled: this.uncalled || null };
  }

  /** Fichas totales en juego (pilas + lo apostado mientras la mano sigue abierta). */
  totalChips() {
    return this.players.reduce((s, p) => s + p.stack + (this.finished ? 0 : p.total), 0);
  }
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

module.exports = { Hand, GameError, STREETS };
