'use strict';
const { rankValue } = require('./cards');

const CATEGORY = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
};

const CATEGORY_NAMES = [
  'Carta alta', 'Pareja', 'Doble pareja', 'Trío', 'Escalera',
  'Color', 'Full', 'Póker', 'Escalera de color',
];

const RANK_PLURAL = {
  2: 'Doses', 3: 'Treses', 4: 'Cuatros', 5: 'Cincos', 6: 'Seises', 7: 'Sietes', 8: 'Ochos',
  9: 'Nueves', 10: 'Dieces', 11: 'Jotas', 12: 'Reinas', 13: 'Reyes', 14: 'Ases',
};
const RANK_SINGULAR = {
  2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho',
  9: 'Nueve', 10: 'Diez', 11: 'Jota', 12: 'Reina', 13: 'Rey', 14: 'As',
};

/**
 * Evalúa exactamente 5 cartas. Devuelve { value, category, ranks } donde `value`
 * es un número comparable (mayor = mejor). El palo nunca desempata.
 */
function evaluate5(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);

  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5 && vals[4] === 2) straightHigh = 5; // A-2-3-4-5: el As es bajo
  }

  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  // agrupar por (cantidad desc, valor desc)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordered = groups.map((g) => g[0]);

  let category;
  let ranks;
  if (straightHigh && flush) { category = CATEGORY.STRAIGHT_FLUSH; ranks = [straightHigh]; }
  else if (groups[0][1] === 4) { category = CATEGORY.QUADS; ranks = ordered; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { category = CATEGORY.FULL_HOUSE; ranks = ordered; }
  else if (flush) { category = CATEGORY.FLUSH; ranks = vals; }
  else if (straightHigh) { category = CATEGORY.STRAIGHT; ranks = [straightHigh]; }
  else if (groups[0][1] === 3) { category = CATEGORY.TRIPS; ranks = ordered; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { category = CATEGORY.TWO_PAIR; ranks = ordered; }
  else if (groups[0][1] === 2) { category = CATEGORY.PAIR; ranks = ordered; }
  else { category = CATEGORY.HIGH_CARD; ranks = vals; }

  let value = category;
  for (let i = 0; i < 5; i++) value = value * 15 + (ranks[i] || 0);
  return { value, category, ranks };
}

function combinations(arr, k) {
  const out = [];
  const combo = [];
  (function rec(start) {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1); combo.pop(); }
  })(0);
  return out;
}

/** Mejor combinación de 5 cartas entre 5, 6 o 7 cartas. */
function bestHand(cards) {
  if (cards.length < 5) throw new Error('Se necesitan al menos 5 cartas');
  let best = null;
  for (const c of combinations(cards, 5)) {
    const e = evaluate5(c);
    if (!best || e.value > best.value) best = { ...e, cards: c };
  }
  best.name = describe(best);
  return best;
}

function describe({ category, ranks }) {
  const P = RANK_PLURAL;
  const S = RANK_SINGULAR;
  switch (category) {
    case CATEGORY.STRAIGHT_FLUSH:
      return ranks[0] === 14 ? 'Escalera real' : `Escalera de color al ${S[ranks[0]]}`;
    case CATEGORY.QUADS: return `Póker de ${P[ranks[0]]}`;
    case CATEGORY.FULL_HOUSE: return `Full de ${P[ranks[0]]} y ${P[ranks[1]]}`;
    case CATEGORY.FLUSH: return `Color al ${S[ranks[0]]}`;
    case CATEGORY.STRAIGHT: return `Escalera al ${S[ranks[0]]}`;
    case CATEGORY.TRIPS: return `Trío de ${P[ranks[0]]}`;
    case CATEGORY.TWO_PAIR: return `Doble pareja de ${P[ranks[0]]} y ${P[ranks[1]]}`;
    case CATEGORY.PAIR: return `Pareja de ${P[ranks[0]]}`;
    default: return `Carta alta: ${S[ranks[0]]}`;
  }
}

module.exports = { evaluate5, bestHand, CATEGORY, CATEGORY_NAMES, combinations };
