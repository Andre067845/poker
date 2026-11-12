'use strict';
/** Personaje de cada jugador: cara, torso, reloj y cadena. Solo se aceptan valores de estas listas. */

const OPTIONS = {
  skin: ['#f6d7c3', '#eac39f', '#d9a77c', '#b9825a', '#8d5a3b', '#5e3a24'],
  face: ['adulto', 'joven', 'niño', 'niña', 'señora', 'abuelo', 'abuela'],
  head: ['cabeza normal', 'cabezona'],
  eyeBags: ['sin ojeras', 'ojeras'],
  acne: ['sin granos', 'granos rojos', 'granos muy rojos'],
  mouth: ['boca cerrada', 'sonrisa', 'carillas de diamantes', 'carillas de oro', 'dientes de castor',
    'dientes amarillos', 'dientes negros', 'brackets con comida'],
  hair: ['corto', 'largo', 'rulos', 'rapado', 'pelado', 'cresta'],
  hairColor: ['#1f1a17', '#4a2f1d', '#8a5a2b', '#d4a64a', '#b5442f', '#9aa0a6', '#f2f2f2'],
  hat: ['ninguno', 'gorra', 'vaquero', 'lana', 'galera', 'boina',
    'gorra negra', 'vaquero negro', 'fedora negro', 'lana negra', 'capucha negra'],
  glasses: ['ninguna', 'redondas', 'cuadradas', 'sol', 'sol aviador', 'sol deportivas'],
  beard: ['ninguna', 'bigote', 'barba', 'candado'],
  body: ['con polera', 'sin polera', 'sin polera con granos'],
  shirt: ['#2f6fb0', '#b0352f', '#2e8b57', '#6b4bb0', '#d08a1f', '#333a44', '#e0e0e0'],
  chain: ['sin cadena', 'cruz de oro', 'diamantes', 'oro gruesa', 'plata', 'dólar', 'doble'],
  watch: ['sin reloj', 'AP', 'Rolex de oro', 'arcoíris', 'multicolor', 'diamantes'],
  ears: ['sin audífonos', 'AirPods', 'audífonos con cable', 'audífonos de casco'],
};

function defaultAvatar(seed = 0) {
  const n = Math.abs(Number(seed) || 0);
  const pick = (arr, k) => arr[(n * 7 + k * 13) % arr.length];
  return {
    skin: pick(OPTIONS.skin, 1), face: 'adulto', head: 'cabeza normal', eyeBags: 'sin ojeras', mouth: 'boca cerrada',
    ears: 'sin audífonos', acne: 'sin granos', hair: pick(OPTIONS.hair, 2), hairColor: pick(OPTIONS.hairColor, 3),
    hat: 'ninguno', glasses: 'ninguna', beard: 'ninguna', body: 'con polera', shirt: pick(OPTIONS.shirt, 4),
    chain: 'sin cadena', watch: 'sin reloj',
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
