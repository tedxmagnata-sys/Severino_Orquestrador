/**
 * EbookLab Engine — Servidor HTTP (zero dependências)
 * API REST + dashboard mobile-first. Roda standalone na VPS.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const engine = require('./engine');
const ia = require('./ia');
const muapi = require('./muapi');

const PORT = parseInt(ia.env('PORT', '3336'), 10);
const ADMIN_SECRET = ia.env('ADMIN_SECRET', 'ebooklab-admin');
const BASE = (ia.env('BASE_PATH', '') || '').replace(/\/+$/, '');
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS = path.join(DATA_DIR, 'projetos.jsonl');
const COMPRADORES = path.join(DATA_DIR, 'compradores.json');
const ACESSOS = path.join(DATA_DIR, 'acessos.json');
const USO = path.join(DATA_DIR, 'uso.json');
const FREE_LIMIT_DIA = parseInt(ia.env('FREE_LIMIT_DIA', '3'), 10);
const PRO_LIMIT_DIA = parseInt(ia.env('PRO_LIMIT_DIA', '25'), 10);
const KIWIFY_SECRET = ia.env('KIWIFY_WEBHOOK_SECRET', '');
const CHECKOUT_URL = ia.env('KIWIFY_CHECKOUT_URL', '#');
const PRODUTO_NOME = ia.env('PRODUTO_NOME', 'EbookLab Engine');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

process.on('uncaughtException', (e) => console.error('ERRO não-crítico:', e.message));
process.on('unhandledRejection', (e) => console.error('Promise rejeitada:', e.message));

const rateLimitMap = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const max = 10;
  const timestamps = (rateLimitMap.get(ip) || []).filter((t) => now - t < 60000);
  if (timestamps.length >= max) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function lerJSON(file, padrao) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return padrao; }
}

function salvarJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function ipDo(req) {
  const fwd = req.headers['x-forwarded-for'];
  return String(fwd ? fwd.split(',')[0].trim() : (req.socket.remoteAddress || '')).replace(/^::ffff:/, '');
}

function tokenDo(req) {
  return String(req.headers['x-access-token'] || '').trim();
}

function buscarAcesso(token) {
  if (!token) return null;
  const lista = lerJSON(ACESSOS, []);
  return lista.find((a) => a.token === token) || null;
}

function registrarAcesso(email, ip) {
  const lista = lerJSON(ACESSOS, []);
  const existente = lista.find((a) => a.email === email && a.ativo !== false);
  if (existente) return existente;
  const token = Buffer.from(require('crypto').randomBytes(18)).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  const novo = { email: String(email).toLowerCase(), token, criado_em: new Date().toISOString(), ip, ativo: true };
  lista.push(novo);
  salvarJSON(ACESSOS, lista);
  return novo;
}

function gerarTokenAdmin() {
  const t = Buffer.from(require('crypto').randomBytes(12)).toString('hex').toUpperCase().slice(0, 12);
  return 'LB-' + t.match(/.{1,4}/g).join('-');
}

function planoDo(req) {
  const a = buscarAcesso(tokenDo(req));
  return a ? { plano: 'pro', email: a.email } : { plano: 'free' };
}

function chaveUso(req, plano) {
  if (plano === 'pro') return 'token:' + tokenDo(req);
  return 'ip:' + ipDo(req);
}

function usoDe(chave, limite) {
  const uso = lerJSON(USO, {});
  const dia = hoje();
  if (!uso.dias) uso.dias = {};
  const hojeUso = uso.dias[dia] || {};
  const usados = hojeUso[chave] || 0;
  return { uso, usados, restantes: Math.max(0, limite - usados) };
}

function marcarUso(chave) {
  const uso = lerJSON(USO, {});
  if (!uso.dias) uso.dias = {};
  const dia = hoje();
  if (!uso.dias[dia]) uso.dias[dia] = {};
  uso.dias[dia][chave] = (uso.dias[dia][chave] || 0) + 1;
  salvarJSON(USO, uso);
}

function lerProjetos() {
  try {
    return fs.readFileSync(PROJECTS, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

function lerProjeto(id) {
  return lerProjetos().find((p) => p.id === id) || null;
}

function salvarProjetos(lista) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROJECTS, lista.map((p) => JSON.stringify(p)).join('\n') + '\n');
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendFile(res, filepath) {
  fs.readFile(filepath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 — não encontrado');
    }
    const ext = path.extname(filepath).toLowerCase();
    if (ext === '.html' && data) {
      data = Buffer.from(String(data).replace('"__LB_BASE__"', JSON.stringify(BASE)));
    }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    let total = 0;
    req.on('data', (c) => { total += c.length; if (total < 1e6) body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function isAdmin(req) {
  return req.headers['x-admin-secret'] === ADMIN_SECRET;
}

const rotas = [
  { m: 'GET', re: new RegExp('^' + BASE + '/api/health$'), async fn() { return { ok: true, nome: PRODUTO_NOME + ' v1.0', modelo: ia.modelos().barato, tem_capa: muapi.disponivel(), base: BASE }; } },
  { m: 'GET', re: new RegExp('^' + BASE + '/api/config$'), async fn(req) {
    const plano = planoDo(req);
    const chave = chaveUso(req, plano.plano);
    const limite = plano.plano === 'pro' ? PRO_LIMIT_DIA : FREE_LIMIT_DIA;
    const uso = usoDe(chave, limite);
    const capa = muapi.disponivel();
    return {
      status: 'success',
      tem_capa: capa,
      modelo_capa: capa ? muapi.modeloPadrao() : null,
      base: BASE,
      produto: PRODUTO_NOME,
      plano,
      free_limit_dia: FREE_LIMIT_DIA,
      pro_limit_dia: PRO_LIMIT_DIA > 0 ? PRO_LIMIT_DIA : 0,
      usados_dia: uso.usados,
      limite_dia: limite,
      checkout_url: CHECKOUT_URL,
      kiwify_ativa: !!KIWIFY_SECRET
    };
  } },
  {
    m: 'GET', re: new RegExp('^' + BASE + '/api/plan$'),
    async fn(req) {
      const plano = planoDo(req);
      const chave = chaveUso(req, plano.plano);
      const limite = plano.plano === 'pro' ? PRO_LIMIT_DIA : FREE_LIMIT_DIA;
      const uso = usoDe(chave, limite);
      return { status: 'success', plano, free_limit_dia: FREE_LIMIT_DIA, pro_limit_dia: PRO_LIMIT_DIA > 0 ? PRO_LIMIT_DIA : 0, usados_dia: uso.usados, limite_dia: limite, restantes: uso.restantes };
    }
  },
  {
    m: 'POST', re: new RegExp('^' + BASE + '/api/unlock$'),
    async fn(req) {
      const body = await parseBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { code: 400, body: { status: 'error', erro: 'E-mail inválido' } };
      const compradores = lerJSON(COMPRADORES, {});
      const comprador = compradores.emails && compradores.emails[email];
      if (!comprador || comprador.ativo === false) {
        return { code: 403, body: { status: 'error', erro: 'E-mail não encontrado como comprador. Use o mesmo e-mail da compra na Kiwify.' } };
      }
      const acesso = registrarAcesso(email, ipDo(req));
      return { body: { status: 'success', token: acesso.token, email: acesso.email, plano: 'pro' } };
    }
  },
  {
    m: 'POST', re: new RegExp('^' + BASE + '/api/kiwify/webhook$'),
    async fn(req) {
      const body = await parseBody(req);
      const secret = String(body.secret || req.headers['x-webhook-secret'] || req.headers['x-kiwify-token'] || '').trim();
      if (KIWIFY_SECRET && secret !== KIWIFY_SECRET) {
        return { code: 403, body: { status: 'error', erro: 'webhook não autorizado' } };
      }
      const evt = String(body.event || body.order_status || '').toLowerCase();
      const PAID = ['compra_aprovada', 'order.paid', 'order.payment_confirmed', 'purchase_approved', 'payment_confirmed', 'payment_received', 'paid', 'approved', 'completed'];
      const CANCEL = ['compra_reembolsada', 'compra_recusada', 'chargeback', 'subscription_canceled', 'refunded', 'canceled', 'refused'];
      if (CANCEL.includes(evt)) {
        const email = String(body.customer_email || (body.kiwify && body.kiwify.customer_email) || '').toLowerCase();
        if (email) {
          const c = lerJSON(COMPRADORES, {});
          if (c.emails && c.emails[email]) { c.emails[email].ativo = false; salvarJSON(COMPRADORES, c); }
        }
        return { body: { status: 'success', evento: evt } };
      }
      const pago = PAID.includes(evt) || String(body.order_status || '').toLowerCase() === 'paid';
      if (!pago) return { body: { status: 'ignored', evento: evt } };
      const email = String(body.customer_email || (body.kiwify && body.kiwify.customer_email) || '').trim().toLowerCase();
      const tx = String(body.kiwify && body.kiwify.id ? body.kiwify.id : (body.transaction || body.id || body.order_id || '')).trim();
      const produto = String(body.kiwify && body.kiwify.product_name ? body.kiwify.product_name : (body.product_name || body.product || PRODUTO_NOME)).trim();
      if (!email) return { body: { status: 'error', erro: 'sem email' } };
      const c = lerJSON(COMPRADORES, {});
      if (!c.emails) c.emails = {};
      c.emails[email] = { email, tx, produto, data: new Date().toISOString(), ativo: true };
      salvarJSON(COMPRADORES, c);
      return { body: { status: 'success', evento: evt, email, produto } };
    }
  },
  {
    m: 'GET', re: new RegExp('^' + BASE + '/api/admin/compradores$'),
    async fn(req) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      return { body: { status: 'success', compradores: lerJSON(COMPRADORES, {}) } };
    }
  },
  {
    m: 'GET', re: new RegExp('^' + BASE + '/api/admin/acessos$'),
    async fn(req) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      return { body: { status: 'success', acessos: lerJSON(ACESSOS, []) } };
    }
  },
  {
    m: 'POST', re: new RegExp('^' + BASE + '/api/admin/unlock$'),
    async fn(req) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      const body = await parseBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return { code: 400, body: { status: 'error', erro: 'E-mail obrigatório' } };
      const c = lerJSON(COMPRADORES, {});
      if (!c.emails) c.emails = {};
      c.emails[email] = c.emails[email] || { email, data: new Date().toISOString() };
      c.emails[email].ativo = true;
      c.emails[email].tx = c.emails[email].tx || 'admin';
      salvarJSON(COMPRADORES, c);
      const acesso = registrarAcesso(email, 'admin');
      return { body: { status: 'success', email, token: acesso.token, codigo: gerarTokenAdmin() } };
    }
  },
  {
    m: 'POST', re: new RegExp('^' + BASE + '/api/admin/limpar_uso$'),
    async fn(req) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      salvarJSON(USO, { dias: {} });
      return { body: { status: 'success' } };
    }
  },
  {
    m: 'GET', re: new RegExp('^' + BASE + '/api/projects$'),
    async fn(req) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      const lista = lerProjetos().map((p) => ({ id: p.id, criado_em: p.criado_em, titulo: p.schema?.data?.ebook?.titulo, input: p.input }));
      return { body: { status: 'success', projetos: lista } };
    }
  },
  {
    m: 'GET', re: new RegExp('^' + BASE + '/api/projects/([A-Za-z0-9]+)$'),
    async fn(req, m) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      const p = lerProjeto(m[1]);
      if (!p) return { code: 404, body: { status: 'error', erro: 'Projeto não encontrado' } };
      return { body: p };
    }
  },
  {
    m: 'PUT', re: new RegExp('^' + BASE + '/api/projects/([A-Za-z0-9]+)$'),
    async fn(req, m) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      const body = await parseBody(req);
      const lista = lerProjetos();
      const idx = lista.findIndex((p) => p.id === m[1]);
      if (idx === -1) return { code: 404, body: { status: 'error', erro: 'Projeto não encontrado' } };
      lista[idx].schema = body.schema || lista[idx].schema;
      lista[idx].atualizado_em = new Date().toISOString();
      salvarProjetos(lista);
      return { body: { status: 'success', id: m[1] } };
    }
  },
  {
    m: 'DELETE', re: new RegExp('^' + BASE + '/api/projects/([A-Za-z0-9]+)$'),
    async fn(req, m) {
      if (!isAdmin(req)) return { code: 403, body: { status: 'error', erro: 'Não autorizado' } };
      const lista = lerProjetos().filter((p) => p.id !== m[1]);
      salvarProjetos(lista);
      return { body: { status: 'success' } };
    }
  },
  {
    m: 'POST', re: new RegExp('^' + BASE + '/api/generate$'),
    async fn(req) {
      if (!rateLimit(req.socket.remoteAddress)) return { code: 429, body: { status: 'error', erro: 'Muitas requisições — aguarde um minuto' } };
      const body = await parseBody(req);
      const plano = planoDo(req);
      const chave = chaveUso(req, plano.plano);
      if (plano.plano !== 'pro') {
        const uso = usoDe(chave, FREE_LIMIT_DIA);
        if (uso.restantes <= 0) {
          return {
            code: 402,
            body: { status: 'error', erro: `Limite gratuito de ${FREE_LIMIT_DIA} gerações/dia atingido`, checkout_url: CHECKOUT_URL, plano: 'free' }
          };
        }
      } else if (PRO_LIMIT_DIA > 0) {
        const uso = usoDe(chave, PRO_LIMIT_DIA);
        if (uso.restantes <= 0) {
          return {
            code: 402,
            body: { status: 'error', erro: `Limite diário Pro de ${PRO_LIMIT_DIA} gerações atingido (uso justo). Volte amanhã.`, plano: 'pro' }
          };
        }
      }
      try {
        const r = await engine.gerarInfoproduto({
          tema: body.tema,
          publico: body.publico,
          objetivo: body.objetivo,
          idioma: body.idioma || 'pt-br',
          gerarCapa: !!body.gerarCapa,
          capaAspecto: body.capaAspecto || '1:1'
        });
        if (r.status === 'error') return { code: 400, body: r };
        if (plano.plano !== 'pro' || PRO_LIMIT_DIA > 0) marcarUso(chave);
        return { body: r };
      } catch (e) {
        console.error('Erro na geração:', e.message);
        return { code: 500, body: { status: 'error', erro: e.message } };
      }
    }
  }
];

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const method = req.method;

  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret, X-Access-Token');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  for (const r of rotas) {
    const m = url.match(r.re);
    if (m && r.m === method) {
      try {
        const out = await r.fn(req, m) || {};
        return sendJSON(res, out.code || 200, out.body ?? out);
      } catch (e) {
        return sendJSON(res, 500, { status: 'error', erro: e.message });
      }
    }
  }

  let filepath;
  if (method === 'GET' && (url === BASE + '/' || (BASE && url === BASE))) {
    if (BASE && url === BASE) {
      res.writeHead(301, { Location: BASE + '/' });
      return res.end();
    }
    filepath = path.join(PUBLIC, 'index.html');
  } else if (method === 'GET' && !url.startsWith('/api/') && url.startsWith(BASE + '/')) {
    filepath = path.join(PUBLIC, url.slice(BASE.length).replace(/^\/+/, ''));
    if (!filepath.startsWith(PUBLIC)) return sendJSON(res, 403, { status: 'error' });
  }

  if (filepath && fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
    return sendFile(res, filepath);
  }
  return sendJSON(res, 404, { status: 'error', erro: 'Rota não encontrada' });
}).listen(PORT, () => {
  console.log(`EbookLab Engine v1.0 rodando em http://localhost:${PORT}`);
});
