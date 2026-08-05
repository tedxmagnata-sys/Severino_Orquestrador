/**
 * 📣 Canais de comunicação do ecossistema (Telegram; email é stub).
 */
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const ADMIN = process.env.TELEGRAM_CHAT_ID || '';

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

module.exports = { enviarTelegram, enviarAdmin, ADMIN };
