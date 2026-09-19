/**
 * 👑 Conselho Estratégico — reunião diária do ecossistema
 *
 * Reúne KPIs (funil, vendas, orçamento), consulta o Estrategista via LLM
 * e o Guardião via guardiao_saldo, e dispara ações estratégicas.
 * Segue o mesmo padrão dos demais agentes (processar → {agente, acao, novosEventos}).
 */
const fs = require('fs');
const path = require('path');
const ia = require('../ia');
const guardiao = require('../guardiao_saldo');

const LOG = path.join(__dirname, '..', 'queue', 'conselho.log');
const DECISOES = path.join(__dirname, '..', 'queue', 'conselho_decisoes.json');
const REUNIAO_INTERVAL = 24 * 3600 * 1000; // 24h
let ultimaReuniao = 0;
let reunioes = 0;
let historico = [];

function log(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}`;
  try { fs.appendFileSync(LOG, linha + '\n'); } catch {}
}

function lerFunil() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'funil.json'), 'utf8'));
  } catch { return { leads: {}, compras: [], reembolsos: [] }; }
}

function ehCompraReal(c) {
  if (!c) return false;
  const tid = String(c.transactionId || c.transaction_id || '').toLowerCase();
  const email = String(c.customer_email || c.email || '').toLowerCase();
  if (tid.startsWith('test') || tid.startsWith('simulacao')) return false;
  if (/@validacao\.local$/.test(email)) return false;
  return true;
}

function montarContexto() {
  const d = lerFunil();
  const leads = Object.values(d.leads || {});
  const compras = (d.compras || []).filter(ehCompraReal);
  const reembolsos = d.reembolsos || [];

  let licencas = [];
  try {
    const l = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'licenses.json'), 'utf8'));
    licencas = Object.values(l || {});
  } catch {}

  const porStatus = {};
  leads.forEach(l => { porStatus[l.status] = (porStatus[l.status] || 0) + 1; });
  const receita = compras.reduce((s, c) => s + (Number(c.value) || 0), 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const vendasHoje = compras.filter(c => (c.ts || '').slice(0, 10) === hoje).length;

  let orc = { tokens: 0, chamadas: 0 };
  try { orc = ia.lerOrcamento(); } catch {}
  const orcDia = parseFloat(process.env.LLM_CUSTO_POR_MILHAO || '0.30');
  const custoDia = ((orc.tokens || 0) / 1000000) * orcDia;
  const ativas = licencas.filter(l => l.expiresAt && new Date(l.expiresAt).getTime() > Date.now()).length;

  return {
    leads: leads.length, porStatus,
    vendas: compras.length, vendasHoje,
    receitaTotal: receita, reembolsos: reembolsos.length,
    chamadas: orc.chamadas, tokens: orc.tokens, custoDia,
    licencasAtivas: ativas
  };
}

async function processar(evento, ctx) {
  const agora = Date.now();

  // Forca reuniao se payload.tipo = 'convocar'
  if (evento.payload && evento.payload.tipo === 'convocar') {
    return { agente: 'conselho', acao: 'convocando manualmente', novosEventos: [await convocar()].filter(Boolean) };
  }

  if (agora - ultimaReuniao < REUNIAO_INTERVAL) {
    return { agente: 'conselho', acao: 'ja_reunido_hoje', novosEventos: [] };
  }

  const r = await convocar();
  return { agente: 'conselho', acao: r.acao, novosEventos: r.novosEventos || [] };
}

async function convocar() {
  reunioes++;
  const ctx = montarContexto();
  const saldos = await guardiao.vigiar({ avisarResumo: false });

  // Consulta o Estrategista via LLM
  let sugestao = 'Focar em converter trials em pagos.';
  let acoes = [];
  try {
    const prompt = 'Analise os KPIs do ecossistema e recomende UMA acao concreta (max 50 palavras). Seja direto.';
    const ctxStr = `Leads:${ctx.leads} Status:${JSON.stringify(ctx.porStatus)} Vendas:${ctx.vendas} Receita:R$${ctx.receitaTotal.toFixed(2)} Reembolsos:${ctx.reembolsos} CustoTokens:${ctx.tokens}`;
    const r = await ia.perguntar({ agente: 'conselho', sistema: prompt, mensagens: [{ role: 'user', content: ctxStr }] });
    sugestao = (r.texto || '').trim();

    // Extrai acao recomendada do texto do LLM
    if (sugestao.length > 10) {
      acoes.push({
        tipo: 'campanha.nova',
        payload: { sugestao, fonte: 'conselho', numero: reunioes }
      });
    }
  } catch {}

  // Guardiao avalia se ha saldo
  const saldoOk = Object.values(saldos).some(s => s !== null && s > 1);
  const alerta = !saldoOk ? ' Saldo critico!' : '';

  // Resumo
  const acao = `Reuniao #${reunioes}: ${ctx.leads} leads, ${ctx.vendas} vendas (R$${ctx.receitaTotal.toFixed(2)}), ${ctx.reembolsos} reembolsos${alerta}`;
  const resumo = sugestao;

  const reuniao = {
    ts: Date.now(), numero: reunioes,
    ctx, sugestao, saldos, acao, resumo
  };

  historico.push(reuniao);
  if (historico.length > 30) historico.splice(0, historico.length - 30);
  try { fs.writeFileSync(DECISOES, JSON.stringify({ ultima: reuniao, historico: historico.slice(-10) }, null, 2)); } catch {}

  ultimaReuniao = Date.now();
  log(acao);

  return { agente: 'conselho', acao, novosEventos: acoes };
}

function status() {
  return {
    reunioes, ultimaReuniao,
    ultimaDecisao: historico.length > 0 ? historico[historico.length - 1] : null
  };
}

module.exports = { processar, convocar, status };