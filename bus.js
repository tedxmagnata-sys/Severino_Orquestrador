/**
 * 🛰️ barramento de eventos do ecossistema
 * Fila única baseada em arquivos (events.jsonl + pendentes.json) para
 * agentes trocarem mensagens sem depender de Redis. Cada agente posta
 * eventos; o Orquestrador roteia para o agente certo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, 'queue');
const EVENTS = path.join(DIR, 'events.jsonl');
const PENDENTES = path.join(DIR, 'pendentes.json');

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(EVENTS)) fs.writeFileSync(EVENTS, '');
  if (!fs.existsSync(PENDENTES)) fs.writeFileSync(PENDENTES, '[]');
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

module.exports = {
  postar,
  proximosPendentes,
  removerPendente,
  atualizarEstado,
  ultimosEventos,
  contar,
  EVENTS,
  PENDENTES
};
