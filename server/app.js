'use strict';
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { openDb } = require('./db');
const { createAuth, UserError } = require('./auth');
const { createHistory } = require('./history');
const { TableManager } = require('./tables');
const { startBackups } = require('./persist');

const COOKIE = 'pk_sid';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Limitador simple en memoria por IP y clave. */
function rateLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const k = `${req.ip}:${req.path}`;
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    if (n > max) return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' });
    next();
  };
}

function defaultConfig(overrides = {}) {
  const env = process.env;
  return {
    port: Number(env.PORT || 3000),
    dbFile: env.DB_FILE || path.join(__dirname, '..', 'data', 'poker.db'),
    cookieSecure: env.COOKIE_SECURE === '1',
    trustProxy: env.TRUST_PROXY === '1',
    graceMs: Number(env.GRACE_SECONDS || 180) * 1000,
    resultDelayMs: Number(env.RESULT_DELAY_MS || 8000),
    sweepMs: 5000,
    ...overrides,
  };
}

function createApp(overrides = {}) {
  const config = defaultConfig(overrides);
  const db = openDb(config.dbFile);
  const auth = createAuth(db);
  const history = createHistory(db);

  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '20kb' }));

  // Protección CSRF: las peticiones que modifican datos deben venir del mismo origen.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido' });
      } catch { return res.status(403).json({ error: 'Origen no permitido' }); }
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Formato no soportado' });
    next();
  });

  // Autenticación por cookie HttpOnly
  app.use((req, res, next) => {
    req.token = parseCookies(req.headers.cookie)[COOKIE];
    req.user = auth.userFromToken(req.token);
    next();
  });

  const setSessionCookie = (req, res, user) => {
    const { token, expires } = auth.createSession(user.id);
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: config.cookieSecure || req.secure,
      expires: new Date(expires), path: '/',
    });
  };
  const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Tenés que iniciar sesión' }));
  const wrap = (fn) => async (req, res) => {
    try { res.json((await fn(req, res)) ?? { ok: true }); } catch (e) {
      if (e.userFacing) return res.status(e.status || 400).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'Ocurrió un error inesperado. Probá de nuevo.' });
    }
  };
  const authLimiter = rateLimiter(30, 10 * 60 * 1000);

  app.post('/api/auth/register', authLimiter, wrap((req, res) => {
    const { user, recoveryCode } = auth.register(req.body || {});
    setSessionCookie(req, res, user);
    return { user, recoveryCode };
  }));
  app.post('/api/auth/login', authLimiter, wrap((req, res) => {
    const user = auth.login(req.body || {});
    setSessionCookie(req, res, user);
    return { user };
  }));
  app.post('/api/auth/logout', wrap((req, res) => {
    auth.destroySession(req.token);
    res.clearCookie(COOKIE, { path: '/' });
  }));
  app.post('/api/auth/recover', authLimiter, wrap((req, res) => {
    const { user, recoveryCode } = auth.recoverWithCode(req.body || {});
    setSessionCookie(req, res, user);
    return { user, recoveryCode };
  }));
  app.post('/api/auth/recovery-code', authLimiter, requireUser, wrap((req) => ({ recoveryCode: auth.regenerateRecovery(req.user.id, (req.body || {}).password) })));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/api/me', (req, res) => res.json({ user: req.user || null }));

  // Mesas
  let tables; // se crea después de io
  app.get('/api/tables', requireUser, wrap((req) => ({ tables: tables.lobby(req.user) })));
  app.post('/api/tables', requireUser, wrap((req) => ({ table: tables.createTable(req.user, req.body || {}) })));
  app.get('/api/tables/:code', requireUser, wrap((req) => {
    const room = tables.roomByCode(req.params.code);
    if (!room) throw new UserError('No existe una mesa con ese código', 404);
    db.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, joined_at) VALUES (?,?,?)').run(room.id, req.user.id, new Date().toISOString());
    return { table: room.preview(), seated: room.seatOf(req.user.id) >= 0 };
  }));

  // Historial
  app.get('/api/history', requireUser, wrap((req) => ({ sessions: history.listSessions(req.user.id) })));
  app.get('/api/history/:id', requireUser, wrap((req) => ({ session: history.sessionDetail(req.user.id, req.params.id) })));

  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

  // Frontend
  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(pub, 'index.html')));

  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });
  tables = new TableManager({ db, io, config });

  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[COOKIE];
    const user = auth.userFromToken(token);
    if (!user) return next(new Error('no-auth'));
    const origin = socket.handshake.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== socket.handshake.headers.host) return next(new Error('bad-origin')); } catch { return next(new Error('bad-origin')); }
    }
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    let room = null;
    const handler = (fn) => (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const r = fn(payload || {});
        reply({ ok: true, ...(r || {}) });
      } catch (e) {
        if (!e.userFacing) console.error(e);
        reply({ ok: false, error: e.userFacing ? e.message : 'Ocurrió un error inesperado' });
      }
    };
    const needRoom = () => { if (!room) throw new UserError('No estás en ninguna mesa'); return room; };

    socket.on('table:join', handler(({ code }) => {
      const r = tables.roomByCode(code);
      if (!r) throw new UserError('No existe una mesa con ese código');
      if (room && room !== r) room.detachSocket(socket, user.id);
      room = r;
      r.attachSocket(socket, user);
      return { state: r.view(user.id), chat: r.chat, quickChat: TableManager.QUICK_CHAT };
    }));
    socket.on('table:sit', handler((p) => { needRoom().sit(user, p); }));
    socket.on('table:ready', handler((p) => { needRoom().setReady(user, p.ready); }));
    socket.on('table:start', handler(() => { needRoom().startGame(user); }));
    socket.on('table:action', handler((p) => needRoom().action(user, p)));
    socket.on('table:rebuy', handler((p) => { needRoom().rebuy(user, p); }));
    socket.on('table:leave', handler(() => { needRoom().leave(user); }));
    socket.on('table:close', handler(() => { needRoom().close(user); }));
    socket.on('table:show', handler(() => { needRoom().showCards(user); }));
    socket.on('table:chat', handler((p) => ({ message: needRoom().sendChat(user, p) })));
    socket.on('table:exit', handler(() => { if (room) { room.detachSocket(socket, user.id); room = null; } }));
    socket.on('disconnect', () => { if (room) room.detachSocket(socket, user.id); });
  });

  tables.restoreAll();
  const backups = config.store ? startBackups(db, config.store, { intervalMs: config.backupMs || 15000 }) : null;

  return {
    app, server, io, db, tables, config,
    listen(port = config.port) {
      return new Promise((resolve) => server.listen(port, () => resolve(server.address().port)));
    },
    backups,
    async close() {
      tables.stop();
      if (backups) {
        backups.stop();
        await backups.snapshot(true).catch((e) => console.error('Respaldo final fallido:', e.message));
      }
      io.close();
      await new Promise((r) => server.close(() => r()));
      db.close();
    },
  };
}

module.exports = { createApp, defaultConfig };
