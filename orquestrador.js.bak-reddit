/**
 * 🛰️ Orquestrador do Ecossistema — loop 24/7 + servidor próprio de API.
 *
 * Porta ECOSISTEMA_PORT (padrão 3335). É o único processo que:
 *  - processa a fila de eventos (bus) roteando para os agentes
 *  - expõe /api/ecosystem/* para o painel de comando e para o hook do Telegram
 *
 * Independência: este processo NÃO compartilha código com o servidor do
 * info-produto (btcweather). Fala com ele só por HTTP (POST /api/trial).
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bus = require('./bus');
const rota = require('./rota');
const ia = require('./ia');
const produtos = require('./produtos.json');

const MAX_HOPS = 5;
const LOG = path.join(__dirname, 'queue', 'orquestrador.log');
const STATUS = path.join(__dirname, 'queue', 'status.json');
const API_PORT = parseInt(process.env.ECOSISTEMA_PORT || '3335', 10);

const INICIO = new Date().toISOString();

function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.appendFileSync(LOG, linha + '\n');
  } catch {}
  console.log(linha);
}

let processando = false;

// ========== TRANSPARÊNCIA (agregados, sem PII) ==========
const TRANSPARENCIA_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ecossistema Severino — Transparência</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
  h1 { font-size: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
  .card { background: #1e293b; border-radius: 10px; padding: 14px 16px; }
  .card b { display: block; font-size: 22px; color: #38bdf8; }
  .card span { font-size: 12px; color: #94a3b8; }
  footer { margin-top: 24px; font-size: 12px; color: #64748b; }
  .ok { color: #4ade80; }
</style>
</head>
<body>
<h1>Ecossistema Severino — Transparência</h1>
<p class="ok">100% dos lucros: sustentação + ajuda a quem precisa.</p>
<div class="grid" id="cards">carregando...</div>
<footer id="meta"></footer>
<script>
fetch('api/ecosystem/transparencia').then(r => r.json()).then(d => {
  const c = d.custos, v = d.vendas, r = d.reembolsos, l = d.leads;
  const fmt = n => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
  const cards = [
    ['Receita total', 'R$ ' + fmt(v.receitaTotal), 'vendas: ' + v.total],
    ['Vendas hoje', v.hoje, 'pagamentos aprovados'],
    ['Reembolsos', r.total, 'honrados sem perguntas'],
    ['Custo LLM (dia)', 'US$ ' + fmt(c.custoEstimado), c.chamadas + ' chamadas / ' + c.tokens + ' tokens'],
    ['Leads no funil', l.total, JSON.stringify(l.porStatus)]
  ];
  document.getElementById('cards').innerHTML = cards.map(([t, b, s]) =>
    '<div class="card"><span>' + t + '</span><b>' + b + '</b><span>' + s + '</span></div>').join('');
  document.getElementById('meta').textContent = 'Atualizado em ' + new Date(d.atualizadoEm).toLocaleString('pt-BR');
}).catch(e => { document.getElementById('cards').textContent = 'erro: ' + e.message; });
</script>
</body>
</html>`;

function transparencia() {
  let orc = { dia: null, tokens: 0, chamadas: 0, custoUsd: 0 };
  try { orc = ia.lerOrcamento(); } catch {}
  let compras = [], reembolsos = [], leads = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'funil.json'), 'utf8'));
    compras = d.compras || [];
    reembolsos = d.reembolsos || [];
    leads = Object.values(d.leads || {});
  } catch {}
  const receita = compras.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const vendasHoje = compras.filter((c) => (c.ts || '').slice(0, 10) === hoje).length;
  const porStatus = {};
  leads.forEach((l) => { porStatus[l.status] = (porStatus[l.status] || 0) + 1; });
  return {
    ok: true,
    atualizadoEm: new Date().toISOString(),
    custos: { dia: orc.dia, chamadas: orc.chamadas, tokens: orc.tokens, custoEstimado: ((orc.tokens || 0) / 1000000) * (parseFloat(process.env.LLM_CUSTO_POR_MILHAO || '0.30')) },
    vendas: { total: compras.length, receitaTotal: Math.round(receita * 100) / 100, hoje: vendasHoje },
    reembolsos: { total: reembolsos.length },
    leads: { total: leads.length, porStatus },
    missao: '100% dos lucros: sustentacao + ajuda a quem precisa'
  };
}

function salvarStatus(extra = {}) {
  try {
    fs.mkdirSync(path.dirname(STATUS), { recursive: true });
    fs.writeFileSync(STATUS, JSON.stringify({ inicio: INICIO, ultimaRodada: new Date().toISOString(), ...extra }, null, 2));
  } catch {}
}

async function processarEvento(ev) {
  if (ev.hops >= MAX_HOPS) {
    bus.atualizarEstado(ev.id, 'falha', { erro: 'max_hops' });
    return;
  }
  const ctx = { bus, ia, orcamento: ia.lerOrcamento() };
  const r = await rota.processar(ev, ctx);
  if (r.novosEventos && r.novosEventos.length) {
    for (const novo of r.novosEventos) {
      bus.postar({ ...novo, origem: ev.id, hops: ev.hops + 1 });
    }
  }
  bus.atualizarEstado(ev.id, 'feito', { agente: r.agente, acao: r.acao });
}

async function ciclo() {
  if (processando) return;
  processando = true;
  try {
    const pend = bus.proximosPendentes(20);
    if (!pend.length) {
      salvarStatus({ pendentes: 0 });
      return;
    }
    log(`ciclo: ${pend.length} evento(s) pendente(s)`);
    for (const ev of pend) {
      try {
        await processarEvento(ev);
        log(`ok ${ev.tipo} -> ${rota.agenteDo(ev.tipo)} (${ev.id})`);
      } catch (e) {
        log(`ERRO ${ev.id} (${ev.tipo}): ${e.message}`);
        bus.atualizarEstado(ev.id, 'falha', { erro: e.message });
      } finally {
        bus.removerPendente(ev.id);
      }
    }
    salvarStatus({ pendentes: bus.contar().pendentes });
  } finally {
    processando = false;
  }
}

// ========== SERVIDOR PRÓPRIO (porta 3335) ==========
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function autenticado(req) {
  return (req.headers['x-admin-secret'] || '') === process.env.SECRET_KEY;
}

function json(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

http
  .createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const method = req.method || 'GET';

    // Rotas PÚBLICAS (sem secret): transparência agregada, sem PII
    if (method === 'GET' && rawUrl === '/api/ecosystem/transparencia') {
      return json(res, transparencia());
    }
    if (method === 'GET' && rawUrl.startsWith('/transparencia')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(TRANSPARENCIA_HTML);
    }

    if (!autenticado(req)) {
      return json(res, { error: 'Unauthorized' }, 401);
    }

    // GET /health — healthcheck do processo
    if (method === 'GET' && rawUrl === '/health') {
      return json(res, { ok: true, processo: 'ecossistema', inicio: INICIO, agora: new Date().toISOString() });
    }

    // GET /api/ecosystem/status
    if (method === 'GET' && rawUrl === '/api/ecosystem/status') {
      let orc = { dia: null, tokens: 0, chamadas: 0 };
      try {
        orc = ia.lerOrcamento();
      } catch {}
      let st = {};
      try {
        st = JSON.parse(fs.readFileSync(STATUS, 'utf8'));
      } catch {}
      return json(res, { ok: true, agora: new Date().toISOString(), fila: bus.contar(), orcamento: orc, orquestrador: st });
    }

    // GET /api/ecosystem/produtos
    if (method === 'GET' && rawUrl === '/api/ecosystem/produtos') {
      return json(res, { ok: true, produtos });
    }

    // GET /api/ecosystem/eventos?limite=N
    if (method === 'GET' && rawUrl.startsWith('/api/ecosystem/eventos')) {
      const u = new URL(rawUrl, 'http://localhost');
      const limite = parseInt(u.searchParams.get('limite') || '50', 10);
      return json(res, { ok: true, eventos: bus.ultimosEventos(limite) });
    }

    // POST /api/ecosystem/enviar
    if (method === 'POST' && rawUrl === '/api/ecosystem/enviar') {
      const body = await parseBody(req);
      if (!body.tipo) return json(res, { error: 'tipo required' }, 400);
      const ev = bus.postar({
        tipo: body.tipo,
        origem: body.origem || 'api',
        produto: body.produto || null,
        payload: body.payload || {}
      });
      return json(res, { ok: true, evento: ev });
    }

    // POST /api/ecosystem/limpar-pendentes
    if (method === 'POST' && rawUrl === '/api/ecosystem/limpar-pendentes') {
      fs.writeFileSync(path.join(__dirname, 'queue', 'pendentes.json'), '[]');
      return json(res, { ok: true });
    }

    return json(res, { error: 'Not Found' }, 404);
  })
  .listen(API_PORT, () => {
    console.log(`🛰️ Orquestrador do Ecossistema — API na porta ${API_PORT}`);
  });

console.log('🛰️ Orquestrador do Ecossistema iniciado — aguardando eventos');
salvarStatus({ pendentes: 0 });
setInterval(ciclo, 1000);
ciclo();

// Tick periódico de follow-ups (retentor) e renovação (cobrador).
// Só posta se houver leads relevantes no funil, pra não encher a fila à toa.
// Intervalo configurável (segundos).
const FOLLOWUP_INTERVAL = parseInt(process.env.ECOSISTEMA_FOLLOWUP_INTERVAL || '3600', 10) * 1000;
setInterval(() => {
  try {
    const funil = require('./funil');
    const leads = funil.listLeads();
    if (leads.some(l => l.status === 'vip')) {
      bus.postar({ tipo: 'tick.followups', origem: 'orquestrador', produto: null, payload: {} });
    }
    if (leads.some(l => l.status === 'vip' && l.email && !l.telegramId && !l.conviteEmail)) {
      bus.postar({ tipo: 'tick.captura', origem: 'orquestrador', produto: null, payload: {} });
    }
    if (leads.some(l => l.status === 'pago' && l.renovacaoEm)) {
      bus.postar({ tipo: 'tick.renovacao', origem: 'orquestrador', produto: null, payload: {} });
    }
  } catch {}
}, FOLLOWUP_INTERVAL);

// Relatório diário automático (Analista -> Estrategista). Checa a cada minuto
// e posta gerar.relatorio se a última execução passou do intervalo (default 24h).
const RELATORIO_STATE = path.join(__dirname, 'data', 'relatorio_state.json');
const RELATORIO_INTERVAL = parseInt(process.env.ECOSISTEMA_RELATORIO_INTERVAL_HORAS || '24', 10) * 3600000;
setInterval(() => {
  try {
    let ult = 0;
    try { ult = JSON.parse(fs.readFileSync(RELATORIO_STATE, 'utf8')).ts || 0; } catch {}
    if (Date.now() - (new Date(ult).getTime() || 0) >= RELATORIO_INTERVAL) {
      fs.writeFileSync(RELATORIO_STATE, JSON.stringify({ ts: new Date().toISOString() }));
      bus.postar({ tipo: 'gerar.relatorio', origem: 'orquestrador', produto: null, payload: {} });
    }
  } catch {}
}, 60000);

// Tick de conteúdo (Videasta). Posta tick.conteudo a cada intervalo para o
// Videasta verificar pendentes e (se ocioso + com campanha + abaixo do limite
// diário) submeter uma nova geração. Intervalo configurável em segundos
// (default 600 = 10 min).
const CONTEUDO_INTERVAL = parseInt(process.env.ECOSISTEMA_CONTEUDO_INTERVAL || '600', 10) * 1000;
setInterval(() => {
  try {
    bus.postar({ tipo: 'tick.conteudo', origem: 'orquestrador', produto: null, payload: {} });
  } catch {}
}, CONTEUDO_INTERVAL);

// Tick de prospecção ativa (Prospector — Instagram). Posta tick.prospeccao a cada
// intervalo (default 3600s = 1h) para o Prospector varrer comentários novos e
// responder com CTA do bot. Intervalo configurável via ECOSISTEMA_PROSPECCAO_INTERVAL.
const PROSPECCAO_INTERVAL = parseInt(process.env.ECOSISTEMA_PROSPECCAO_INTERVAL || '3600', 10) * 1000;
setInterval(() => {
  try {
    bus.postar({ tipo: 'tick.prospeccao', origem: 'orquestrador', produto: null, payload: {} });
  } catch {}
}, PROSPECCAO_INTERVAL);