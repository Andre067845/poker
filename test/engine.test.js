'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hand, GameError } = require('../server/engine/holdem');
const { bestHand, evaluate5, CATEGORY } = require('../server/engine/evaluator');
const { newDeck, shuffle, shuffledDeck } = require('../server/engine/cards');

/**
 * Arma un mazo para que cada asiento reciba las cartas indicadas.
 * holes: { seat: ['As','Kd'] } ; board: 5 cartas.
 * El reparto empieza a la izquierda del botón, una carta por vez.
 */
function rigDeck(players, dealerSeat, holes, board = []) {
  const seats = players.map((p) => p.seat).sort((a, b) => a - b);
  const d = seats.indexOf(dealerSeat);
  const order = [];
  for (let k = 1; k <= seats.length; k++) order.push(seats[(d + k) % seats.length]);
  const used = new Set([...Object.values(holes).flat(), ...board]);
  const filler = newDeck().filter((c) => !used.has(c));
  const take = () => filler.shift();
  const deck = [];
  for (let r = 0; r < 2; r++) for (const s of order) deck.push(holes[s] ? holes[s][r] : take());
  const b = board.slice();
  const nb = () => (b.length ? b.shift() : take());
  deck.push(take(), nb(), nb(), nb(), take(), nb(), take(), nb());
  while (filler.length) deck.push(filler.shift());
  return deck;
}

const total = (h) => h.players.reduce((s, p) => s + p.stack + (h.finished ? 0 : p.total), 0);

// ---------------------------------------------------------------- Evaluador
test('baraja: 52 cartas únicas y barajado completo', () => {
  const d = shuffledDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d).size, 52);
  assert.deepEqual(shuffle([1, 2, 3], () => 0), [2, 3, 1]);
});

test('evaluador: categorías', () => {
  const cat = (cs) => bestHand(cs).category;
  assert.equal(cat(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']), CATEGORY.STRAIGHT_FLUSH);
  assert.equal(bestHand(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']).name, 'Escalera real');
  assert.equal(cat(['9h', '9d', '9s', '9c', '2d', '3c', '4h']), CATEGORY.QUADS);
  assert.equal(cat(['9h', '9d', '9s', '4c', '4d', '3c', '2h']), CATEGORY.FULL_HOUSE);
  assert.equal(cat(['2h', '7h', '9h', 'Jh', 'Kh', '3c', '4d']), CATEGORY.FLUSH);
  assert.equal(cat(['5h', '6d', '7s', '8c', '9d', 'Kc', '2h']), CATEGORY.STRAIGHT);
  assert.equal(cat(['5h', '5d', '5s', '8c', '9d', 'Kc', '2h']), CATEGORY.TRIPS);
  assert.equal(cat(['5h', '5d', '8s', '8c', '9d', 'Kc', '2h']), CATEGORY.TWO_PAIR);
  assert.equal(cat(['5h', '5d', '7s', '8c', '9d', 'Kc', '2h']), CATEGORY.PAIR);
  assert.equal(cat(['5h', '3d', '7s', '8c', '9d', 'Kc', '2h']), CATEGORY.HIGH_CARD);
});

test('evaluador: As bajo en A-2-3-4-5 y es la escalera más baja', () => {
  const wheel = bestHand(['Ah', '2d', '3s', '4c', '5d', 'Kc', 'Qh']);
  assert.equal(wheel.category, CATEGORY.STRAIGHT);
  assert.equal(wheel.name, 'Escalera al Cinco');
  const six = bestHand(['6h', '2d', '3s', '4c', '5d', 'Kc', 'Qh']);
  assert.ok(six.value > wheel.value);
  const steelWheel = bestHand(['Ah', '2h', '3h', '4h', '5h', 'Kc', 'Qd']);
  assert.equal(steelWheel.category, CATEGORY.STRAIGHT_FLUSH);
  // Q-K-A-2-3 no es escalera
  assert.equal(evaluate5(['Qh', 'Kd', 'As', '2c', '3d']).category, CATEGORY.HIGH_CARD);
});

test('evaluador: kickers y sin desempate por palo', () => {
  const a = bestHand(['Ah', 'Kd', 'Ad', '7s', '4c', '9h', '2c']);
  const b = bestHand(['As', 'Qd', 'Ad', '7s', '4c', '9h', '2c']);
  assert.ok(a.value > b.value, 'pareja de ases con rey supera a pareja de ases con reina');
  const c = bestHand(['Ah', 'Kh', 'Qh', 'Jh', '9h', '2c', '3d']);
  const d = bestHand(['As', 'Ks', 'Qs', 'Js', '9s', '2c', '3d']);
  assert.equal(c.value, d.value, 'colores iguales en valores empatan');
  const tp1 = bestHand(['Kh', 'Kd', '8s', '8c', 'Ad', '3c', '2h']);
  const tp2 = bestHand(['Ks', 'Kc', '8h', '8d', 'Qd', '3c', '2h']);
  assert.ok(tp1.value > tp2.value);
  const fh1 = bestHand(['3h', '3d', '3s', 'Ac', 'Ad', '2c', '4h']);
  const fh2 = bestHand(['4h', '4d', '4s', '2c', '2d', '7c', '9h']);
  assert.ok(fh2.value > fh1.value, 'el trío define el full');
  // la mesa juega: mismo valor
  const board = ['As', 'Ks', 'Qd', 'Jc', 'Th'];
  assert.equal(bestHand(['2c', '3d', ...board]).value, bestHand(['4h', '5h', ...board]).value);
});

// ---------------------------------------------------------------- Orden y ciegas
test('mano a mano: el botón pone la ciega chica, actúa primero preflop y último después', () => {
  const players = [{ seat: 0, userId: 'a', stack: 1000 }, { seat: 3, userId: 'b', stack: 1000 }];
  const h = new Hand({ players, dealerSeat: 3, smallBlind: 5, bigBlind: 10 });
  assert.equal(h.sbSeat, 3);
  assert.equal(h.bbSeat, 0);
  assert.equal(h.turnSeat, 3);
  assert.equal(h.player(3).bet, 5);
  assert.equal(h.player(0).bet, 10);
  h.act(3, { type: 'call' });
  // la ciega grande tiene la opción
  assert.equal(h.turnSeat, 0);
  const L = h.legalActions(0);
  assert.ok(L.canCheck && L.canRaise && !L.canCall);
  h.act(0, { type: 'check' });
  assert.equal(h.street, 'flop');
  assert.equal(h.board.length, 3);
  assert.equal(h.burned.length, 1);
  assert.equal(h.turnSeat, 0, 'postflop actúa primero la ciega grande (no-botón)');
  h.act(0, { type: 'check' });
  assert.equal(h.turnSeat, 3);
});

test('tres jugadores: orden preflop y postflop, rotación de posiciones', () => {
  const players = [0, 1, 2].map((s) => ({ seat: s, userId: s, stack: 500 }));
  const h = new Hand({ players, dealerSeat: 1, smallBlind: 5, bigBlind: 10 });
  assert.equal(h.sbSeat, 2);
  assert.equal(h.bbSeat, 0);
  assert.equal(h.turnSeat, 1, 'con tres jugadores el botón actúa primero preflop');
  h.act(1, { type: 'call' });
  h.act(2, { type: 'call' });
  assert.equal(h.turnSeat, 0);
  h.act(0, { type: 'check' });
  assert.equal(h.street, 'flop');
  assert.equal(h.turnSeat, 2, 'postflop actúa primero la ciega chica');
});

// ---------------------------------------------------------------- Subidas
test('subida mínima: debe ser al menos la última subida completa', () => {
  const players = [0, 1, 2].map((s) => ({ seat: s, userId: s, stack: 1000 }));
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  assert.equal(h.turnSeat, 0);
  let L = h.legalActions(0);
  assert.equal(L.minTo, 20);
  assert.throws(() => h.act(0, { type: 'raise', amount: 15 }), GameError);
  h.act(0, { type: 'raise', amount: 40 }); // sube 30
  L = h.legalActions(1);
  assert.equal(L.toCall, 35);
  assert.equal(L.minTo, 70, 'la próxima subida mínima es a 70 (40 + 30)');
  assert.throws(() => h.act(1, { type: 'raise', amount: 60 }), /mínimo es 70/);
  h.act(1, { type: 'raise', amount: 70 });
  assert.equal(h.legalActions(2).minTo, 100);
  // postflop la apuesta mínima es la ciega grande
  h.act(2, { type: 'call' });
  h.act(0, { type: 'call' });
  assert.equal(h.street, 'flop');
  L = h.legalActions(h.turnSeat);
  assert.ok(L.canBet && !L.canRaise);
  assert.equal(L.minTo, 10);
  assert.throws(() => h.act(h.turnSeat, { type: 'bet', amount: 5 }), GameError);
  assert.throws(() => h.act(h.turnSeat, { type: 'bet', amount: 5000 }), GameError);
});

test('all-in corto no reabre la acción para quien ya actuó', () => {
  // asientos: 0 botón, 1 SB, 2 BB, 3 UTG (stack corto)
  const players = [
    { seat: 0, userId: 'D', stack: 1000 }, { seat: 1, userId: 'S', stack: 1000 },
    { seat: 2, userId: 'B', stack: 1000 }, { seat: 3, userId: 'U', stack: 1000 },
  ];
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 50, bigBlind: 100 });
  assert.equal(h.turnSeat, 3);
  h.act(3, { type: 'raise', amount: 300 }); // subida completa de 200
  h.act(0, { type: 'call' });
  h.act(1, { type: 'fold' });
  // BB va all-in por 400 en total: aumento de 100 < 200 → no reabre
  h.player(2).stack = 300; // dejarlo con 400 en total (100 puestos + 300)
  h.act(2, { type: 'allin' });
  assert.equal(h.currentBet, 400);
  let L = h.legalActions(3);
  assert.ok(L.canCall && !L.canRaise && !L.canAllIn, 'UTG solo puede igualar o retirarse');
  assert.equal(L.toCall, 100);
  h.act(3, { type: 'call' });
  L = h.legalActions(0);
  assert.ok(L.canCall && !L.canRaise);
  h.act(0, { type: 'call' });
  assert.equal(h.street, 'flop');
});

test('all-in que completa una subida sí reabre la acción', () => {
  const players = [0, 1, 2].map((s) => ({ seat: s, userId: s, stack: 1000 }));
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 50, bigBlind: 100 });
  h.act(0, { type: 'raise', amount: 300 });
  h.act(1, { type: 'call' });
  h.player(2).stack = 400; // total 500 → aumento 200 = subida completa
  h.act(2, { type: 'allin' });
  const L = h.legalActions(0);
  assert.ok(L.canRaise);
  assert.equal(L.minTo, 700);
});

// ---------------------------------------------------------------- Botes
test('botes secundarios con all-ins de distintos importes', () => {
  const players = [
    { seat: 0, userId: 'a', stack: 100 }, { seat: 1, userId: 'b', stack: 200 },
    { seat: 2, userId: 'c', stack: 300 }, { seat: 3, userId: 'd', stack: 1000 },
  ];
  // d gana el principal con escalera; c gana el resto con trío
  const deck = rigDeck(players, 3, {
    0: ['2c', '7d'], 1: ['3c', '8d'], 2: ['Kh', 'Kd'], 3: ['9s', 'Ts'],
  }, ['Ks', 'Jd', 'Qc', '4h', '5d']);
  const h = new Hand({ players, dealerSeat: 3, smallBlind: 5, bigBlind: 10, deck });
  const start = total(h);
  // orden preflop: botón d(3)? con 4 jugadores: SB=0, BB=1, primero=2
  assert.equal(h.turnSeat, 2);
  h.act(2, { type: 'allin' }); // 300
  h.act(3, { type: 'call' }); // 300
  h.act(0, { type: 'allin' }); // 100
  h.act(1, { type: 'allin' }); // 200
  assert.ok(h.finished);
  const pots = h.result.pots;
  assert.deepEqual(pots.map((p) => p.amount), [400, 300, 200]);
  // d tiene escalera (9-T-J-Q-K) y gana todo lo que disputa
  assert.equal(h.player(3).stack, 700 + 900);
  assert.equal(h.player(2).stack, 0);
  assert.equal(total(h), start);
});

test('bote secundario lo gana otro jugador distinto del principal', () => {
  const players = [
    { seat: 0, userId: 'a', stack: 100 }, { seat: 1, userId: 'b', stack: 500 }, { seat: 2, userId: 'c', stack: 500 },
  ];
  // a (corto) tiene la mejor mano; b supera a c
  const deck = rigDeck(players, 0, { 0: ['Ah', 'Ad'], 1: ['Kh', 'Kd'], 2: ['Qh', 'Qd'] }, ['2s', '7c', '9d', '3h', '4c']);
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10, deck });
  h.act(0, { type: 'allin' });
  h.act(1, { type: 'raise', amount: 300 });
  h.act(2, { type: 'call' });
  // flop/turn/river: b y c pasan
  while (!h.finished) h.act(h.turnSeat, { type: 'check' });
  assert.equal(h.player(0).stack, 300, 'principal: 100 x 3');
  assert.equal(h.player(1).stack, 200 + 400, 'secundario: 200 x 2');
  assert.equal(h.player(2).stack, 200);
});

test('empate: reparto y ficha sobrante al primero a la izquierda del botón', () => {
  const players = [
    { seat: 0, userId: 'a', stack: 1000 }, { seat: 1, userId: 'b', stack: 1000 }, { seat: 2, userId: 'c', stack: 1000 },
  ];
  const deck = rigDeck(players, 0, { 0: ['2c', '3d'], 1: ['Ah', '4d'], 2: ['As', '4h'] }, ['Kd', 'Kc', '9s', '9h', '7c']);
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10, deck });
  // botón 0, SB 1, BB 2. 0 sube a 25 y luego se retira tras apuesta -> bote impar
  h.act(0, { type: 'call' }); // 10
  h.act(1, { type: 'call' }); // 10
  h.act(2, { type: 'check' });
  // flop: 1 apuesta 11, 2 iguala, 0 iguala y después se retira
  h.act(1, { type: 'bet', amount: 11 });
  h.act(2, { type: 'call' });
  h.act(0, { type: 'call' });
  // turn: 1 apuesta 10, 2 iguala, 0 se retira
  h.act(1, { type: 'bet', amount: 10 });
  h.act(2, { type: 'call' });
  h.act(0, { type: 'fold' });
  h.act(1, { type: 'check' });
  h.act(2, { type: 'check' });
  assert.ok(h.finished);
  const pot = 21 * 3 + 20; // 83, impar
  assert.equal(h.result.pots[0].amount, pot);
  const w = h.result.winners.sort((a, b) => a.seat - b.seat);
  assert.deepEqual(w.map((x) => x.amount), [42, 41], 'la ficha extra va al asiento 1 (izquierda del botón)');
  assert.equal(total(h), 3000);
  assert.equal(h.result.showdown.length, 2, 'no se muestran las cartas del retirado');
  assert.ok(!h.result.showdown.some((s) => s.seat === 0));
});

test('apuesta no igualada se devuelve y la mano termina si todos se retiran', () => {
  const players = [{ seat: 0, userId: 'a', stack: 1000 }, { seat: 1, userId: 'b', stack: 1000 }, { seat: 2, userId: 'c', stack: 1000 }];
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  h.act(0, { type: 'raise', amount: 500 });
  h.act(1, { type: 'fold' });
  h.act(2, { type: 'fold' });
  assert.ok(h.finished);
  assert.equal(h.result.type, 'uncontested');
  assert.equal(h.result.showdown.length, 0);
  assert.equal(h.player(0).stack, 1015);
  assert.deepEqual(h.result.uncalled, { seat: 0, amount: 490 });
  assert.equal(h.board.length, 0, 'no se reparten cartas comunitarias');
});

test('all-in más grande que el rival: devuelve el excedente y corre el tablero', () => {
  const players = [{ seat: 0, userId: 'a', stack: 1000 }, { seat: 1, userId: 'b', stack: 300 }];
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  h.act(0, { type: 'allin' });
  h.act(1, { type: 'call' });
  assert.ok(h.finished);
  assert.equal(h.board.length, 5);
  assert.equal(h.burned.length, 3);
  assert.equal(h.result.uncalled.amount, 700);
  assert.equal(h.player(0).stack + h.player(1).stack, 1300);
});

test('ciega grande corta all-in: los demás igualan la ciega completa', () => {
  const players = [{ seat: 0, userId: 'a', stack: 1000 }, { seat: 1, userId: 'b', stack: 1000 }, { seat: 2, userId: 'c', stack: 4 }];
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  assert.ok(h.player(2).allIn);
  assert.equal(h.legalActions(0).toCall, 10);
  h.act(0, { type: 'call' });
  h.act(1, { type: 'call' });
  assert.equal(h.street, 'flop');
  assert.equal(h.pots()[0].amount, 12);
  assert.equal(h.pots()[1].amount, 12);
});

test('vencimiento del tiempo: pasa si puede, si no se retira', () => {
  const players = [{ seat: 0, userId: 'a', stack: 1000 }, { seat: 1, userId: 'b', stack: 1000 }];
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  assert.equal(h.timeout(0).type, 'fold');
  assert.ok(h.finished);
  const h2 = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  h2.act(0, { type: 'call' });
  assert.equal(h2.timeout(1).type, 'check');
  assert.equal(h2.street, 'flop');
});

test('acción fuera de turno y retiro forzado', () => {
  const players = [0, 1, 2].map((s) => ({ seat: s, userId: s, stack: 100 }));
  const h = new Hand({ players, dealerSeat: 0, smallBlind: 5, bigBlind: 10 });
  assert.throws(() => h.act(2, { type: 'check' }), /No es tu turno/);
  h.forceFold(2);
  assert.equal(h.turnSeat, 0);
  h.act(0, { type: 'fold' });
  assert.ok(h.finished);
  assert.equal(h.player(1).stack, 110);
});

// ---------------------------------------------------------------- Conservación (fuzz)
test('conservación de fichas en 3000 manos aleatorias', () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  for (let iter = 0; iter < 3000; iter++) {
    const n = 2 + rnd(8);
    const seats = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, n);
    const players = seats.map((s) => ({ seat: s, userId: s, stack: 1 + rnd(rnd(2) ? 60 : 2000) }));
    const start = players.reduce((s, p) => s + p.stack, 0);
    const h = new Hand({ players, dealerSeat: seats[rnd(n)], smallBlind: 5, bigBlind: 10 });
    let guard = 0;
    while (!h.finished) {
      if (++guard > 500) throw new Error('mano infinita');
      const seat = h.turnSeat;
      const L = h.legalActions(seat);
      const opts = ['fold'];
      if (L.canCheck) opts.push('check', 'check');
      if (L.canCall) opts.push('call', 'call');
      if (L.canBet || L.canRaise) opts.push('raise');
      if (L.canAllIn) opts.push('allin');
      const t = opts[rnd(opts.length)];
      if (t === 'raise') {
        const amt = L.minTo + rnd(L.maxTo - L.minTo + 1);
        h.act(seat, { type: L.canBet ? 'bet' : 'raise', amount: amt });
      } else h.act(seat, { type: t });
      // invariante en cada paso
      assert.equal(h.players.reduce((s, p) => s + p.stack + (h.finished ? 0 : p.total), 0), start);
      for (const p of h.players) assert.ok(p.stack >= 0);
    }
    const end = h.players.reduce((s, p) => s + p.stack, 0);
    assert.equal(end, start, `iteración ${iter}`);
    const cards = [...h.board, ...h.burned, ...h.players.flatMap((p) => p.hole)];
    assert.equal(new Set(cards).size, cards.length, 'sin cartas repetidas');
    if (h.result.type === 'showdown') assert.equal(h.board.length, 5);
  }
});
