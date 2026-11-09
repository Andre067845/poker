'use strict';
/**
 * Respaldo de la base SQLite en un almacenamiento externo (Postgres gratuito, p. ej. Neon).
 *
 * Pensado para hostings gratuitos sin disco persistente (como el plan Free de Render):
 * al arrancar se descarga la última copia; mientras corre, cada pocos segundos se sube
 * una copia si hubo cambios, y también al apagarse (Render avisa con SIGTERM).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function pgStore(connectionString) {
  const { Client } = require('pg');
  let ready = false;
  async function withClient(fn) {
    const c = new Client({ connectionString, connectionTimeoutMillis: 20000 });
    await c.connect();
    try {
      if (!ready) {
        await c.query(`CREATE TABLE IF NOT EXISTS app_snapshot (
          id INTEGER PRIMARY KEY, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        ready = true;
      }
      return await fn(c);
    } finally {
      await c.end().catch(() => {});
    }
  }
  return {
    name: 'postgres',
    async load() {
      return withClient(async (c) => {
        const r = await c.query('SELECT data FROM app_snapshot WHERE id = 1');
        return r.rows.length ? r.rows[0].data : null;
      });
    },
    async save(buf) {
      await withClient((c) => c.query(
        `INSERT INTO app_snapshot (id, data, updated_at) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [buf]));
    },
  };
}

/** Descarga la última copia (si existe) y la deja en dbFile antes de abrir la base. */
async function restoreSnapshot(store, dbFile) {
  const buf = await store.load();
  if (!buf) { console.log('Respaldo: no hay copia previa, se empieza con una base nueva.'); return false; }
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  for (const ext of ['-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
  fs.writeFileSync(dbFile, buf);
  console.log(`Respaldo: base restaurada (${Math.round(buf.length / 1024)} KB).`);
  return true;
}

/** Sube una copia consistente de la base cada `intervalMs` si hubo cambios. */
function startBackups(db, store, { intervalMs = 15000 } = {}) {
  let savedAt = -1;
  let saving = null;
  const changes = () => db.prepare('SELECT total_changes() AS n').get().n;

  async function snapshot(force = false) {
    if (saving) await saving.catch(() => {});
    const n = changes();
    if (!force && n === savedAt) return false;
    const tmp = path.join(os.tmpdir(), `poker-snap-${process.pid}-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    saving = (async () => {
      try {
        await store.save(fs.readFileSync(tmp));
        savedAt = n;
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    })();
    try { await saving; } finally { saving = null; }
    return true;
  }

  const timer = setInterval(() => {
    snapshot().catch((e) => console.error('Respaldo: no se pudo guardar la copia:', e.message));
  }, intervalMs);
  timer.unref();
  return { snapshot, stop: () => clearInterval(timer) };
}

module.exports = { pgStore, restoreSnapshot, startBackups };
