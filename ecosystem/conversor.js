const fs = require('fs');
const https = require('https');
const path = require('path');

// Load .env
const envContent = fs.readFileSync('/root/severino/.env', 'utf8');
envContent.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx > -1) { process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim(); }
});

const http = require('http');
const SECRET = process.env.SECRET_KEY || '';
const LEADS_PATH = '/root/severino/ecosystem/leads.json';
const CODES_PATH = '/root/severino/ecosystem/pending_codes.json';
const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

function api(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port: 3340, path: endpoint, method,
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
    if (!TOKEN || !chatId) return resolve(false);
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false });
    const opts = { hostname: 'api.telegram.org', port: 443, path: '/bot' + TOKEN + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
    const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(false); } }); });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

async function run() {
  const leads = loadJSON(LEADS_PATH);
  const hot = leads.filter(l => (l.status === 'quente' || l.status === 'novo') && l.fonte === 'telegram');
  console.log('hot_telegram_leads:', hot.length);

  const pendingCodes = loadJSON(CODES_PATH);
  const results = [];

  for (const lead of hot.slice(0, 10)) {
    try {
      // Generate code via internal API
      const res = await api('POST', '/api/license/generate', { count: 1, source: 'conversor_telegram' });
      const code = (res && res.codes && res.codes[0]) || '';
      if (!code) continue;

      // Store pending code for this lead
      pendingCodes.push({
        leadId: lead.id,
        nome: lead.nome || 'Lead',
        codigo: code,
        telegram_id: lead.telegram_id || null,
        telegram_username: lead.telegram_username || '',
        createdAt: new Date().toISOString(),
        sent: false
      });

      const message = '\u{1F680} Ol\u00E1 ' + (lead.nome || 'trader') + '!\n\nAcesso VIP liberado por 7 dias no BTC Weather Panel:\n\nC\u00F3digo: <code>' + code + '</code>\n\nAtive em:\nhttps://btcweatherpanel.com/btc-weather-panel/?code=' + code + '\n\nConfira os sinais em tempo real!';

      // Try to send directly if we have telegram_id
      if (lead.telegram_id) {
        const sent = await sendTelegram(lead.telegram_id, message);
        if (sent && sent.ok) {
          pendingCodes[pendingCodes.length - 1].sent = true;
          console.log('sent_direct:', lead.id, lead.nome);
        }
      }

      results.push({ leadId: lead.id, code, nome: lead.nome });
      console.log('code_generated:', lead.id, code);
    } catch (e) {
      console.error('erro lead:', lead.id, e.message);
    }
  }

  saveJSON(CODES_PATH, pendingCodes);

  // Send broadcast summary to default chat
  if (results.length > 0) {
    const broadcast = '\u{1F514} <b>C\u00F3digos VIP gerados pelo Conversor</b>\n\n' + results.map(r => '\u{2022} ' + (r.nome || 'Lead ' + r.leadId) + ': <code>' + r.codigo + '</code>').join('\n') + '\n\nAtive em: https://btcweatherpanel.com/btc-weather-panel/';
    await sendTelegram(CHAT_ID, broadcast);
  }

  console.log(JSON.stringify({ ok: true, converted: results.length, results }, null, 2));
}

if (require.main === module) run();
module.exports = { run };