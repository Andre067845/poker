'use strict';
/**
 * Envío de correos (recuperación de contraseña).
 * Si SMTP_URL no está configurado, el enlace se escribe en la consola del servidor
 * para que el administrador pueda entregarlo manualmente.
 */
function createMailer(config) {
  let transport = null;
  if (config.smtpUrl) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport(config.smtpUrl);
  }
  return {
    configured: !!transport,
    async sendPasswordReset(to, username, link) {
      const text = `Hola ${username}:\n\nRecibimos un pedido para cambiar tu contraseña de Póker entre Amigos.\n` +
        `Abrí este enlace (vence en 1 hora):\n\n${link}\n\nSi no fuiste vos, ignorá este correo.\n`;
      if (!transport) {
        console.log(`[correo no configurado] Enlace de recuperación para ${to}: ${link}`);
        return;
      }
      await transport.sendMail({ from: config.mailFrom, to, subject: 'Recuperar contraseña — Póker entre Amigos', text });
    },
  };
}

module.exports = { createMailer };
