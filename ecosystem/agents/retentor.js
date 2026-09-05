const fs = require('fs');
const path = require('path');

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
const EVENTS_PATH = '/root/severino/ecosystem/events.json';
const LEADS_PATH = '/root/severino/ecosystem/leads.json';
const LICENSES_PATH = '/root/severino/data/licenses.json';
const PENDING_CODES_PATH = '/root/severino/ecosystem/pending_codes.json';
const SECRET = process.env.SECRET_KEY || '';

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function readObj(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function writeJSON(p, d) { try { fs.writeFileSync(p, JSON.stringify(d, null, 2)); } catch {} }
function appendEvent(ev) {
  try {
    const events = readJSON(EVENTS_PATH);
    events.push({ ...ev, timestamp: new Date().toISOString() });
    writeJSON(EVENTS_PATH, events);
  } catch(e) {}
}

function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: 3334, path: endpoint, method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': SECRET,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
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
  const licenses = readObj(LICENSES_PATH);
  const leads = readJSON(LEADS_PATH);
  const pendingCodes = readJSON(PENDING_CODES_PATH);
  const now = Date.now();
  const DAY = 86400000;
  const MAX_DISPAROS = 10;
  const results = [];
  let disparados = 0;

  for (const [code, lic] of Object.entries(licenses)) {
    if (disparados >= MAX_DISPAROS) break;
    if (!lic.activatedAt) continue;
    const daysSince = Math.floor((now - new Date(lic.activatedAt).getTime()) / DAY);
    if (daysSince < 14) continue;

    // Find lead associated with this license
    const lead = leads.find(l => {
      return l.telegram_id && (
        pendingCodes.some(pc => pc.codigo === code && (pc.telegram_id == l.telegram_id || pc.leadId === l.id))
      );
    });

    if (!lead || !lead.telegram_id) continue;

    // Generate new VIP code
    const res = await api('POST', '/api/license/generate', { count: 1, source: 'retentor_winback' });
    const newCode = (res && res.codes && res.codes[0]) || '';
    if (!newCode) continue;

    // Save pending code
    pendingCodes.push({
      leadId: lead.id, nome: lead.nome, codigo: newCode,
      telegram_id: lead.telegram_id, telegram_username: lead.telegram_username || '',
      createdAt: new Date().toISOString(), sent: false
    });

    const msg = '\u{1F4AA} <b>Seu VIP expirou, mas trouxemos um presente!</b>\n\nOl\u00E1 ' + (lead.nome || 'trader') + '! Percebemos que seu acesso VIP ao BTC Weather Panel expirou.\n\nComo cortesia, geramos um <b>novo c\u00F3digo de 7 dias</b> para voc\u00EA:\n\nC\u00F3digo: <code>' + newCode + '</code>\n\nAtive em:\nhttps://btcweatherpanel.com/btc-weather-panel/?code=' + newCode + '\n\nAproveite e veja o que h\u00E1 de novo no painel!';

    const sent = await sendTelegram(lead.telegram_id, msg);
    if (sent && sent.ok) {
      pendingCodes[pendingCodes.length - 1].sent = true;
      appendEvent({ agent: 'retentor', action: 'winback', leadId: lead.id, oldCode: code, newCode, sent: true });
      results.push({ lead: lead.nome, oldCode: code, newCode, sent: true });
      disparados++;
    }
  }

  writeJSON(PENDING_CODES_PATH, pendingCodes);
  console.log(JSON.stringify({ ok: true, processed: results.length, results }, null, 2));
}

if (require.main === module) run();
module.exports = { run };
