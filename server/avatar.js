'use strict';
/** Personaje de cada jugador: solo la cara (piel, pelo, sombrero, gafas, barba). */

const OPTIONS = {
  skin: ['#f6d7c3', '#eac39f', '#d9a77c', '#b9825a', '#8d5a3b', '#5e3a24'],
  hair: ['corto', 'largo', 'rulos', 'rapado', 'pelado', 'cresta'],
  hairColor: ['#1f1a17', '#4a2f1d', '#8a5a2b', '#d4a64a', '#b5442f', '#9aa0a6', '#f2f2f2'],
  hat: ['ninguno', 'gorra', 'vaquero', 'lana', 'galera', 'boina'],
  glasses: ['ninguna', 'redondas', 'sol', 'cuadradas'],
  beard: ['ninguna', 'bigote', 'barba', 'candado'],
  shirt: ['#2f6fb0', '#b0352f', '#2e8b57', '#6b4bb0', '#d08a1f', '#333a44', '#e0e0e0'],
};

function defaultAvatar(seed = 0) {
  const n = Math.abs(Number(seed) || 0);
  const pick = (arr, k) => arr[(n * 7 + k * 13) % arr.length];
  return {
    skin: pick(OPTIONS.skin, 1), hair: pick(OPTIONS.hair, 2), hairColor: pick(OPTIONS.hairColor, 3),
    hat: 'ninguno', glasses: 'ninguna', beard: 'ninguna', shirt: pick(OPTIONS.shirt, 4),
  };
}

/** Solo se aceptan valores de la lista (nada de texto libre ni colores arbitrarios). */
function sanitizeAvatar(input, seed) {
  const base = defaultAvatar(seed);
  const out = {};
  for (const k of Object.keys(OPTIONS)) {
    const v = input && input[k];
    out[k] = OPTIONS[k].includes(v) ? v : base[k];
  }
  return out;
}

function parseAvatar(json, seed) {
  if (!json) return defaultAvatar(seed);
  try { return sanitizeAvatar(JSON.parse(json), seed); } catch { return defaultAvatar(seed); }
}

module.exports = { OPTIONS, defaultAvatar, sanitizeAvatar, parseAvatar };
