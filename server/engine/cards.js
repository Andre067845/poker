'use strict';
const crypto = require('node:crypto');

const RANKS = '23456789TJQKA';
const SUITS = 'shdc'; // picas, corazones, diamantes, tréboles

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

/** Fisher–Yates con aleatoriedad criptográficamente segura. */
function shuffle(cards, randomInt = crypto.randomInt) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffledDeck() {
  return shuffle(newDeck());
}

function rankValue(card) {
  return RANKS.indexOf(card[0]) + 2;
}

function isValidCard(c) {
  return typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);
}

module.exports = { RANKS, SUITS, newDeck, shuffle, shuffledDeck, rankValue, isValidCard };
