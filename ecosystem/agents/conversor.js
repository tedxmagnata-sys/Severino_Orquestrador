const fs = require('fs');
const http = require('http');
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
const SECRET = process.env.SECRET_KEY || '';
const BASE = 'http://127.0.0.1:3334';

function request(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3334,
      path: endpoint,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': SECRET,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getHotLeads() {
  const res = await request('GET', '/api/ecosystem/leads');
  const leads = Array.isArray(res) ? res : [];
  return leads.filter(l => (l.status === 'quente' || l.status === 'novo') && (l.score >= 2 || l.fonte === 'whatsapp' || l.fonte === 'telegram'));
}

async function gerarCodigo(qtd = 1) {
  const res = await request('POST', '/api/license/generate', { count: qtd, source: 'conversor' });
  return (res && res.codes) ? res.codes : [];
}

function montarMensagem(lead, code) {
  const link = `${BASE}/btc-weather-panel/?code=${code}`;
  return `ðŸš€ OlÃ¡ ${lead.nome || 'traders'}!\n\nAcesso VIP liberado por 7 dias no BTC Weather Panel:\nðŸ‘‰ ${link}\n\nUse o cÃ³digo: ${code}\n\nAtive em segundos e confira os sinais em tempo real.`;
}

async function run() {
  const leads = await getHotLeads();
  console.log('hot_leads:', leads.length);
  const results = [];
  for (const lead of leads.slice(0, 10)) {
    try {
      const codes = await gerarCodigo(1);
      const code = codes[0];
      if (!code) continue;
      const message = montarMensagem(lead, code);
      results.push({ leadId: lead.id, code, message });
      console.log('converted:', lead.id, code);
    } catch (e) {
      console.error('erro lead:', lead.id, e.message);
    }
  }
  console.log(JSON.stringify({ ok: true, converted: results.length, results }, null, 2));
}

if (require.main === module) run();
module.exports = { getHotLeads, gerarCodigo, montarMensagem };
