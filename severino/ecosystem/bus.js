/**
 * 🛰️ barramento de eventos do ecossistema
 * Fila única baseada em arquivos (events.jsonl + pendentes.json) para
 * agentes trocarem mensagens sem depender de Redis. Cada agente posta
 * eventos; o Orquestrador roteia para o agente certo.
 * 
 * ⛓️ Auditoria: audit.jsonl — log append-only com hash-chain (sha256).
 *   - emitir() grava evento imutável com prevHash/hash
 *   - verificarIntegridade() valida a cadeia completa
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'queue');
const EVENTS = path.join(DIR, 'events.jsonl');
const PENDENTES = path.join(DIR, 'pendentes.json');
const AUDIT = path.join(DIR, 'audit.jsonl');

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(EVENTS)) fs.writeFileSync(EVENTS, '');
  if (!fs.existsSync(PENDENTES)) fs.writeFileSync(PENDENTES, '[]');
  if (!fs.existsSync(AUDIT)) fs.writeFileSync(AUDIT, '');
}

function novoId() {
  return crypto.randomBytes(6).toString('hex');
}

function lerPendentes() {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(PENDENTES, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function salvarPendentes(arr) {
  ensure();
  fs.writeFileSync(PENDENTES, JSON.stringify(arr, null, 2));
}

function postar({ tipo, origem = 'externo', produto = null, alvo = null, payload = {}, hops = 0 }) {
  ensure();
  const ev = {
    id: novoId(),
    ts: new Date().toISOString(),
    tipo,
    origem,
    produto,
    alvo,
    payload,
    estado: 'novo',
    hops
  };
  fs.appendFileSync(EVENTS, JSON.stringify(ev) + '\n');
  const pend = lerPendentes();
  pend.push(ev);
  salvarPendentes(pend);
  return ev;
}

function proximosPendentes(limite = 20) {
  return lerPendentes().slice(0, limite);
}

function removerPendente(id) {
  const resto = lerPendentes().filter((e) => e.id !== id);
  salvarPendentes(resto);
}

function atualizarEstado(id, estado, extra = {}) {
  ensure();
  const linhas = fs.readFileSync(EVENTS, 'utf8').trim().split('\n').filter(Boolean);
  const novas = linhas.map((l) => {
    try {
      const o = JSON.parse(l);
      if (o.id === id) return JSON.stringify({ ...o, estado, ...extra });
    } catch {}
    return l;
  });
  fs.writeFileSync(EVENTS, novas.join('\n') + '\n');
}

function ultimosEventos(limite = 50) {
  ensure();
  const linhas = fs.readFileSync(EVENTS, 'utf8').trim().split('\n').filter(Boolean);
  return linhas
    .slice(-limite)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function contar() {
  ensure();
  const pendentes = lerPendentes();
  const eventos = ultimosEventos(500);
  const porTipo = {};
  const porEstado = {};
  eventos.forEach((e) => {
    porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;
    porEstado[e.estado] = (porEstado[e.estado] || 0) + 1;
  });
  return {
    pendentes: pendentes.length,
    totalLinhas: fs.readFileSync(EVENTS, 'utf8').split('\n').filter(Boolean).length,
    porTipo,
    porEstado
  };
}

// ═══════════════════════════════════════════════
// ⛓️ AUDITORIA — log append-only com hash-chain
// ═══════════════════════════════════════════════

function ultimaLinhaAuditoria() {
  ensure();
  const linhas = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').filter(Boolean);
  if (linhas.length === 0) return null;
  try {
    return JSON.parse(linhas[linhas.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Emite um evento de auditoria — append-only, hash-chained, imutável.
 * @param {string} agente  — identificador do agente/sistema que emitiu
 * @param {string} tipo    — tipo do evento (ex: 'gasto', 'venda', 'lead', 'llm_uso')
 * @param {object} payload — dados do evento
 * @returns {object} o evento completo com hash
 */
function emitir({ agente, tipo, payload = {} }) {
  ensure();
  const ultimo = ultimaLinhaAuditoria();
  const seq = (ultimo ? ultimo.seq : 0) + 1;
  const prevHash = ultimo ? ultimo.hash : '';
  const ts = new Date().toISOString();
  const semHash = { seq, ts, agente, tipo, payload, prevHash };
  const hash = crypto.createHash('sha256').update(JSON.stringify(semHash, Object.keys(semHash).sort())).digest('hex');
  const evento = { ...semHash, hash };
  fs.appendFileSync(AUDIT, JSON.stringify(evento) + '\n');
  return evento;
}

/**
 * Verifica a integridade de toda a cadeia de hash.
 * @returns {{ ok: boolean, erros: string[], total: number }}
 */
function verificarIntegridade() {
  ensure();
  const linhas = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').filter(Boolean);
  const erros = [];
  let prevHash = '';
  for (let i = 0; i < linhas.length; i++) {
    try {
      const ev = JSON.parse(linhas[i]);
      // Verifica prevHash
      if (ev.prevHash !== prevHash) {
        erros.push(`Linha ${i + 1}: prevHash esperado "${prevHash}", recebido "${ev.prevHash}"`);
      }
      // Recalcula hash
      const { hash: _, ...semHash } = ev;
      const esperado = crypto.createHash('sha256').update(JSON.stringify(semHash, Object.keys(semHash).sort())).digest('hex');
      if (ev.hash !== esperado) {
        erros.push(`Linha ${i + 1}: hash inválido (seq=${ev.seq}, tipo=${ev.tipo})`);
      }
      prevHash = ev.hash;
    } catch (e) {
      erros.push(`Linha ${i + 1}: erro de parse — ${e.message}`);
    }
  }
  return { ok: erros.length === 0, erros, total: linhas.length };
}

/**
 * Consulta o log de auditoria com filtros opcionais.
 * @param {object} opts — { agente?, tipo?, desde? }
 * @returns {object[]} eventos do audit log
 */
function consultarAuditoria(opts = {}) {
  ensure();
  const linhas = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').filter(Boolean);
  let eventos = linhas.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (opts.agente) eventos = eventos.filter(e => e.agente === opts.agente);
  if (opts.tipo) eventos = eventos.filter(e => e.tipo === opts.tipo);
  if (opts.desde) {
    const d = new Date(opts.desde).getTime();
    if (!isNaN(d)) eventos = eventos.filter(e => new Date(e.ts).getTime() >= d);
  }
  return eventos.slice(-(opts.limite || 200));
}

module.exports = {
  postar,
  proximosPendentes,
  removerPendente,
  atualizarEstado,
  ultimosEventos,
  contar,
  emitir,
  verificarIntegridade,
  consultarAuditoria,
  EVENTS,
  PENDENTES,
  AUDIT
};
