'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT,
  is_guest      INTEGER NOT NULL DEFAULT 0,
  code          TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS poker_tables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  owner_id        INTEGER NOT NULL REFERENCES users(id),
  max_players     INTEGER NOT NULL,
  starting_stack  INTEGER NOT NULL,
  small_blind     INTEGER NOT NULL,
  big_blind       INTEGER NOT NULL,
  turn_seconds    INTEGER NOT NULL,
  allow_rebuy     INTEGER NOT NULL,
  max_buyin       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TEXT NOT NULL
);

-- Usuarios que crearon la mesa o abrieron su invitación (para mostrarla en el lobby).
CREATE TABLE IF NOT EXISTS table_members (
  table_id   INTEGER NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TEXT NOT NULL,
  PRIMARY KEY (table_id, user_id)
);

-- Una sesión de mesa: desde que alguien se sienta hasta que la mesa queda vacía o se cierra.
CREATE TABLE IF NOT EXISTS table_sessions (
  id            TEXT PRIMARY KEY,
  table_id      INTEGER NOT NULL REFERENCES poker_tables(id),
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  game_started  INTEGER NOT NULL DEFAULT 0,
  last_dealer_seat INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_session ON table_sessions(table_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS session_players (
  session_id  TEXT NOT NULL REFERENCES table_sessions(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  seat        INTEGER,
  stack       INTEGER NOT NULL DEFAULT 0,
  seated      INTEGER NOT NULL DEFAULT 0,
  first_joined_at TEXT NOT NULL,
  PRIMARY KEY (session_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_seat_per_player ON session_players(session_id, seat) WHERE seated = 1;

-- Movimientos de fichas. idempotency_key evita duplicados al reintentar o reconectar.
CREATE TABLE IF NOT EXISTS chip_ledger (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES table_sessions(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  kind            TEXT NOT NULL CHECK (kind IN ('buyin','rebuy','reentry','cashout')),
  amount          INTEGER NOT NULL CHECK (amount >= 0),
  created_at      TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS hands (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL REFERENCES table_sessions(id),
  hand_number  INTEGER NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  summary      TEXT,
  UNIQUE (session_id, hand_number)
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  db.tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  return db;
}

/** Migraciones de bases creadas con versiones anteriores (cuando el registro pedía correo). */
function migrate(db) {
  let cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (cols.includes('email')) {
    // El correo ya no se usa: se elimina la columna (y su índice único).
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`BEGIN;
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        recovery_hash TEXT,
        is_guest INTEGER NOT NULL DEFAULT 0,
        code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL);
      INSERT INTO users_new (id, username, password_hash, code, created_at)
        SELECT id, username, password_hash, code, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      DROP TABLE IF EXISTS password_resets;
      COMMIT;`);
    db.exec('PRAGMA foreign_keys = ON');
    cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  }
  if (!cols.includes('recovery_hash')) db.exec('ALTER TABLE users ADD COLUMN recovery_hash TEXT');
  if (!cols.includes('is_guest')) db.exec('ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0');
}

const now = () => new Date().toISOString();

module.exports = { openDb, now };
