const fs = require('fs');
const path = require('path');
const https = require('https');

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

const DATA_DIR = '/root/severino/data';
const LICENSE_PATH = path.join(DATA_DIR, 'licenses.json');
const PURCHASES_PATH = path.join(DATA_DIR, 'purchases.json');

function readObj(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function readArr(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function writeJSON(p, d) { try { fs.writeFileSync(p, JSON.stringify(d, null, 2)); } catch {} }

function generateCode() {
  const prefix = 'VIP7-';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return prefix + code;
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

async function main() {
  const args = process.argv.slice(2);
  const payload = args.join(' ');

  let data;
  try { data = JSON.parse(payload); } catch {
    try {
      const stdin = fs.readFileSync('/dev/stdin', 'utf8').trim();
      data = JSON.parse(stdin);
    } catch {
      console.log(JSON.stringify({ error: 'Provide JSON as argument or pipe to stdin' }));
      process.exit(1);
    }
  }

  // Normalize purchase data from various gateways
  const tx = data.transaction || data.id || data.transaction_id || '';
  const gateway = data.gateway || (data.kiwify ? 'kiwify' : (data.hotmart ? 'hotmart' : (data.payment_gateway || 'manual')));
  const customerName = data.customer_name || data.name || data.nome || data.buyer?.name || data.kiwify?.customer_name || '';
  const customerEmail = data.customer_email || data.email || data.buyer?.email || data.kiwify?.customer_email || '';
  const plan = data.plan || data.product_name || data.produto || 'vip_mensal';
  const value = data.value || data.price || data.amount || 0;

  if (!customerEmail && !tx) {
    console.log(JSON.stringify({ error: 'Missing customer_email or transaction id' }));
    process.exit(1);
  }

  // Generate license
  const licenses = readObj(LICENSE_PATH);
  let code = generateCode();
  while (licenses[code]) code = generateCode();

  licenses[code] = {
    createdAt: new Date().toISOString(),
    activatedAt: null,
    source: 'purchase:' + gateway,
    plan,
    customerName,
    customerEmail,
    transactionId: tx,
    value
  };
  writeJSON(LICENSE_PATH, licenses);

  // Record purchase
  const purchases = readArr(PURCHASES_PATH);
  purchases.push({
    transactionId: tx,
    gateway,
    customerName,
    customerEmail,
    plan,
    value,
    code,
    createdAt: new Date().toISOString()
  });
  writeJSON(PURCHASES_PATH, purchases);

  const result = { ok: true, code, customerName, customerEmail, plan };

  // Send to admin Telegram if configured
  const adminChat = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '';
  if (adminChat) {
    const msg = [
      '\u{1F4B0} <b>Nova compra!</b>',
      'Cliente: ' + (customerName || customerEmail),
      'Plano: ' + plan,
      'Valor: R$ ' + value,
      'C\u00F3digo: <code>' + code + '</code>',
      'Gateway: ' + gateway
    ].join('\n');
    await sendTelegram(adminChat, msg);
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
