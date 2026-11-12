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
    turnMsOverride: 1500,
  });
  const port = await inst.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const sockets = [];
  t.after(async () => { for (const s of sockets) s.close(); await inst.close(); });

  const alice = client(base);
  const bob = client(base);
  const carol = client(base);

  // ---------- registro, códigos únicos, login y recuperación
  let r = await alice.post('/api/auth/register', { username: 'alicia', password: 'secreto123' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.user.code, /^PKR-[A-Z2-9]{6}$/);
  const aliceUser = r.data.user;
  r = await bob.post('/api/auth/register', { username: 'beto', password: 'clave-bob-1' });
  const bobUser = r.data.user;
  const bobRecovery = r.data.recoveryCode;
  assert.ok(!('email' in bobUser));
  assert.notEqual(aliceUser.code, bobUser.code);
  r = await carol.post('/api/auth/register', { username: 'carola', password: 'clave-carol' });
  r = await bob.post('/api/auth/register', { username: 'BETO', password: 'clave-bob-1' });
  assert.equal(r.status, 409, 'usuario repetido (sin distinguir mayúsculas)');
  r = await client(base).post('/api/auth/login', { username: 'beto', password: 'incorrecta' });
  assert.equal(r.status, 401);
  // recuperación con el código mostrado al registrarse (no hay correo)
  r = await client(base).post('/api/auth/recover', { username: 'beto', recoveryCode: 'AAAA-BBBB-CCCC-DDDD', password: 'nueva-clave-bob' });
  assert.equal(r.status, 401, 'código incorrecto');
  r = await client(base).post('/api/auth/recover', { username: 'beto', recoveryCode: bobRecovery.toLowerCase().replace(/-/g, ' '), password: 'nueva-clave-bob' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.recoveryCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  assert.notEqual(r.data.recoveryCode, bobRecovery);
  r = await client(base).post('/api/auth/recover', { username: 'beto', recoveryCode: bobRecovery, password: 'otra-clave-bob' });
  assert.equal(r.status, 401, 'el código usado deja de servir');
  r = await bob.get('/api/me');
  assert.equal(r.data.user, null, 'el cambio de contraseña cierra las sesiones');
  r = await bob.post('/api/auth/login', { username: 'beto', password: 'nueva-clave-bob' });
  assert.equal(r.status, 200);
  r = await bob.post('/api/auth/recovery-code', { password: 'mala' });
  assert.equal(r.status, 401);
  r = await bob.post('/api/auth/recovery-code', { password: 'nueva-clave-bob' });
  assert.equal(r.status, 200);
  assert.ok(r.data.recoveryCode);

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

  // cada uno ve su propio juego
  assert.ok(sa.state.hand.myHand && sa.state.hand.myHand.name, 'A ve su juego');
  assert.ok(sb.state.hand.myHand && sb.state.hand.myHand.name, 'B ve su juego');
  assert.ok(sa.state.hand.myHand.core.every((c) => sa.state.seats[aSeat].cards.includes(c) || sa.state.hand.board.includes(c)), 'solo con sus cartas y las de la mesa');
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
  await a.post('/api/auth/register', { username: 'ana', password: '12345678' });
  await b.post('/api/auth/register', { username: 'bruno', password: '12345678' });
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
  await a2.post('/api/auth/login', { username: 'ana', password: '12345678' });
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

test('mostrar cartas voluntariamente y chat de la mesa', async (t) => {
  const inst = createApp({ dbFile: ':memory:', resultDelayMs: 60000, graceMs: 60000, sweepMs: 1000 });
  const port = await inst.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const a = client(base); const b = client(base);
  await a.post('/api/auth/register', { username: 'sofi', password: '12345678' });
  await b.post('/api/auth/register', { username: 'tomi', password: '12345678' });
  const code = (await a.post('/api/tables', { name: 'Chat', maxPlayers: 4, startingStack: 500, smallBlind: 5, bigBlind: 10, turnSeconds: 30, allowRebuy: false, maxBuyin: 500 })).data.table.code;
  const sa = a.socket(); const sb = b.socket();
  t.after(async () => { sa.close(); sb.close(); await inst.close(); });
  const chatA = []; const chatB = [];
  sa.on('table:chat', (m) => chatA.push(m)); sb.on('table:chat', (m) => chatB.push(m));
  await Promise.all([sa.ready, sb.ready]);
  const joinA = await sa.call('table:join', { code });
  assert.deepEqual(joinA.quickChat, ['Check de caballero', 'Te recomiendo irte', 'Te chingué', 'Farol histórico', 'Farol', '¿Vas de farol, verdad?', 'Cagón', 'Mete gay']);
  assert.ok(joinA.quickChat.includes('¿Vas de farol, verdad?'));
  await sb.call('table:join', { code });

  // chat rápido y libre
  let ack = await sb.call('table:chat', { quick: 5 });
  assert.ok(ack.ok, ack.error);
  ack = await sa.call('table:chat', { text: '  <b>hola</b> mesa  ' });
  assert.ok(ack.ok);
  await until(() => chatA.length === 2 && chatB.length === 2, 2000, 'mensajes de chat');
  assert.equal(chatA[0].text, '¿Vas de farol, verdad?');
  assert.equal(chatA[0].username, 'tomi');
  assert.equal(chatB[1].text, '<b>hola</b> mesa', 'el texto viaja tal cual; el cliente lo escapa al mostrarlo');
  assert.equal((await sa.call('table:chat', { text: '' })).ok, false);
  assert.equal((await sa.call('table:chat', { text: 'x'.repeat(201) })).ok, false);
  assert.equal((await sa.call('table:chat', { quick: 99 })).ok, false);
  // anti-spam
  let blocked = false;
  for (let i = 0; i < 8; i++) if (!(await sa.call('table:chat', { text: `spam ${i}` })).ok) blocked = true;
  assert.ok(blocked, 'limita mensajes muy seguidos');
  // quien entra después recibe el historial reciente
  const sb2 = b.socket(); await sb2.ready;
  const j2 = await sb2.call('table:join', { code });
  assert.ok(j2.chat.length >= 2);
  sb2.close();

  // mano: el primero en hablar se retira, el otro gana sin showdown
  await sa.call('table:sit', { amount: 500, requestId: 'sofi-sit-01' });
  await sb.call('table:sit', { amount: 500, requestId: 'tomi-sit-01' });
  await sa.call('table:ready', { ready: true }); await sb.call('table:ready', { ready: true });
  assert.ok((await sa.call('table:start')).ok);
  await until(() => sa.state && sa.state.hand && sb.state && sb.state.hand, 2000, 'mano');
  assert.equal((await sa.call('table:show')).ok, false, 'no se puede mostrar durante la mano');
  const turn = sa.state.hand.turnSeat === sa.state.mySeat ? sa : sb;
  const winner = turn === sa ? sb : sa;
  const myCards = winner.state.seats[winner.state.mySeat].cards;
  ack = await turn.call('table:action', { type: 'fold', turnId: turn.state.hand.turnId, actionId: rid() });
  assert.ok(ack.ok, ack.error);
  await until(() => turn.state.lastResult && !turn.state.hand && winner.state.lastResult, 2000, 'resultado');
  assert.equal(turn.state.lastResult.type, 'uncontested');
  assert.equal(turn.state.seats[winner.state.mySeat].cards, null, 'sin mostrar, las cartas siguen ocultas');
  assert.equal(winner.state.canShowCards, true);
  ack = await winner.call('table:show');
  assert.ok(ack.ok, ack.error);
  await until(() => turn.state.seats[winner.state.mySeat].cards, 2000, 'cartas reveladas');
  assert.deepEqual(turn.state.seats[winner.state.mySeat].cards, myCards);
  assert.equal(winner.state.canShowCards, false);
  // el que se retiró también puede mostrar las suyas
  assert.equal(turn.state.canShowCards, true);
  assert.ok((await turn.call('table:show')).ok);
  await until(() => winner.state.seats[turn.state.mySeat].cards, 2000, 'cartas del retirado');
  // queda registrado en el historial
  const r = await a.get(`/api/history/${sa.state.sessionId}`);
  assert.equal(r.data.session.hands[0].shown.length, 2);
});

test('respaldo externo: los datos sobreviven a un servidor sin disco', async () => {
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  const { restoreSnapshot } = require('../server/persist');
  // almacenamiento falso que imita a Postgres
  let stored = null; let saves = 0;
  const store = { async load() { return stored; }, async save(b) { stored = Buffer.from(b); saves++; } };
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-a-'));
  let inst = createApp({ dbFile: path.join(dir1, 'p.db'), store, backupMs: 50 });
  let base = `http://127.0.0.1:${await inst.listen(0)}`;
  const c = client(base);
  let r = await c.post('/api/auth/register', { username: 'persistente', password: '12345678' });
  const code = r.data.user.code;
  await until(() => saves > 0, 3000, 'copia periódica');
  await c.post('/api/tables', { name: 'Persistida', maxPlayers: 2, startingStack: 500, smallBlind: 1, bigBlind: 2, turnSeconds: 30, allowRebuy: false, maxBuyin: 500 });
  await inst.close(); // copia final al apagarse
  fs.rmSync(dir1, { recursive: true, force: true }); // el "disco" se pierde

  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-b-'));
  const file2 = path.join(dir2, 'p.db');
  assert.equal(await restoreSnapshot(store, file2), true);
  inst = createApp({ dbFile: file2, store, backupMs: 50 });
  base = `http://127.0.0.1:${await inst.listen(0)}`;
  const c2 = client(base);
  r = await c2.post('/api/auth/login', { username: 'persistente', password: '12345678' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.code, code, 'mismo código de jugador');
  r = await c2.get('/api/tables');
  assert.equal(r.data.tables[0].name, 'Persistida');
  await inst.close();
  fs.rmSync(dir2, { recursive: true, force: true });
});

test('no se puede entrar sin cuenta (sin modo invitado)', async () => {
  const inst = createApp({ dbFile: ':memory:' });
  const base = `http://127.0.0.1:${await inst.listen(0)}`;
  const r = await client(base).post('/api/auth/guest', { username: 'Pepe' });
  assert.equal(r.status, 404);
  const me = await client(base).get('/api/tables');
  assert.equal(me.status, 401, 'sin sesión no se ve nada');
  await inst.close();
});

test('liquidación: quién le paga a quién', () => {
  const { settle } = require('../server/history');
  const P = (username, balance) => ({ username, code: username, balance });
  // André cargó 30 y quedó con 100 (+70); Beto -50; Caro -20
  const pay = settle([P('André', 70), P('Beto', -50), P('Caro', -20)]);
  assert.deepEqual(pay.map((x) => [x.from, x.to, x.amount]), [['Beto', 'André', 50], ['Caro', 'André', 20]]);
  const pay2 = settle([P('A', 60), P('B', 40), P('C', -70), P('D', -30)]);
  const total = (who, key) => pay2.filter((x) => x[key] === who).reduce((a, x) => a + x.amount, 0);
  assert.equal(total('A', 'to'), 60);
  assert.equal(total('B', 'to'), 40);
  assert.equal(total('C', 'from'), 70);
  assert.equal(total('D', 'from'), 30);
  assert.deepEqual(settle([P('A', 0), P('B', 0)]), []);
});

test('mesa sin ciegas, personaje y cuentas en vivo', async (t) => {
  const inst = createApp({ dbFile: ':memory:', resultDelayMs: 60000, graceMs: 60000, sweepMs: 1000 });
  const base = `http://127.0.0.1:${await inst.listen(0)}`;
  const a = client(base); const b = client(base);
  await a.post('/api/auth/register', { username: 'andre', password: '12345678' });
  await b.post('/api/auth/register', { username: 'beto', password: '12345678' });

  // personaje: solo valores de la lista
  let r = await a.get('/api/me');
  assert.ok(r.data.avatarOptions.hat.includes('vaquero'));
  assert.equal(r.data.user.avatarSet, false);
  r = await a.post('/api/avatar', { skin: r.data.avatarOptions.skin[4], hat: 'vaquero', glasses: 'sol', beard: 'bigote', hair: 'rulos', hairColor: '<script>' });
  assert.equal(r.status, 200);
  assert.equal(r.data.avatar.hat, 'vaquero');
  assert.notEqual(r.data.avatar.hairColor, '<script>', 'valores inventados se descartan');
  r = await a.get('/api/me');
  assert.equal(r.data.user.avatarSet, true);

  // mesa sin ciegas
  r = await a.post('/api/tables', { name: 'Sin ciegas', maxPlayers: 4, startingStack: 30, useBlinds: false, turnSeconds: 30, allowRebuy: true, maxBuyin: 200 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.table.useBlinds, false);
  assert.equal(r.data.table.bigBlind, 0);
  const code = r.data.table.code;
  const sa = a.socket(); const sb = b.socket();
  t.after(async () => { sa.close(); sb.close(); await inst.close(); });
  await Promise.all([sa.ready, sb.ready]);
  await sa.call('table:join', { code }); await sb.call('table:join', { code });
  assert.ok((await sa.call('table:sit', { amount: 30, requestId: 'andre-sit-1' })).ok);
  assert.ok((await sb.call('table:sit', { amount: 30, requestId: 'beto-sit-01' })).ok);
  await until(() => sb.state && sb.state.seats.filter(Boolean).length === 2, 2000, 'dos sentados');
  assert.equal(sb.state.seats[sa.state.mySeat].avatar.hat, 'vaquero', 'los demás ven el personaje');
  // recargas antes de empezar: 20, 50, 10
  for (const [amt, id] of [[20, 'r-0000001'], [50, 'r-0000002'], [10, 'r-0000003']]) {
    assert.ok((await sa.call('table:rebuy', { amount: amt, requestId: id })).ok);
  }
  await sa.call('table:ready', { ready: true }); await sb.call('table:ready', { ready: true });
  assert.ok((await sa.call('table:start')).ok);
  await until(() => sa.state.hand, 2000, 'mano');
  assert.equal(sa.state.hand.sbSeat, null);
  assert.equal(sa.state.hand.totalPot, 0, 'nadie pone ciegas');
  const first = sa.state.hand.turnSeat === sa.state.mySeat ? sa : sb;
  await until(() => first.state.hand && first.state.hand.legal, 2000, 'estado del primero');
  assert.equal(first.state.hand.legal.minTo, 1);
  // B se retira enseguida si le toca; si no, A apuesta y B se retira
  if (first === sa) {
    await sa.call('table:action', { type: 'bet', amount: 5, turnId: sa.state.hand.turnId, actionId: rid() });
    await until(() => sb.state.hand && sb.state.hand.turnSeat === sb.state.mySeat, 2000, 'turno B');
  }
  await until(() => sb.state.hand && sb.state.hand.turnSeat === sb.state.mySeat && sb.state.hand.legal, 2000, 'turno de B sincronizado');
  const f = await sb.call('table:action', { type: 'fold', turnId: sb.state.hand.turnId, actionId: rid() });
  assert.ok(f.ok, f.error);
  await until(() => sa.state.lastResult, 2000, 'resultado');

  // cuentas en vivo, visibles para todos los de la mesa
  const acc = (await sb.call('table:accounts')).accounts;
  const pa = acc.players.find((p) => p.username === 'andre');
  const pb = acc.players.find((p) => p.username === 'beto');
  assert.equal(pa.initial, 30);
  assert.deepEqual(pa.reloads.map((x) => x.amount), [20, 50, 10]);
  assert.equal(pa.reloadCount, 3);
  assert.equal(pa.totalLoaded, 110);
  assert.equal(pa.balance + pb.balance, 0);
  if (pb.balance < 0) assert.deepEqual(acc.payments.map((x) => [x.from, x.to, x.amount]), [['beto', 'andre', -pb.balance]]);

  // al cerrar la mesa todos reciben las cuentas finales
  const closed = new Promise((res) => sb.once('table:closed', res));
  assert.ok((await sa.call('table:close')).ok);
  const msg = await closed;
  assert.equal(msg.accounts.players.length, 2);
  r = await b.get(`/api/history/${acc.sessionId}`);
  assert.ok(Array.isArray(r.data.session.payments));
  assert.equal(r.data.session.players.find((p) => p.username === 'andre').reloadCount, 3);
});

test('entrar solo con nombre y recibir las cuentas tras cada mano', async (t) => {
  const inst = createApp({ dbFile: ':memory:', resultDelayMs: 60000, graceMs: 60000, sweepMs: 1000 });
  const base = `http://127.0.0.1:${await inst.listen(0)}`;
  const a = client(base); const b = client(base);
  let r = await a.post('/api/auth/name', { username: 'Andre' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await client(base).post('/api/auth/name', { username: 'andre' });
  assert.equal(r.status, 200, 'mientras no esté jugando, se puede volver a entrar con el mismo nombre');
  assert.equal(r.data.user.username, 'Andre');
  r = await b.post('/api/auth/name', { username: 'Beto' });
  assert.equal(r.status, 200);
  r = await a.get('/api/me');
  assert.equal(r.data.user.username, 'Andre', 'queda guardado en el navegador');
  const code = (await a.post('/api/tables', { name: 'Viernes', maxPlayers: 4, startingStack: 30, useBlinds: false, turnSeconds: 30, allowRebuy: true, maxBuyin: 300 })).data.table.code;
  const sa = a.socket(); const sb = b.socket();
  t.after(async () => { sa.close(); sb.close(); await inst.close(); });
  const accA = []; const accB = [];
  sa.on('table:accounts', (x) => accA.push(x)); sb.on('table:accounts', (x) => accB.push(x));
  await Promise.all([sa.ready, sb.ready]);
  await sa.call('table:join', { code }); await sb.call('table:join', { code });
  r = await client(base).post('/api/auth/name', { username: 'Andre' });
  assert.equal(r.status, 409, 'si está conectado, nadie puede entrar con su nombre');
  await sa.call('table:sit', { amount: 30, requestId: 'andre-sit-1' });
  await sb.call('table:sit', { amount: 30, requestId: 'beto-sit-01' });
  await sb.call('table:rebuy', { amount: 20, requestId: 'beto-rb-001' });
  await until(() => accB.some((x) => x.players.some((p) => p.username === 'Beto' && p.reloadCount === 1)), 2000, 'cuentas con la carga');
  assert.equal(accA[accA.length - 1].tableName, 'Viernes');
  await sa.call('table:ready', { ready: true }); await sb.call('table:ready', { ready: true });
  await sa.call('table:start');
  await until(() => sa.state && sa.state.hand && sb.state && sb.state.hand, 2000, 'mano');
  const n = accA.length;
  const turn = sa.state.hand.turnSeat === sa.state.mySeat ? sa : sb;
  await until(() => turn.state.hand && turn.state.hand.legal, 2000, 'turno');
  await turn.call('table:action', { type: 'fold', turnId: turn.state.hand.turnId, actionId: rid() });
  await until(() => accA.length > n, 2000, 'cuentas tras la mano');
  const last = accA[accA.length - 1];
  assert.equal(last.players.reduce((x, p) => x + p.balance, 0), 0);
  // el último que se levanta cierra la sesión: llega la cuenta final
  await sa.call('table:leave'); await sb.call('table:leave');
  await until(() => accB.some((x) => x.endedAt), 2000, 'cuenta final');
});

test('mesa con solo SB', async () => {
  const inst = createApp({ dbFile: ':memory:' });
  const base = `http://127.0.0.1:${await inst.listen(0)}`;
  const a = client(base);
  await a.post('/api/auth/name', { username: 'Andre' });
  let r = await a.post('/api/tables', { name: 'SB', maxPlayers: 6, startingStack: 5, blindMode: 'sb', smallBlind: 1, turnSeconds: 30, allowRebuy: true, maxBuyin: 100 });
  assert.equal(r.status, 400, 'entrada mínima: 10 SB');
  r = await a.post('/api/tables', { name: 'SB', maxPlayers: 6, startingStack: 30, blindMode: 'sb', smallBlind: 1, turnSeconds: 30, allowRebuy: true, maxBuyin: 100 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.table.blindMode, 'sb');
  assert.equal(r.data.table.smallBlind, 1);
  assert.equal(r.data.table.bigBlind, 0);
  await inst.close();
});

test('bono 7-2: quien gana con 7 y 2 cobra Bs 1 de cada jugador', async (t) => {
  const inst = createApp({ dbFile: ':memory:', resultDelayMs: 60000, graceMs: 60000, sweepMs: 1000 });
  const base = `http://127.0.0.1:${await inst.listen(0)}`;
  const cs = [client(base), client(base), client(base)];
  const names = ['Andre', 'Benja', 'Caro'];
  for (let i = 0; i < 3; i++) await cs[i].post('/api/auth/name', { username: names[i] });
  let r = await cs[0].post('/api/tables', { name: 'Siete dos', maxPlayers: 4, startingStack: 30, blindMode: 'sb', smallBlind: 1, turnSeconds: 30, allowRebuy: false, maxBuyin: 100, bonus72: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.table.bonus72, true);
  const code = r.data.table.code;
  const ss = cs.map((c) => c.socket());
  t.after(async () => { ss.forEach((s) => s.close()); await inst.close(); });
  await Promise.all(ss.map((s) => s.ready));
  for (let i = 0; i < 3; i++) { await ss[i].call('table:join', { code }); await ss[i].call('table:sit', { amount: 30, requestId: `sit-7-2-00${i}` }); await ss[i].call('table:ready', { ready: true }); }
  assert.ok((await ss[0].call('table:start')).ok);
  await until(() => ss.every((s) => s.state && s.state.hand), 2000, 'mano');
  // se fuerza la mano del primero en hablar: 7 y 2
  const room = inst.tables.roomByCode(code);
  const first = room.hand.turnSeat;
  room.hand.player(first).hole = ['7h', '2c'];
  const sockOf = (seat) => ss.find((s) => s.state.mySeat === seat);
  // el del 7-2 sube y los demás se retiran: gana sin showdown
  const w = sockOf(first);
  let ack = await w.call('table:action', { type: 'raise', amount: 5, turnId: room.turnId, actionId: rid() });
  assert.ok(ack.ok, ack.error);
  for (let k = 0; k < 2; k++) {
    const seat = room.hand.turnSeat;
    ack = await sockOf(seat).call('table:action', { type: 'fold', turnId: room.turnId, actionId: rid() });
    assert.ok(ack.ok, ack.error);
  }
  await until(() => ss.every((s) => s.state.lastResult), 2000, 'resultado');
  const lr = ss[0].state.lastResult;
  assert.equal(lr.bonus72.length, 1);
  assert.equal(lr.bonus72[0].amount, 2, 'Bs 1 de cada uno de los otros dos');
  assert.equal(lr.bonus72[0].seat, first);
  assert.ok(lr.shown.some((x) => x.seat === first), 'se muestra el 7-2');
  const total = ss[0].state.seats.filter(Boolean).reduce((a, s) => a + s.stack, 0);
  assert.equal(total, 90, 'el total de Bs no cambia');
  const acc = (await ss[0].call('table:accounts')).accounts;
  assert.equal(acc.players.reduce((a, p) => a + p.balance, 0), 0);
});
