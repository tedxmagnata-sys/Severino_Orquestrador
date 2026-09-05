const http = require('http');

const BASE = 'http://127.0.0.1:3334';
const SECRET = process.env.ECOSYSTEM_SECRET || '';

function post(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3334,
      path: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Admin-Secret': SECRET }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function capturar(opts = {}) {
  const source = opts.source || 'manual';
  const items = Array.isArray(opts.items) ? opts.items : [opts];
  const results = [];
  for (const item of items) {
    const lead = {
      nome: item.nome || '',
      telefone: item.telefone || '',
      email: item.email || '',
      fonte: item.fonte || source
    };
    const res = await post('/api/ecosystem/leads', lead);
    results.push(res);
  }
  return { ok: true, added: results.length, results };
}

async function run() {
  const source = process.argv[2] || 'manual';
  const items = [{ nome: process.argv[3] || 'Visitante', email: process.argv[4] || '', telefone: process.argv[5] || '', fonte: source }];
  const res = await capturar({ source, items });
  console.log(JSON.stringify(res, null, 2));
}

if (require.main === module) run();
module.exports = { capturar };
