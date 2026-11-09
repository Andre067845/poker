'use strict';
const crypto = require('node:crypto');
const { now } = require('./db');

const SESSION_DAYS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones

function randomCode(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; this.userFacing = true; }
}

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new UserError('La contraseña debe tener al menos 8 caracteres');
  if (pw.length > 200) throw new UserError('La contraseña es demasiado larga');
}

function createAuth(db) {
  function publicUser(u) {
    return u && { id: u.id, username: u.username, code: u.code };
  }

  /** Código secreto para recuperar la cuenta sin correo. Se muestra una sola vez. */
  function newRecoveryCode() {
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(randomCode(4));
    return parts.join('-');
  }
  const normRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function register({ username, password }) {
    username = String(username || '').trim();
    if (!USERNAME_RE.test(username)) throw new UserError('El nombre de usuario debe tener entre 3 y 20 caracteres (letras, números, punto, guion o guion bajo)');
    validatePassword(password);
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new UserError('Ese nombre de usuario ya está en uso', 409);
    const hash = hashPassword(password);
    const recoveryCode = newRecoveryCode();
    const recoveryHash = hashPassword(normRecovery(recoveryCode));
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = `PKR-${randomCode(6)}`;
      try {
        const r = db.prepare('INSERT INTO users (username, password_hash, recovery_hash, code, created_at) VALUES (?,?,?,?,?)')
          .run(username, hash, recoveryHash, code, now());
        return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)), recoveryCode };
      } catch (e) {
        if (!/UNIQUE/.test(e.message)) throw e;
        if (/username/.test(e.message)) throw new UserError('Ese nombre de usuario ya está en uso', 409);
      }
    }
    throw new Error('No se pudo generar un código único');
  }

  function login({ username, login: ident, password }) {
    ident = String(username || ident || '').trim();
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(ident);
    // Siempre se calcula un hash para no revelar si el usuario existe por el tiempo de respuesta.
    const ok = u ? verifyPassword(String(password || ''), u.password_hash) : (hashPassword('x'), false);
    if (!ok) throw new UserError('Usuario o contraseña incorrectos', 401);
    return publicUser(u);
  }

  /** Cambia la contraseña con el código de recuperación y entrega un código nuevo. */
  function recoverWithCode({ username, recoveryCode, password }) {
    validatePassword(password);
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
    const ok = u && u.recovery_hash ? verifyPassword(normRecovery(recoveryCode), u.recovery_hash) : (hashPassword('x'), false);
    if (!ok) throw new UserError('El usuario o el código de recuperación no son correctos', 401);
    const fresh = newRecoveryCode();
    db.tx(() => {
      db.prepare('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?').run(hashPassword(password), hashPassword(normRecovery(fresh)), u.id);
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(u.id); // cierra todas las sesiones abiertas
    });
    return { user: publicUser(u), recoveryCode: fresh };
  }

  /** Genera un código de recuperación nuevo (requiere la contraseña actual). */
  function regenerateRecovery(userId, password) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!u || !verifyPassword(String(password || ''), u.password_hash)) throw new UserError('La contraseña no es correcta', 401);
    const fresh = newRecoveryCode();
    db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').run(hashPassword(normRecovery(fresh)), u.id);
    return fresh;
  }

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
    db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
      .run(sha256(token), userId, now(), expires);
    return { token, expires };
  }

  function userFromToken(token) {
    if (!token) return null;
    const row = db.prepare(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), now());
    return publicUser(row);
  }

  function destroySession(token) {
    if (token) db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha256(token));
  }

  return { register, login, createSession, userFromToken, destroySession, recoverWithCode, regenerateRecovery, publicUser };
}

module.exports = { createAuth, UserError, randomCode, hashPassword, verifyPassword };
