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

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function readObj(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function appendEvent(ev) {
  try {
    const events = readJSON(EVENTS_PATH);
    events.push({ ...ev, timestamp: new Date().toISOString() });
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));
  } catch(e) {}
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
  const leads = readJSON(LEADS_PATH);
  const licenses = readObj(LICENSES_PATH);
  const now = Date.now();
  const pendingCodes = readJSON('/root/severino/ecosystem/pending_codes.json');
  const DAY = 86400000;
  const results = [];

  for (const [code, lic] of Object.entries(licenses)) {
    if (!lic.activatedAt) continue;
    const activatedMs = new Date(lic.activatedAt).getTime();
    const daysSince = Math.floor((now - activatedMs) / DAY);
    if (daysSince < 1 || daysSince > 6) continue;

    // Find lead via pending_codes
    const pc = pendingCodes.find(p => p.codigo === code);
    const lead = pc ? leads.find(l => l.telegram_id == pc.telegram_id || l.id === pc.leadId) : null;
    if (!lead || !lead.telegram_id) continue;

    let msg = '';
    if (daysSince === 0 || daysSince === 1) {
      msg = '\u{1F44B} <b>Bem-vindo ao BTC Weather Panel!</b>\n\nSeu acesso VIP foi ativado com sucesso! Aqui vai uma dica r\u00E1pida:\n\n\u{2022} Confira o <b>Radar de Sinais</b> na aba principal\n\u{2022} Ative os <b>Alertas de Pre\u00E7o</b> para n\u00E3o perder movimentos\n\u{2022} O <b>clima do Bitcoin</b> \u00E9 atualizado a cada 15 minutos\n\nQual d\u00FAvida, \u00E9 s\u00F3 chamar no @btcweatherpanel_bot!';
    } else if (daysSince === 3) {
      msg = '\u{1F4A1} <b>J\u00E1 conhece todos os recursos?</b>\n\nVoc\u00EA est\u00E1 no ' + (daysSince + 1) + '\u00BA dia de teste VIP. N\u00E3o esque\u00E7a de:\n\n\u{2022} Explorar a <b>Estrat\u00E9gia SMC</b> (VIP)\n\u{2022} Usar os <b>timeframes de 1H e 4H</b> para day trade\n\u{2022} Conferir os <b>sinais de COMPRA/VENDA</b> em tempo real\n\nSeu acesso dura 7 dias — aproveite!';
    } else if (daysSince === 5 || daysSince === 6) {
      const daysLeft = 7 - daysSince;
      msg = '\u{23F3} <b>Seu VIP est\u00E1 acabando!</b>\n\nRestam apenas <b>' + daysLeft + ' dia' + (daysLeft > 1 ? 's' : '') + '</b> de acesso VIP.\n\nPara continuar recebendo sinais e an\u00E1lises em tempo real:\n\n\u{27A1} Acesse o painel e clique em <b>Assinar</b>\n\u{27A1} Ou fale conosco pelo suporte\n\nN\u00E3o perca a oportunidade de operar com o melhor timing do mercado!';
    }

    if (msg) {
      const sent = await sendTelegram(lead.telegram_id, msg);
      appendEvent({ agent: 'onboarder', action: 'followup', leadId: lead.id, code, day: daysSince + 1, sent: !!(sent && sent.ok) });
      results.push({ lead: lead.nome, code, day: daysSince + 1, sent: !!(sent && sent.ok) });
    }
  }

  console.log(JSON.stringify({ ok: true, processed: results.length, results }, null, 2));
}

if (require.main === module) run();
module.exports = { run };
