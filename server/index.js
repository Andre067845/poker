'use strict';
const { createApp, defaultConfig } = require('./app');
const { pgStore, restoreSnapshot } = require('./persist');

(async () => {
  const overrides = {};
  if (process.env.DATABASE_URL) {
    // Hosting gratuito sin disco: la base se respalda en Postgres (p. ej. Neon).
    overrides.store = pgStore(process.env.DATABASE_URL);
    await restoreSnapshot(overrides.store, defaultConfig().dbFile);
  } else {
    console.log('Aviso: DATABASE_URL no está configurado; los datos se guardan solo en el disco local.');
  }
  const instance = createApp(overrides);
  const port = await instance.listen();
  console.log(`wakapoker escuchando en http://localhost:${port}`);

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    instance.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((e) => {
  console.error('No se pudo iniciar el servidor:', e);
  process.exit(1);
});
