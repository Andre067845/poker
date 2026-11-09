'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { io: ioc } = require('socket.io-client');
const { createApp } = require('../server/app');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cliente HTTP con su propia cookie (= una sesión de navegador independiente). */
function client(base) {
  let cookie = '';
  async function req(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json();
    return { status: res.status, data };
  }
  return {
    get: (p) => req('GET', p), post: (p, b) => req('POST', p, b),
    get cookie() { return cookie; },
    socket() {
      const s = ioc(base, { extraHeaders: { cookie, origin: base }, transports: ['websocket'], forceNew: true, reconnection: false });
      s.state = null;
      s.events = [];
      s.on('table:state', (st) => { s.state = st; });
      s.on('table:event', (e) => s.events.push(e));
      s.call = (ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));
      s.ready = new Promise((resolve, reject) => { s.on('connect', resolve); s.on('connect_error', reject); });
      return s;
    },
  };
}

async function until(fn, ms = 5000, label = 'condición') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); }
  throw new Error(`Tiempo agotado esperando: ${label}`);
}

const rid = () => crypto.randomUUID();

test('partida completa entre dos sesiones independientes', async (t) => {
  const inst = createApp({
    dbFile: ':memory:', resultDelayMs: 150, graceMs: 1200, sweepMs: 200,
    turnMsOverride: 1500, exposeResetLinks: true,
  });
  const port = await inst.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const sockets = [];
  t.after(async () => { for (const s of sockets) s.close(); await inst.close(); });

  const alice = client(base);
  const bob = client(base);
  const carol = client(base);

  // ---------- registro, códigos únicos, login y recuperación
  let r = await alice.post('/api/auth/register', { username: 'alicia', email: 'alicia@example.com', password: 'secreto123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.user.code, /^PKR-[A-Z2-9]{6}$/);
  const aliceUser = r.data.user;
  r = await bob.post('/api/auth/register', { username: 'beto', email: 'beto@example.com', password: 'clave-bob-1' });
  const bobUser = r.data.user;
  assert.notEqual(aliceUser.code, bobUser.code);
  r = await carol.post('/api/auth/register', { username: 'carola', email: 'carola@example.com', password: 'clave-carol' });
  r = await bob.post('/api/auth/register', { username: 'beto', email: 'otro@example.com', password: 'clave-bob-1' });
  assert.equal(r.status, 409);
  r = await client(base).post('/api/auth/login', { login: 'beto', password: 'incorrecta' });
  assert.equal(r.status, 401);
  r = await client(base).post('/api/auth/forgot', { email: 'beto@example.com' });
  const token = new URL(r.data.devLink).searchParams.get('token');
  r = await client(base).post('/api/auth/reset', { token, password: 'nueva-clave-bob' });
  assert.equal(r.status, 200);
  r = await client(base).post('/api/auth/reset', { token, password: 'otra-clave-bob' });
  assert.equal(r.status, 400, 'el enlace no se puede reutilizar');
  r = await bob.get('/api/me');
  assert.equal(r.data.user, null, 'el cambio de contraseña cierra las sesiones');
  r = await bob.post('/api/auth/login', { login: 'beto@example.com', password: 'nueva-clave-bob' });
  assert.equal(r.status, 200);

  // ---------- crear mesa con validaciones
  const settings = { name: 'Viernes', maxPlayers: 6, startingStack: 1000, smallBlind: 5, bigBlind: 10, turnSeconds: 30, allowRebuy: true, maxBuyin: 2000 };
  r = await alice.post('/api/tables', { ...settings, bigBlind: 4 });
  assert.equal(r.status, 400);
  r = await alice.post('/api/tables', { ...settings, startingStack: 50 });
  assert.equal(r.status, 400);
  r = await alice.post('/api/tables', { ...settings, maxPlayers: 10 });
  assert.equal(r.status, 400);
  r = await alice.post('/api/tables', settings);
  assert.equal(r.status, 200);
  const code = r.data.table.code;

  r = await bob.get('/api/tables');
  assert.equal(r.data.tables.length, 0, 'bob todavía no fue invitado');

  // ---------- invitación: vista previa
  r = await bob.get(`/api/tables/${code}`);
  assert.equal(r.data.table.name, 'Viernes');
  assert.equal(r.data.table.freeSeats, 6);
  assert.equal(r.data.table.allowRebuy, true);
  r = await bob.get('/api/tables');
  assert.equal(r.data.tables.length, 1, 'ahora aparece en su lobby');

  // ---------- sockets
  const sa = alice.socket(); const sb = bob.socket();
  sockets.push(sa, sb);
  await Promise.all([sa.ready, sb.ready]);
  assert.ok((await sa.call('table:join', { code })).ok);
  assert.ok((await sb.call('table:join', { code })).ok);

  let ack = await sa.call('table:sit', { amount: 1000, requestId: 'a-sit-1234' });
  assert.ok(ack.ok, ack.error);
  ack = await sa.call('table:sit', { amount: 1000, requestId: 'a-sit-1234' });
  assert.ok(ack.ok, 'reintento idempotente');
  ack = await sa.call('table:sit', { amount: 1000, requestId: 'a-sit-otra' });
  assert.equal(ack.ok, false, 'una cuenta no puede ocupar dos asientos');
  ack = await sb.call('table:sit', { amount: 5000, requestId: 'b-sit-1234' });
  assert.equal(ack.ok, false, 'importe fuera de rango');
  ack = await sb.call('table:sit', { amount: 800, requestId: 'b-sit-5678' });
  assert.ok(ack.ok, ack.error);

  ack = await sb.call('table:start');
  assert.equal(ack.ok, false, 'solo el creador inicia');
  ack = await sa.call('table:start');
  assert.equal(ack.ok, false, 'faltan jugadores listos');
  await sa.call('table:ready', { ready: true });
  await sb.call('table:ready', { ready: true });
  await until(() => sa.state && sa.state.canStart, 2000, 'canStart');
  ack = await sa.call('table:start');
  assert.ok(ack.ok, ack.error);

  await until(() => sa.state.hand && sb.state.hand, 2000, 'mano iniciada');
  const aSeat = sa.state.mySeat; const bSeat = sb.state.mySeat;
  assert.notEqual(aSeat, bSeat);

  // privacidad de cartas
  const aMine = sa.state.seats[aSeat].cards;
  assert.equal(aMine.length, 2);
  assert.equal(sa.state.seats[bSeat].cards, null, 'no ve cartas rivales');
  assert.equal(sb.state.seats[aSeat].cards, null);
  assert.equal(sb.state.seats[bSeat].cards.length, 2);
  assert.ok(!JSON.stringify(sb.state).includes(`"${aMine[0]}"`) || sb.state.hand.board.includes(aMine[0]), 'las cartas de A no viajan a B');

  // fuera de turno / turno vencido / duplicados
  const turnSock = () => (sa.state.hand.turnSeat === aSeat ? sa : sb);
  const otherSock = () => (turnSock() === sa ? sb : sa);
  ack = await otherSock().call('table:action', { type: 'check', turnId: sa.state.hand.turnId, actionId: rid() });
  assert.equal(ack.ok, false);
  assert.match(ack.error, /turno/);
  ack = await turnSock().call('table:action', { type: 'call', turnId: sa.state.hand.turnId - 1, actionId: rid() });
  assert.equal(ack.ok, false, 'turnId viejo');

  // recarga pedida durante la mano queda pendiente
  ack = await sb.call('table:rebuy', { amount: 300, requestId: 'b-rebuy-0001' });
  assert.ok(ack.ok, ack.error);
  ack = await sb.call('table:rebuy', { amount: 300, requestId: 'b-rebuy-0001' });
  assert.ok(ack.ok);
  await until(() => sb.state.seats[bSeat].pendingRebuy === 300, 2000, 'recarga pendiente');

  // acción duplicada con el mismo actionId
  const st = turnSock().state;
  const dupId = rid();
  const firstSock = turnSock();
  ack = await firstSock.call('table:action', { type: 'call', turnId: st.hand.turnId, actionId: dupId });
  assert.ok(ack.ok, ack.error);
  ack = await firstSock.call('table:action', { type: 'call', turnId: st.hand.turnId, actionId: dupId });
  assert.ok(ack.duplicate, 'acción duplicada ignorada');

  // ---------- reconexión a mitad de mano
  const cardsBefore = sb.state.seats[bSeat].cards;
  sb.close();
  await until(() => sa.state.seats[bSeat] && !sa.state.seats[bSeat].connected, 2000, 'B desconectado');
  const sb2 = bob.socket(); sockets.push(sb2);
  await sb2.ready;
  ack = await sb2.call('table:join', { code });
  assert.ok(ack.ok);
  assert.equal(ack.state.mySeat, bSeat, 'vuelve al mismo asiento');
  if (ack.state.hand) assert.deepEqual(ack.state.seats[bSeat].cards, cardsBefore, 'mismas cartas');
  await until(() => sa.state.seats[bSeat].connected, 2000, 'B reconectado');

  // ---------- jugar varias manos pasando/igualando
  const socks = { [aSeat]: sa, [bSeat]: sb2 };
  async function playHand(stopAfter = 100) {
    const startNum = sa.state.hand ? sa.state.hand.number : null;
    for (let i = 0; i < stopAfter; i++) {
      const s = sa.state;
      if (!s.hand || s.hand.number !== startNum) return;
      const seat = s.hand.turnSeat;
      const sock = socks[seat];
      await until(() => sock.state.hand && sock.state.hand.turnId === s.hand.turnId, 2000, 'estado sincronizado');
      const L = sock.state.hand.legal;
      const type = L.canCheck ? 'check' : 'call';
      const a = await sock.call('table:action', { type, turnId: sock.state.hand.turnId, actionId: rid() });
      if (!a.ok && !/cambió|turno/.test(a.error)) throw new Error(a.error);
      await sleep(30);
    }
  }
  const handNo = sa.state.hand.number;
  await playHand();
  await until(() => sa.state.lastResult && sa.state.lastResult.handNumber === handNo, 3000, 'resultado mano 1');
  assert.ok(sa.state.lastResult.winners.length >= 1);
  // la recarga se aplicó al terminar la mano
  await until(() => sb2.state.seats[bSeat] && sb2.state.seats[bSeat].pendingRebuy === 0, 2000, 'recarga aplicada');

  for (let k = 0; k < 3; k++) {
    await until(() => sa.state.hand && sa.state.hand.number > handNo + k, 3000, `mano ${handNo + k + 1}`);
    await playHand();
  }

  // ---------- vencimiento de turno: nadie actúa → pasa o se retira automáticamente
  await until(() => sa.state.hand, 3000, 'siguiente mano');
  const timedHand = sa.state.hand.number;
  await until(() => sa.state.lastResult && sa.state.lastResult.handNumber === timedHand, 8000, 'mano resuelta por tiempo');
  assert.ok(sa.events.some((e) => e.kind === 'action' && e.auto), 'hubo acción automática');

  // ---------- recarga no permitida por encima del tope
  ack = await sa.call('table:rebuy', { amount: 999999, requestId: 'a-rebuy-big' });
  assert.equal(ack.ok, false);

  // ---------- historial: carol no puede verlo
  const sessionId = sa.state.sessionId;
  r = await carol.get(`/api/history/${sessionId}`);
  assert.equal(r.status, 404);
  r = await carol.get('/api/history');
  assert.equal(r.data.sessions.length, 0);

  // ---------- B se desconecta y pierde el asiento tras el período de gracia
  sb2.close();
  await until(() => !sa.state.seats[bSeat], 10000, 'asiento liberado tras gracia');

  r = await alice.get(`/api/history/${sessionId}`);
  assert.equal(r.status, 200);
  const detail = r.data.session;
  const pa = detail.players.find((p) => p.code === aliceUser.code);
  const pb = detail.players.find((p) => p.code === bobUser.code);
  assert.equal(pa.initial, 1000);
  assert.equal(pb.initial, 800);
  assert.equal(pb.reloads.length, 1, 'una sola recarga pese al reintento');
  assert.equal(pb.reloads[0].amount, 300);
  assert.equal(pb.totalLoaded, 1100);
  assert.equal(pb.remaining, 0);
  assert.ok(pb.withdrawn >= 0);
  assert.equal(pa.balance + pb.balance, 0, 'conservación: los balances suman cero');
  assert.equal(pa.withdrawn + pa.remaining + pb.withdrawn + pb.remaining, 1000 + 1100);
  assert.ok(detail.hands.length >= 5);
  assert.deepEqual(detail.hands.map((h) => h.number), detail.hands.map((_, i) => i + 1));

  // ---------- A se levanta: se cierra la sesión
  ack = await sa.call('table:leave');
  assert.ok(ack.ok);
  r = await alice.get(`/api/history/${sessionId}`);
  assert.ok(r.data.session.endedAt, 'sesión cerrada al quedar vacía');
  const fin = r.data.session.players;
  assert.equal(fin.reduce((s, p) => s + p.balance, 0), 0);
  r = await bob.get('/api/history');
  assert.equal(r.data.sessions.length, 1);
});

test('reinicio del servidor: se conservan asientos y fichas', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-'));
  const dbFile = path.join(dir, 'p.db');
  const cfg = { dbFile, resultDelayMs: 100000, graceMs: 60000, sweepMs: 1000 };
  let inst = createApp(cfg);
  let port = await inst.listen(0);
  let base = `http://127.0.0.1:${port}`;
  const a = client(base); const b = client(base);
  await a.post('/api/auth/register', { username: 'ana', email: 'ana@example.com', password: '12345678' });
  await b.post('/api/auth/register', { username: 'bruno', email: 'bruno@example.com', password: '12345678' });
  const code = (await a.post('/api/tables', { name: 'R', maxPlayers: 2, startingStack: 500, smallBlind: 1, bigBlind: 2, turnSeconds: 30, allowRebuy: false, maxBuyin: 500 })).data.table.code;
  let sa = a.socket(); let sb = b.socket();
  await Promise.all([sa.ready, sb.ready]);
  await sa.call('table:join', { code }); await sb.call('table:join', { code });
  await sa.call('table:sit', { amount: 500, requestId: 'ana-sit-0001' });
  await sb.call('table:sit', { amount: 300, requestId: 'bru-sit-0001' });
  await sa.call('table:ready', { ready: true }); await sb.call('table:ready', { ready: true });
  assert.ok((await sa.call('table:start')).ok);
  await until(() => sa.state && sa.state.hand, 2000, 'mano');
  // la mano queda a medias y el servidor se reinicia
  sa.close(); sb.close();
  await inst.close();

  inst = createApp(cfg);
  port = await inst.listen(0);
  base = `http://127.0.0.1:${port}`;
  const a2 = client(base);
  await a2.post('/api/auth/login', { login: 'ana', password: '12345678' });
  sa = a2.socket(); await sa.ready;
  const ack = await sa.call('table:join', { code });
  assert.ok(ack.ok);
  const seats = ack.state.seats.filter(Boolean);
  assert.equal(seats.length, 2);
  assert.equal(seats.reduce((s, x) => s + x.stack, 0), 800, 'las fichas vuelven a la pila previa a la mano anulada');
  assert.equal(ack.state.gameStarted, true);
  sa.close();
  await inst.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
