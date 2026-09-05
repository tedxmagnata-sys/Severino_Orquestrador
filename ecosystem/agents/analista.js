const fs = require('fs');

function loadEnv() {
  try {
    const envPath = '/root/severino/.env';
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key) process.env[key] = val;
      }
    });
  } catch (err) {
    console.error('Erro ao carregar .env:', err.message);
  }
}
loadEnv();

const http = require('http');
const https = require('https');
const SECRET = process.env.SECRET_KEY || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '';

function request(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: 3334, path: endpoint, method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': SECRET, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sendTelegram(chatId, text) {
  return new Promise((resolve) => {
    const token = process.env.TELEGRAM_TOKEN || '';
    if (!token || !chatId) return resolve(false);
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false });
    const opts = { hostname: 'api.telegram.org', port: 443, path: '/bot' + token + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
    const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(false); } }); });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

async function run() {
  const [leads, events] = await Promise.all([
    request('GET', '/api/ecosystem/leads'),
    request('GET', '/api/ecosystem/events')
  ]);
  const leadsList = Array.isArray(leads) ? leads : [];
  const eventsList = Array.isArray(events) ? events : [];
  const today = new Date().toISOString().split('T')[0];
  const todayEvents = eventsList.filter(e => (e.timestamp || e.receivedAt || '').startsWith(today));
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekEvents = eventsList.filter(e => (e.timestamp || e.receivedAt || '') >= weekAgo);

  const msg = [
    '\u{1F4CA} <b>Relat\u00F3rio Di\u00E1rio - BTC Weather Panel</b>\n',
    '\u{1F465} <b>Leads:</b> ' + leadsList.length + ' total',
    '\u{1F525} <b>Quentes:</b> ' + leadsList.filter(l => l.status === 'quente').length,
    '\u{1F504} <b>Em nutri\u00E7\u00E3o:</b> ' + leadsList.filter(l => l.status === 'nutricao').length,
    '\u{1F4D1} <b>Novos hoje:</b> ' + leadsList.filter(l => (l.createdAt || '').startsWith(today)).length + '\n',
    '\u{1F4DD} <b>Eventos (hoje):</b> ' + todayEvents.length,
    '\u{1F4DD} <b>Eventos (7 dias):</b> ' + weekEvents.length + '\n',
    '\u{1F3E6} <b>Sistema:</b> severino rodando na porta 3334',
    '\u{1F310} <b>Dom\u00EDnio:</b> btcweatherpanel.com',
    '\u{1F916} @btcweatherpanel_bot'
  ].join('\n');

  console.log(JSON.stringify({ ok: true, sent: false }, null, 2));

  if (CHAT_ID) {
    const res = await sendTelegram(CHAT_ID, msg);
    console.log(JSON.stringify({ ok: true, sent: !!(res && res.ok) }, null, 2));
  }
}

if (require.main === module) run();
module.exports = { run };
