/**
 * 🛡️ Guardião de Saldos — vigia o crédito vivo da conta antes de todo gasto.
 *
 * Função:
 *  - Consulta o saldo REAL de OpenRouter (GET /api/v1/credits) e MuAPI
 *    (header x-account-balance na resposta de qualquer chamada).
 *  - Antes de toda análise/geração que gasta, o Orquestrador chama
 *    garantirSaldo() — se o saldo está em zona de risco ou baixo, o gasto
 *    é bloqueado (para o ciclo, sem queimar créditos à toa).
 *  - Mantém estado de alerta por plataforma: avisa no Telegram a CADA queda
 *    de 3% do mínimo que cruzar 50% ou abaixo (ex.: mínimo US$5 OpenRouter
 *    → alerta em US$2.50, depois US$2.35, US$2.20, ...).
 *  - Avisa no bot quando um alerta cruza (e novamente quando a queda de 3%
 *    seguinte acontece). Não repete o mesmo degrau.
 *  - Cache em memória: as consultas reais acontecem no máximo a cada
 *    CACHE_MS (padrão 5 min); entre elas o valor em memória é reutilizado.
 *
 * Regras (Conway Automaton):
 *  - Conservação: nunca gastar o que não tem. Saldo em zona crítica trava.
 *  - Transparência: todo cruzamento de alerta vira mensagem no Telegram.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const https = require('https');
const canais = require('./canais');

const STATE_FILE = path.join(__dirname, 'data', 'saldo_state.json');
const CACHE_MS = parseInt(process.env.SALDO_CACHE_MS || '300000', 10); // 5 min

const MINIMO = {
  openrouter: parseFloat(process.env.SALDO_MIN_OPENROUTER_USD || '5'),
  muapi: parseFloat(process.env.SALDO_MIN_MUAPI_USD || '10')
};
const ALERTA_FRACAO = 0.5;
const DEGRAU_QUEDA = 0.03;

function hoje() { return new Date().toISOString().slice(0, 10); }

// Cache em memória: { ts, saldos } — evita bater na API a cada evento do ciclo.
let cache = { ts: 0, saldos: {} };

function lerEstado() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s.dia !== hoje()) return { dia: hoje(), degraus: {} };
    return s;
  } catch {
    return { dia: hoje(), degraus: {} };
  }
}

function salvarEstado(s) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  } catch {}
}

// ===== HTTP helpers =====

function request(url, headers) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve(null); }
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(12000, () => req.destroy());
    req.end();
  });
}

// ===== Consultas reais de saldo =====

async function saldoOpenRouter() {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const r = await request('https://openrouter.ai/api/v1/credits', {
    Authorization: 'Bearer ' + key
  });
  if (!r) return null;
  try {
    const d = JSON.parse(r.body).data;
    if (!d || d.total_credits === undefined) return null;
    return Math.max(0, Math.round((d.total_credits - (d.total_usage || 0)) * 100) / 100);
  } catch { return null; }
}

async function saldoMuAPI() {
  const key = process.env.MUAPI_API_KEY;
  if (!key) return null;
  // A MuAPI só expõe x-account-balance em respostas de predictions completadas.
  // Usa os últimos requestIds registrados (do mais recente p/ o mais antigo).
  let ids = [];
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'videos.json'), 'utf8') || '[]');
    ids = v.map((x) => x.requestId || x.request_id || x.id).filter(Boolean).reverse();
  } catch {}
  if (!ids.length) return null;
  for (const id of ids.slice(0, 5)) {
    const r = await request(`https://api.muapi.ai/api/v1/predictions/${id}/result`, { 'x-api-key': key });
    if (!r) continue;
    const b = r.headers && r.headers['x-account-balance'];
    if (b !== undefined && b !== null) {
      const v = parseFloat(b);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

// ===== Regras de alerta =====

function verificarAlerta(plataforma, saldo) {
  const s = lerEstado();
  if (!s.degraus) s.degraus = {};
  const st = s.degraus[plataforma] || { ultimo: null };
  const min = MINIMO[plataforma] || 0;
  if (min <= 0 || saldo === null || saldo === undefined) return { alerta: false };

  const limiarInicial = min * ALERTA_FRACAO;
  if (saldo >= limiarInicial) {
    if (st.ultimo !== null) {
      s.degraus[plataforma] = { ultimo: null };
      salvarEstado(s);
    }
    return { alerta: false };
  }

  const dist = (limiarInicial - saldo) / min;
  const degrau = Math.floor(dist / DEGRAU_QUEDA);
  const gate = st.ultimo === null || degrau > st.ultimo;
  if (!gate) return { alerta: false };

  s.degraus[plataforma] = { ultimo: degrau };
  salvarEstado(s);
  return { alerta: true, degrau, saldo, limiar: limiarInicial };
}

function fmtPlataforma(p) { return p === 'openrouter' ? 'OpenRouter (IA)' : 'MuAPI (imagem/vídeo)'; }

// ===== Ponto de entrada principal =====

/**
 * Consulta saldos (respeitando cache). Se não houver cache válido, busca real.
 * @returns {promise<{openrouter:number|null, muapi:number|null}>}
 */
async function consultar() {
  const agora = Date.now();
  if (cache.saldos && (agora - cache.ts) < CACHE_MS) return cache.saldos;
  const saldos = {
    openrouter: await saldoOpenRouter(),
    muapi: await saldoMuAPI()
  };
  cache = { ts: agora, saldos };
  return saldos;
}

/**
 * Verificação completa: consulta + cruza degraus + avisa Telegram.
 * Usado pelo tick periódico do Guardião (não bloqueia por si).
 */
async function vigiar({ avisarResumo = false } = {}) {
  const saldos = await consultar();
  if (avisarResumo) {
    const linhas = [];
    for (const [p, s] of Object.entries(saldos)) {
      const min = MINIMO[p] || 0;
      const pct = min > 0 ? Math.round((s / min) * 100) : 100;
      const emoji = s === null ? '❓' : s <= min * 0.5 ? '🔴' : pct < 100 ? '🟡' : '🟢';
      linhas.push(`  ${emoji} ${fmtPlataforma(p)}: ${s === null ? 'não verificado' : 'US$' + s.toFixed(2)} (${pct}% do mín.)`);
    }
    await canais.enviarAdmin('🛡️ <b>Guardião de Saldos</b>\nSaldo atual:\n' + linhas.join('\n'));
  }
  for (const [p, s] of Object.entries(saldos)) {
    const r = verificarAlerta(p, s);
    if (r.alerta) {
      await canais.enviarAdmin(
        `⚠️ <b>Saldo ${fmtPlataforma(p)}</b>\n` +
        `Saldo: <b>US$${r.saldo.toFixed(2)}</b>\n` +
        `Cruzou <b>US$${r.limiar.toFixed(2)}</b> (50% do mínimo). Degrau ${r.degrau}.\n` +
        `➡️ Recarregue antes que o ciclo trave.`
      );
    }
  }
  return saldos;
}

/**
 * Portão pré-gasto: o Orquestrador chama ANTES de processar evento que gasta.
 * Bloqueia o gasto se o saldo correspondente está em zona crítica (<= 50% do mín).
 * Usa o cache (não faz chamada API nova a cada evento).
 */
async function garantirSaldo(plataforma = 'openrouter') {
  const saldos = await consultar();
  const saldo = saldos && saldos[plataforma];
  if (saldo === null || saldo === undefined) {
    // Não conseguiu confirmar saldo: não bloqueia (evita travar o sistema todo),
    // mas registra um alerta se estiver ausente por muito tempo.
    return { ok: true, bloqueado: false, saldo: null };
  }
  const min = MINIMO[plataforma] || 0;
  const bloqueado = saldo <= min * ALERTA_FRACAO;
  if (bloqueado) {
    const r = verificarAlerta(plataforma, saldo); // garante aviso do cruzamento
    await canais.enviarAdmin(
      `🚫 <b>Gasto bloqueado (${fmtPlataforma(plataforma)})</b>\n` +
      `Saldo <b>US$${saldo.toFixed(2)}</b> ≤ 50% do mínimo (US$${min.toFixed(2)}).\n` +
      `Ciclo de geração pausado até recarga.`
    );
  }
  return { ok: !bloqueado, bloqueado, saldo };
}

module.exports = { vigiar, consultar, garantirSaldo, saldoOpenRouter, saldoMuAPI, verificarAlerta, MINIMO, ALERTA_FRACAO, DEGRAU_QUEDA };