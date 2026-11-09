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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new UserError('La contraseña debe tener al menos 8 caracteres');
  if (pw.length > 200) throw new UserError('La contraseña es demasiado larga');
}

function createAuth(db) {
  function publicUser(u) {
    return u && { id: u.id, username: u.username, email: u.email, code: u.code };
  }

  function register({ username, email, password }) {
    username = String(username || '').trim();
    email = String(email || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) throw new UserError('El nombre de usuario debe tener entre 3 y 20 caracteres (letras, números, punto, guion o guion bajo)');
    if (!EMAIL_RE.test(email) || email.length > 200) throw new UserError('El correo no es válido');
    validatePassword(password);
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new UserError('Ese nombre de usuario ya está en uso', 409);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new UserError('Ya existe una cuenta con ese correo', 409);
    const hash = hashPassword(password);
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = `PKR-${randomCode(6)}`;
      try {
        const r = db.prepare('INSERT INTO users (username, email, password_hash, code, created_at) VALUES (?,?,?,?,?)')
          .run(username, email, hash, code, now());
        return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid));
      } catch (e) {
        if (!/UNIQUE/.test(e.message) || !/code/.test(e.message)) {
          if (/UNIQUE/.test(e.message)) throw new UserError('Ese usuario o correo ya está registrado', 409);
          throw e;
        }
      }
    }
    throw new Error('No se pudo generar un código único');
  }

  function login({ login: ident, password }) {
    ident = String(ident || '').trim();
    const u = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(ident, ident.toLowerCase());
    // Siempre se calcula un hash para no revelar si el usuario existe por el tiempo de respuesta.
    const ok = u ? verifyPassword(String(password || ''), u.password_hash) : (hashPassword('x'), false);
    if (!ok) throw new UserError('Usuario o contraseña incorrectos', 401);
    return publicUser(u);
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

  /** Devuelve el token en claro (para enviar por correo) o null si el correo no existe. */
  function createPasswordReset(email) {
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
    if (!u) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)')
      .run(sha256(token), u.id, new Date(Date.now() + 3600e3).toISOString());
    return { token, user: publicUser(u) };
  }

  function resetPassword(token, password) {
    validatePassword(password);
    return db.tx(() => {
      const r = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(String(token || '')));
      if (!r || r.used_at || r.expires_at < now()) throw new UserError('El enlace de recuperación no es válido o ya venció');
      db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').run(now(), r.token_hash);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), r.user_id);
      // Cierra todas las sesiones abiertas de esa cuenta.
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(r.user_id);
      return r.user_id;
    });
  }

  return { register, login, createSession, userFromToken, destroySession, createPasswordReset, resetPassword, publicUser };
}

module.exports = { createAuth, UserError, randomCode, hashPassword, verifyPassword };
