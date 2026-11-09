'use strict';
const { createApp } = require('./app');

const instance = createApp();
instance.listen().then((port) => {
  console.log(`Póker entre Amigos escuchando en http://localhost:${port}`);
  if (!instance.config.smtpUrl) {
    console.log('Aviso: SMTP_URL no está configurado. Los enlaces de recuperación de contraseña se mostrarán en esta consola.');
  }
});

const shutdown = () => { instance.close().finally(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
