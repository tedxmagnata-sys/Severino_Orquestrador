// Template de micro-SaaS para o ecossistema Severino.
// Cada produto roda em SUA porta (PM2 próprio) — nunca edite o servidor.js.
// Copie este arquivo para /root/severino/produtos/<slug>/app.js e ajuste a PORTA.
const http = require('http');
const fs = require('fs');
const path = require('path');

// PORTA vem de: env PORTA → argv[2] → default. (o provisioner passa via env)
const PORTA = process.env.PORTA || (process.argv[2] && parseInt(process.argv[2], 10)) || 3340;
const PUB = path.join(__dirname, 'public');

// Catalog binding (opcional): lê o catálogo central para manter tudo em um lugar.
let PRODUTO = {};
try {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ecosystem', 'produtos.json'), 'utf8'));
  const slug = process.env.SLUG || 'produto-novo';
  PRODUTO = Object.values(cat).find(p => p.slug === slug) || {};
} catch {}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];

  // GET / — landing page simples do produto
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    fs.readFile(path.join(PUB, 'index.html'), (e, html) => {
      if (e) return json(res, 500, { error: 'public/index.html nao existe' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  // POST /api/trial — ativa trial (padrão do ecossistema; o orquestrador chama com x-ecosystem:1)
  if (req.method === 'POST' && url === '/api/trial') {
    const body = await parseBody(req);
    const code = 'PROD-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    // TODO: salvar em data/trials.json (modelo igual ao btcweather data/licenses.json)
    json(res, 200, { ok: true, code, tier: 'vip', daysLeft: 7 });
    return;
  }

  // GET /api/health — usado pelo PM2/nginx para monitorar
  if (req.method === 'GET' && url === '/api/health') {
    json(res, 200, { ok: true, produto: PRODUTO.slug || 'produto-novo', hora: new Date().toISOString() });
    return;
  }

  json(res, 404, { error: 'rota nao encontrada' });
});

server.listen(PORTA, () => console.log(`[${PRODUTO.slug || 'produto-novo'}] ouvindo em :${PORTA}`));
