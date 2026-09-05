/**
 * 📣 Canais de comunicação do ecossistema (Telegram + e-mail via SMTP/Zoho).
 */
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const ADMIN = process.env.TELEGRAM_CHAT_ID || '';

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {}

function enviarTelegram(chatId, text) {
  if (!TOKEN || !chatId) return Promise.resolve(false);
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      chat_id: chatId,
      text: String(text || ''),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + TOKEN + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(opts, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

function enviarAdmin(text) {
  return enviarTelegram(ADMIN, text);
}

// ===== E-MAIL (SMTP Zoho/Workspace) =====
// Configuração via .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
let _transporter = null;
function getTransporter() {
  const host = process.env.SMTP_HOST || '';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!host || !user || !pass) return null;
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user, pass }
  });
  return _transporter;
}

function enviarEmail(to, assunto, texto) {
  if (!nodemailer) return Promise.resolve(false);
  const transporter = getTransporter();
  if (!transporter || !to) return Promise.resolve(false);
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '';
  return new Promise((resolve) => {
    transporter.sendMail({
      from,
      to,
      subject: assunto || 'BTC Weather Panel',
      text: String(texto || '')
    }, (err) => {
      if (err) {
        console.error('[EMAIL] falha:', err.message);
        resolve(false);
      } else {
        console.log('[EMAIL] enviado para', to);
        resolve(true);
      }
    });
  });
}

module.exports = { enviarTelegram, enviarAdmin, enviarEmail, ADMIN };
