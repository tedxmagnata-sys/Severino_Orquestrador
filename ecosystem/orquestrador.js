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
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bus = require('./bus');
const rota = require('./rota');
const ia = require('./ia');
const canais = require('./canais');
const guardiao = require('./guardiao_saldo');
const produtos = require('./produtos.json');

const MAX_HOPS = 5;
const LOG = path.join(__dirname, 'queue', 'orquestrador.log');
const STATUS = path.join(__dirname, 'queue', 'status.json');
const API_PORT = parseInt(process.env.ECOSISTEMA_PORT || '3335', 10);
const WEBHOOK_SECRET_PATH = path.join(__dirname, 'queue', 'webhook_secret.txt');
let WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || '';
if (!WEBHOOK_SECRET) {
  try { WEBHOOK_SECRET = fs.readFileSync(WEBHOOK_SECRET_PATH, 'utf8').trim(); } catch {}
}
if (!WEBHOOK_SECRET) {
  WEBHOOK_SECRET = crypto.randomBytes(16).toString('hex');
  try { fs.writeFileSync(WEBHOOK_SECRET_PATH, WEBHOOK_SECRET); } catch {}
}
const PAUSED_PATH = path.join(__dirname, 'queue', 'pausados.json');

const INICIO = new Date().toISOString();

function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.appendFileSync(LOG, linha + '\n');
  } catch {}
  console.log(linha);
}

// Filtra compras de TESTE/validação (Kiwify envia webhook de teste com
// transactionId "test-..."; validação usa email @validacao.local; códigos
// de teste do gateway usam prefixo VIP7- quando não há transação real).
// O painel de resultados deve refletir apenas receita real.
function ehCompraReal(c) {
  if (!c) return false;
  const tid = String(c.transactionId || c.transaction_id || '').toLowerCase();
  const email = String(c.customer_email || c.email || '').toLowerCase();
  const codigo = String(c.code || '').toLowerCase();
  if (tid.startsWith('test') || tid.startsWith('simulacao') || tid.startsWith('sandbox')) return false;
  if (/@validacao\.local$/.test(email) || /^fallback@/.test(email)) return false;
  // Sem transactionId (não mapeado ao gateway) + código de teste VIP exploratório → descarta
  if (!tid && /^vip7-/.test(codigo)) return false;
  return true;
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
  compras = compras.filter(ehCompraReal);
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

// ========== PAINEL app.severinobot.com ==========
const PAINEL_HTML = path.join(__dirname, 'painel', 'index.html');
const DATA_SEVERINO = path.join(__dirname, '..', 'data');

function catalogoPainel() {
  return Object.values(produtos)
    .filter((p) => p.id !== 'padrao-produto-novo')
    .map((p) => ({
      id: p.id, nome: p.nome, slug: p.slug, url: p.url, status: p.status,
      plano: p.plano || null, checkoutUrl: p.checkoutUrl || null,
      checkoutAnualUrl: p.checkoutAnualUrl || null,
      argumentos: p.argumentos || []
    }));
}

function kpis() {
  let orc = { dia: null, tokens: 0, chamadas: 0 };
  try { orc = ia.lerOrcamento(); } catch {}

  let leads = [], compras = [], reembolsos = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'funil.json'), 'utf8'));
    leads = Object.values(d.leads || {});
    compras = d.compras || [];
    reembolsos = d.reembolsos || [];
  } catch {}
  compras = compras.filter(ehCompraReal);
  const porStatus = {};
  leads.forEach((l) => { porStatus[l.status] = (porStatus[l.status] || 0) + 1; });
  const pagos = porStatus.pago || 0;
  const receita = compras.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const vendasHoje = compras.filter((c) => (c.ts || '').slice(0, 10) === hoje).length;

  let licencasTotal = 0, licencasAtivas = 0;
  try {
    const lic = JSON.parse(fs.readFileSync(path.join(DATA_SEVERINO, 'licenses.json'), 'utf8'));
    const arr = Object.values(lic || {});
    const agora = Date.now();
    licencasTotal = arr.length;
    licencasAtivas = arr.filter((x) => x && x.expiresAt && new Date(x.expiresAt).getTime() > agora).length;
  } catch {}

  // Usuários REAIS do BTC Weather Panel = leads do funil com produto=btcweather.
  // (as 71 licenças em licenses.json são códigos VIP legados do severinobot, não do painel)
  const TESTE = /@(test|validacao|email\.com|teste\.com|test\.com)|^test|final@test|ok@test|vitrine@/i;
  const btcLeads = leads.filter((l) => l.produto === 'btcweather');
  const btcReais = btcLeads.filter((l) => !(l.email || '').match(TESTE) && !l.backfill);
  const btcHoje = btcLeads.filter((l) => (l.criadoEm || '').slice(0, 10) === hoje).length;
  let btcTrialsVital = 0;
  try {
    const lic = JSON.parse(fs.readFileSync(path.join(DATA_SEVERINO, 'licenses.json'), 'utf8'));
    btcTrialsVital = Object.values(lic || {}).filter((x) => x && x.vitalicio).length;
  } catch {}

  let telegram = 0;
  try {
    const n = JSON.parse(fs.readFileSync(path.join(DATA_SEVERINO, 'notifications.json'), 'utf8'));
    telegram = Object.keys(n || {}).length;
  } catch {}

  let st = {};
  try { st = JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch {}

  const eventos = bus.ultimosEventos(12);
  let saldoOpenRouter = null, saldoMuapi = null;
  for (let i = eventos.length - 1; i >= 0; i--) {
    const ev = eventos[i];
    if (ev.tipo === 'tick.saldo' && ev.acao) {
      const m1 = ev.acao.match(/openrouter:\s*(US\$[\d.]+)/i);
      const m2 = ev.acao.match(/muapi:\s*(US\$[\d.]+)/i);
      if (m1) saldoOpenRouter = m1[1];
      if (m2) saldoMuapi = m2[1];
      if (saldoOpenRouter || saldoMuapi) break;
    }
  }

  const leadsRecentes = leads
    .slice()
    .sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))
    .slice(0, 12)
    .map((l) => ({ criadoEm: l.criadoEm, status: l.status, nome: l.nome || null, email: l.email || null }));

  return {
    ok: true,
    agora: new Date().toISOString(),
    vendas: {
      total: compras.length,
      receitaTotal: Math.round(receita * 100) / 100,
      hoje: vendasHoje,
      reembolsos: reembolsos.length,
      licencasTotal, licencasAtivas
    },
    leads: {
      total: leads.length, porStatus, pagos,
      conversao: leads.length ? Math.round((pagos / leads.length) * 100) : 0,
      telegram
    },
    custos: {
      dia: orc.dia, chamadas: orc.chamadas, tokens: orc.tokens,
      custoEstimado: ((orc.tokens || 0) / 1000000) * (parseFloat(process.env.LLM_CUSTO_POR_MILHAO || '0.30')),
      saldoOpenRouter, saldoMuapi
    },
    sistema: { pendentes: (bus.contar() || {}).pendentes || 0, ultimaRodada: st.ultimaRodada || null },
    leadsRecentes,
    eventosRecentes: eventos.map((e) => ({ ts: e.ts, tipo: e.tipo, agente: e.agente || null, acao: e.acao || '', estado: e.estado })),
    produtos: catalogoPainel(),
    btcweather: {
      leads: btcLeads.length,
      reais: btcReais.length,
      hoje: btcHoje,
      trialsVitalicio: btcTrialsVital,
      nota: 'Conta só leads com produto=btcweather. Licenças legadas do severinobot NÃO entram aqui.'
    }
  };
}

// 🧭 Radar Estratégico — agente boot analista de mercado de info-products.
// Reúne os KPIs reais do ecossistema + contexto de mercado e consulta o LLM
// (modelo forte) para sugerir as melhores ondas para surfar. Exige admin.
async function radar() {
  let st = {};
  try { st = JSON.parse(fs.readFileSync(STATUS, 'utf8')); } catch {}
  let orc = { tokens: 0, chamadas: 0 };
  try { orc = ia.lerOrcamento(); } catch {}

  let leads = [], compras = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'funil.json'), 'utf8'));
    leads = Object.values(d.leads || {});
    compras = d.compras || [];
  } catch {}
  const porStatus = {};
  leads.forEach((l) => { porStatus[l.status] = (porStatus[l.status] || 0) + 1; });
  const receita = compras.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const eventos = bus.ultimosEventos(20);

  const sistema = [
    'Você é um analista global de mercado de info-products e estrategista de nicho.',
    'Você entende de funis digitais, micro-SaaS, ebooks, comunidades e criadores, e sabe onde está o dinheiro hoje.',
    'Você começa pela massa: fluxo de compra, linguagem do público, gatilhos. Surf as ondas, não rema contra.',
    'Sua missão: ler os dados reais do ecossistema abaixo e recomendar as MELHORES ondas para surfar agora.',
    'Responda em português, em Markdown, com as seções: "🎯 Ondas quentes pra surfar", "🧪 Hipóteses rápidas (testar em 48h)", "📈 Sinais do nosso próprio funil", "🚨 Riscos e o que eu evitaria".',
    'Liste entre 3 e 5 ondas quentes, cada uma com: nicho, produto sugerido, prazo, e 1 ação concreta imediata.',
    'Seja específico e acionável, não genérico.'
  ].join('\n');

  const contexto = [
    'DADOS REAIS DO ECOSSISTEMA (agora):',
    `- Leads no funil: ${leads.length} (${Object.entries(porStatus).map(([k, n]) => `${k}: ${n}`).join(', ')})`,
    `- Compras/pagamentos: ${compras.length} | receita total: R$ ${Math.round(receita)}`,
    `- Custo LLM hoje: US$ ${((orc.tokens || 0) / 1000000) * (parseFloat(process.env.LLM_CUSTO_POR_MILHAO || '0.30'))} (${orc.chamadas || 0} chamadas)`,
    `- Fila de eventos: ${(bus.contar() || {}).pendentes || 0} pendentes | última rodada: ${st.ultimaRodada || 'nunca'}`,
    `- Produtos do catálogo: ${catalogoPainel().map((p) => `${p.nome} [${p.status}]`).join(', ') || 'nenhum'}`,
    `- Eventos recentes: ${eventos.slice(0, 8).map((e) => e.tipo).join(', ') || 'nenhum'}`,
    '',
    'CONTEXTO DE MERCADO (info-products global):',
    '- Ondas em alta: IA aplicada a nichos, automação de pequenas empresas, monetização de tráfego, templates de IA, educação prática.',
    '- Brasil: público pagante crescendo em IA; inglês global tem ticket maior (US$).',
    '- Regra: produto alinhado à onda + CTA claro + prova social rápida = conversão.'
  ].join('\n');

  const resp = await ia.perguntar({
    agente: 'radar-estrategico',
    sistema,
    mensagens: [{ role: 'user', content: contexto }],
    modelo: 'forte',
    temperatura: 0.6
  });
  return { ok: true, geradoEm: new Date().toISOString(), analise: resp };
}

async function processarEvento(ev) {
  if (ev.hops >= MAX_HOPS) {
    bus.atualizarEstado(ev.id, 'falha', { erro: 'max_hops' });
    return;
  }
  const ctx = { bus, ia, orcamento: ia.lerOrcamento() };

  // 🛡️ Portão do Guardião de Saldos: antes de gastar crédito (LLM/MuAPI),
  // confirma que há saldo suficiente. Se crítico, bloqueia o evento e avisa.
  const gastaMuapi = ev.tipo === 'campanha.nova' || ev.tipo === 'tick.conteudo';
  const gastaLLM = [
    'tick.prospeccao', 'tick.prospeccao_reddit', 'tick.prospeccao_x',
    'gerar.relatorio', 'tick.followups', 'tick.captura', 'tick.renovacao'
  ].includes(ev.tipo);
  const evGasta = gastaMuapi || gastaLLM;
  if (evGasta) {
    const gate = await guardiao.garantirSaldo(gastaMuapi ? 'muapi' : 'openrouter');
    if (gate.bloqueado) {
      bus.atualizarEstado(ev.id, 'bloqueado', { agente: 'guardiao', motivo: 'saldo crítico', acao: 'gasto bloqueado por saldo' });
      return;
    }
  }

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
        try { bus.emitir({ agente: 'orquestrador', tipo: 'evento.processado', payload: { id: ev.id, tipo: ev.tipo, origem: ev.origem, resultado: 'ok' } }); } catch {}
      } catch (e) {
        log(`ERRO ${ev.id} (${ev.tipo}): ${e.message}`);
        bus.atualizarEstado(ev.id, 'falha', { erro: e.message });
        try { bus.emitir({ agente: 'orquestrador', tipo: 'evento.erro', payload: { id: ev.id, tipo: ev.tipo, erro: e.message } }); } catch {}
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

// ═══════════════════════════════════════════════
// 📞 Telegram — helpers de comando
// ═══════════════════════════════════════════════

function lerPausados() {
  try { return JSON.parse(fs.readFileSync(PAUSED_PATH, 'utf8') || '{}').pausados || []; }
  catch { return []; }
}

function salvarPausados(lista) {
  fs.writeFileSync(PAUSED_PATH, JSON.stringify({ pausados: [...new Set(lista)] }, null, 2));
}

async function processarComandoTelegram(msg) {
  const chatId = msg.chat?.id || msg.from?.id;
  if (!chatId) return;
  const admChat = process.env.TELEGRAM_CHAT_ID;
  if (String(chatId) !== String(admChat)) {
    await canais.enviarTelegram(chatId, '⛔ Não autorizado. Apenas o criador pode usar comandos.');
    return;
  }
  const text = (msg.text || '').trim();
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/status') {
    const k = kpis();
    const fila = bus.contar();
    const ultimos = bus.ultimosEventos(8);
    const agentesPausados = lerPausados();
    const resp = [
      '📊 *Status do Ecossistema*',
      `⏰ ${new Date().toLocaleString('pt-BR')}`,
      '',
      `💰 Receita total: R$ ${k.vendas.receitaTotal}`,
      `📦 Vendas: ${k.vendas.total} (hoje: ${k.vendas.hoje})`,
      `👥 Leads: ${k.leads.total} | Conversão: ${k.leads.conversao}%`,
      `📬 Telegram: ${k.leads.telegram} contatos`,
      `⚙️ Fila: ${fila.pendentes} pendentes | ${fila.totalLinhas} eventos`,
      `🎯 LLM: ${fila.porTipo?.['gerar.relatorio'] || 0} relatórios | ${fila.porTipo?.['tick.conteudo'] || 0} conteúdos`,
      `💵 Custo LLM hoje: US$ ${k.custos.custoEstimado?.toFixed?.(4) || '0'}`,
      agentesPausados.length ? `\n⏸️ Pausados: ${agentesPausados.join(', ')}` : '\n✅ Todos agentes ativos',
      '',
      `📡 Últimos eventos: ${ultimos.map(e => e.tipo).join(' · ') || 'nenhum'}`
    ].join('\n');
    await canais.enviarTelegram(chatId, resp);
    return;
  }

  if (cmd === '/pausar') {
    const agente = parts.slice(1).join(' ');
    if (!agente) { await canais.enviarTelegram(chatId, '❌ Use: /pausar <agente>'); return; }
    const pausados = lerPausados();
    if (pausados.includes(agente)) { await canais.enviarTelegram(chatId, `⏸️ ${agente} já está pausado.`); return; }
    salvarPausados([...pausados, agente]);
    bus.emitir({ agente: 'orquestrador', tipo: 'comando.pausar', payload: { agente } });
    await canais.enviarTelegram(chatId, `⏸️ *${agente}* pausado. Próximos ticks serão ignorados.`);
    return;
  }

  if (cmd === '/retomar') {
    const agente = parts.slice(1).join(' ');
    if (!agente) { await canais.enviarTelegram(chatId, '❌ Use: /retomar <agente>'); return; }
    const pausados = lerPausados().filter(a => a !== agente);
    salvarPausados(pausados);
    bus.emitir({ agente: 'orquestrador', tipo: 'comando.retomar', payload: { agente } });
    await canais.enviarTelegram(chatId, `▶️ *${agente}* retomado.`);
    return;
  }

  if (cmd === '/aprovar') {
    const id = parts[1];
    if (!id) { await canais.enviarTelegram(chatId, '❌ Use: /aprovar <id>'); return; }
    const aprovPath = path.join(__dirname, 'queue', 'aprovacoes.json');
    let aprov = {};
    try { aprov = JSON.parse(fs.readFileSync(aprovPath, 'utf8')); } catch {}
    aprov[id] = { aprovadoEm: new Date().toISOString(), por: 'criador' };
    fs.writeFileSync(aprovPath, JSON.stringify(aprov, null, 2));
    bus.emitir({ agente: 'orquestrador', tipo: 'comando.aprovar', payload: { id } });
    await canais.enviarTelegram(chatId, `✅ Aprovação registrada para \`${id}\`.`);
    return;
  }

  await canais.enviarTelegram(chatId, `❓ Comando desconhecido: ${cmd}\nDisponíveis: /status, /pausar <agente>, /retomar <agente>, /aprovar <id>`);
}

async function responderTelegram(chatId, texto) {
  return canais.enviarTelegram(chatId, texto);
}

// Ações de ESCRITA exigem um token separado (WRITE_SECRET), que o painel da
// web NÃO possui. Assim o acesso admin do dashboard é somente leitura;
// qualquer alteração passa só por aqui (opencode/processos internos do VPS).
function podeEscrever(req) {
  const ws = process.env.WRITE_SECRET;
  return autenticado(req) && !!ws && (req.headers['x-write-secret'] || '') === ws;
}

function json(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

http
  .createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const method = req.method || 'GET';

    // Rotas PÚBLICAS (sem secret): catálogo, painel, manifest.
    // Transparência fica protegida (admin) abaixo do check autenticado.

    // ========== PAINEL app.severinobot.com (público) ==========
    if (method === 'GET' && (rawUrl === '/' || rawUrl === '/painel' || rawUrl === '/painel.html' || rawUrl === '/index.html')) {
      try {
        const html = fs.readFileSync(PAINEL_HTML, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(html);
      } catch (e) {
        return json(res, { error: 'painel nao encontrado' }, 404);
      }
    }
    if (method === 'GET' && rawUrl === '/manifest.webmanifest') {
      const mf = path.join(__dirname, 'painel', 'manifest.webmanifest');
      try {
        res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' });
        return res.end(fs.readFileSync(mf));
      } catch (e) {
        return json(res, { error: 'manifest nao encontrado' }, 404);
      }
    }
    if (method === 'GET' && rawUrl === '/api/ecosystem/painel/catalogo') {
      return json(res, { ok: true, produtos: catalogoPainel() });
    }

    // 📞 Telegram Webhook (POST) — rota pública, validada por secret_token
    if (method === 'POST' && rawUrl === '/api/ecosystem/telegram') {
      const tokenHeader = req.headers['x-telegram-bot-api-secret-token'] || '';
      if (tokenHeader !== WEBHOOK_SECRET) {
        return json(res, { error: 'Invalid secret token' }, 403);
      }
      const body = await parseBody(req);
      if (body?.message) await processarComandoTelegram(body.message);
      return json(res, { ok: true });
    }

    if (!autenticado(req)) {
      return json(res, { error: 'Unauthorized' }, 401);
    }

    // ========== TRANSPARÊNCIA (só admin) ==========
    if (method === 'GET' && rawUrl === '/api/ecosystem/transparencia') {
      return json(res, transparencia());
    }
    if (method === 'GET' && rawUrl.startsWith('/transparencia')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(TRANSPARENCIA_HTML);
    }

    // ========== PAINEL app.severinobot.com (admin) ==========
    if (method === 'GET' && rawUrl === '/api/ecosystem/painel/kpis') {
      return json(res, kpis());
    }

    // 🧭 Radar Estratégico (admin): agente analista de mercado de info-products
    if (method === 'GET' && rawUrl === '/api/ecosystem/painel/radar') {
      try {
        const r = await radar();
        return json(res, r);
      } catch (e) {
        return json(res, { ok: false, error: e.message }, 500);
      }
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

    // POST /api/ecosystem/enviar — escrita: exige X-Write-Secret (opencode/interno)
    if (method === 'POST' && rawUrl === '/api/ecosystem/enviar') {
      if (!podeEscrever(req)) return json(res, { error: 'Unauthorized' }, 401);
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

    // POST /api/ecosystem/limpar-pendentes — escrita: exige X-Write-Secret
    if (method === 'POST' && rawUrl === '/api/ecosystem/limpar-pendentes') {
      if (!podeEscrever(req)) return json(res, { error: 'Unauthorized' }, 401);
      fs.writeFileSync(path.join(__dirname, 'queue', 'pendentes.json'), '[]');
      return json(res, { ok: true });
    }

    // GET /api/ecosystem/painel/saude — análisa saúde do ecossistema + estrategista IA
    if (method === 'GET' && rawUrl === '/api/ecosystem/painel/saude') {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'funil.json'), 'utf8'));
        const leads = Object.values(d.leads || {});
        const compras = (d.compras || []).filter(ehCompraReal);
        const reembolsos = d.reembolsos || [];

        // Licenças
        let licencas = {};
        try { licencas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'licenses.json'), 'utf8')); } catch {}

        // KPIs por produto
        const produtosLista = Object.entries(produtos).filter(([k]) => k !== 'padrao-produto-novo').map(([id, p]) => {
          const pLeads = leads.filter(l => l.produto === id || l.produto === p.slug);
          const pCompras = compras.filter(c => c.produto === id || c.produto === p.slug);
          const pReembolsos = reembolsos.filter(r => r.produto === id || r.produto === p.slug);
          const pLicencas = Object.values(licencas).filter(l => l.source === id || (l.customerEmail && pLeads.some(pl => pl.email === l.customerEmail)));
          const trialsAtivos = pLicencas.filter(l => l.activatedAt && !l.vitalicio).length;
          const trialsVitalicio = pLicencas.filter(l => l.vitalicio).length;
          const conversao = pLeads.length > 0 ? Math.round((pCompras.length / pLeads.length) * 100) : 0;
          return {
            id, nome: p.nome, status: p.status, slug: p.slug,
            leads: pLeads.length,
            trials: pLicencas.length,
            trialsAtivos, trialsVitalicio,
            vendas: pCompras.length,
            receita: pCompras.reduce((s, c) => s + (Number(c.value) || 0), 0),
            reembolsos: pReembolsos.length,
            conversao
          };
        });

        // Gera análise do estrategista com LLM
        let analise = null;
        try {
          const resumo = produtosLista.map(p =>
            `${p.nome} [${p.status}]: ${p.leads} leads, ${p.trials} trials (${p.trialsAtivos} ativos, ${p.trialsVitalicio} vitalicio), ${p.vendas} vendas (R$ ${p.receita}), ${p.reembolsos} reembolsos, conversao ${p.conversao}%`
          ).join('\n');
          const sistema = `Você é o Estrategista Chefe do ecossistema Severino. Analise a saúde de cada produto e sugira ações concretas para melhorar: conversão de leads em vendas, retenção, redução de reembolsos, precificação, canais de aquisição. Seja direto, prático, com recomendações executáveis. Use português.`;
          const r = await ia.perguntar({ agente: 'estrategista', sistema, mensagens: [{ role: 'user', content: `Dados atuais do ecossistema:\n${resumo}\n\nAnalise a saúde e sugira melhorias.` }], modelo: 'forte' });
          analise = r.resposta || r.texto || r;
        } catch (e) { analise = 'Falha ao gerar análise: ' + e.message; }

        return json(res, { ok: true, agora: new Date().toISOString(), produtos: produtosLista, analise });
      } catch (e) {
        return json(res, { error: 'Erro ao analisar saúde: ' + e.message }, 500);
      }
    }

    // POST /api/ecosystem/painel/autofix — executa correcoes sugeridas pelo estrategista
    if (method === 'POST' && rawUrl === '/api/ecosystem/painel/autofix') {
      if (!podeEscrever(req)) return json(res, { error: 'Unauthorized' }, 401);
      const acoes = [];
      try {
        const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'funil.json'), 'utf8'));
        const leads = Object.values(d.leads || {});

        // 1. Reativar leads "vip" sem telegramId há mais de 3 dias → posta tick.captura
        const semContato = leads.filter(l => l.status === 'vip' && !l.telegramId && l.criadoEm && (Date.now() - new Date(l.criadoEm).getTime()) > 3 * 86400000);
        if (semContato.length > 0) {
          bus.postar({ tipo: 'tick.captura', origem: 'autofix', produto: null, payload: { forcar: semContato.slice(0, 5).map(l => l.leadId) } });
          acoes.push(`Reativando captura para ${semContato.length} leads VIP sem Telegram`);
          try { bus.emitir({ agente: 'autofix', tipo: 'captura.reativada', payload: { qtd: semContato.length } }); } catch {}
        }

        // 2. Leads "vip" com trial expirado (>8 dias) sem compra → posta follow-up
        const expirados = leads.filter(l => l.status === 'vip' && l.trialDias && (Date.now() - new Date(l.criadoEm).getTime()) > (l.trialDias + 1) * 86400000);
        if (expirados.length > 0) {
          bus.postar({ tipo: 'tick.followups', origem: 'autofix', produto: null, payload: { forcar: true } });
          acoes.push(`Acionando follow-up para ${expirados.length} leads com trial expirado`);
          try { bus.emitir({ agente: 'autofix', tipo: 'followup.acionado', payload: { qtd: expirados.length } }); } catch {}
        }

        // 3. Leads "pago" com renovacao proxima (>20 dias desde criacao) → tick.renovacao
        const renovar = leads.filter(l => l.status === 'pago' && l.criadoEm && (Date.now() - new Date(l.criadoEm).getTime()) > 20 * 86400000);
        if (renovar.length > 0) {
          bus.postar({ tipo: 'tick.renovacao', origem: 'autofix', produto: null, payload: {} });
          acoes.push(`Agendando renovacao para ${renovar.length} leads pagos`);
          try { bus.emitir({ agente: 'autofix', tipo: 'renovacao.agendada', payload: { qtd: renovar.length } }); } catch {}
        }

        if (acoes.length === 0) acoes.push('Nenhuma correção necessária no momento.');
      } catch (e) {
        return json(res, { error: 'Erro no autofix: ' + e.message }, 500);
      }
      return json(res, { ok: true, acoes });
    }

    // ═══════════════════════════════════════════
    // ⛓️ Auditoria
    // ═══════════════════════════════════════════
    if (method === 'GET' && rawUrl === '/api/ecosystem/auditoria/integridade') {
      const r = bus.verificarIntegridade();
      return json(res, r);
    }
    if (method === 'GET' && rawUrl.startsWith('/api/ecosystem/auditoria')) {
      const u = new URL(rawUrl, 'http://localhost');
      const opts = {
        agente: u.searchParams.get('agente') || undefined,
        tipo: u.searchParams.get('tipo') || undefined,
        desde: u.searchParams.get('desde') || undefined,
        limite: parseInt(u.searchParams.get('limite') || '100', 10)
      };
      const eventos = bus.consultarAuditoria(opts);
      return json(res, { ok: true, total: eventos.length, eventos });
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

// ═══════════════════════════════════════════════
// 📞 Ativa webhook Telegram (gated)
// ═══════════════════════════════════════════════
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
if (webhookUrl) {
  const token = process.env.TELEGRAM_TOKEN;
  if (token) {
    const fullUrl = webhookUrl + '/api/ecosystem/telegram';
    const https = require('https');
    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/setWebhook?url=${encodeURIComponent(fullUrl)}&secret_token=${encodeURIComponent(WEBHOOK_SECRET)}`,
      method: 'GET'
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { const r = JSON.parse(data); log(`📞 setWebhook: ${r.ok ? 'OK' : 'FALHA'} — ${r.description || ''}`); }
        catch { log(`📞 setWebhook: resposta ${res.statusCode}`); }
      });
    });
    req.on('error', (e) => log(`📞 setWebhook ERRO: ${e.message}`));
    req.end();
  }
} else {
  log(`📞 Webhook Telegram desativado (TELEGRAM_WEBHOOK_URL vazio). Comandos só via rota /api/ecosystem/telegram.`);
}

// ═══════════════════════════════════════════════
// 🪪 Emite evento de auditoria inicial
// ═══════════════════════════════════════════════
try { bus.emitir({ agente: 'orquestrador', tipo: 'inicio', payload: { versao: 1 } }); } catch {}

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
// Tick de prospecção Reddit (Prospector Reddit). Posta tick.prospeccao_reddit a cada
// intervalo (default 5400s = 1h30min) para o agente varrer posts novos e comentar
// com valor. Intervalo configurável via ECOSISTEMA_PROSPECCAO_REDDIT_INTERVAL.
const PROSPECCAO_REDDIT_INTERVAL = parseInt(process.env.ECOSISTEMA_PROSPECCAO_REDDIT_INTERVAL || '5400', 10) * 1000;
// Só roda prospecção Reddit com OAuth configurado (sem credenciais ele não consegue
// ler os posts — IP de datacenter é bloqueado). Evita alerta repetido de bloqueio.
const PROSPECCAO_REDDIT_ATIVA =
  process.env.REDDIT_PROSPECCAO_ATIVA !== 'false' &&
  !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET &&
     process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD);
setInterval(() => {
  if (!PROSPECCAO_REDDIT_ATIVA) return;
  try {
    bus.postar({ tipo: 'tick.prospeccao_reddit', origem: 'orquestrador', produto: null, payload: {} });
  } catch {}
}, PROSPECCAO_REDDIT_INTERVAL);

// Tick de prospecção X/Twitter (Prospector X). Posta tick.prospeccao_x a cada
// intervalo (default 5400s = 1h30min) para o agente buscar tweets e sugerir replies.
const PROSPECCAO_X_INTERVAL = parseInt(process.env.ECOSISTEMA_PROSPECCAO_X_INTERVAL || '5400', 10) * 1000;
// Prospecção X liga/desliga (X_PROSPECCAO_ATIVA=false: agente morto — sem ticks,
// sem desperdício de LLM, sem alerta de falha no Telegram. Basta virar true para religar).
const PROSPECCAO_X_ATIVA = process.env.X_PROSPECCAO_ATIVA !== 'false';
setInterval(() => {
  if (!PROSPECCAO_X_ATIVA) return;
  try {
    bus.postar({ tipo: 'tick.prospeccao_x', origem: 'orquestrador', produto: null, payload: {} });
  } catch {}
}, PROSPECCAO_X_INTERVAL);

// 🛡️ Tick do Guardião de Saldos: verifica crédito a cada SALDO_TICK_INTERVAL
// (default 3600s = 1h) e posta tick.saldo. Sempre antes de gastar, o portão
// dentro de processarEvento já protege cada evento que consome crédito.
const SALDO_TICK_INTERVAL = parseInt(process.env.ECOSISTEMA_SALDO_TICK_INTERVAL || '3600', 10) * 1000;
setInterval(() => {
  try {
    bus.postar({ tipo: 'tick.saldo', origem: 'orquestrador', produto: null, payload: {} });
  } catch {}
}, SALDO_TICK_INTERVAL);
// Resumo diário do guardião: posta saldo.resumo a cada 24h com o saldo de todas
// as plataformas. Reaproveita o relógio do relatório diário (24h).
const SALDO_RESUMO_INTERVAL = parseInt(process.env.ECOSISTEMA_SALDO_RESUMO_INTERVAL || '86400', 10) * 1000;
setInterval(() => {
  try {
    bus.postar({ tipo: 'saldo.resumo', origem: 'orquestrador', produto: null, payload: {} });
  } catch {}
}, SALDO_RESUMO_INTERVAL);
