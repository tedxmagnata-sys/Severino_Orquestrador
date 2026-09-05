/**
 * 📈 Estado do funil de vendas do ecossistema.
 * Guarda por lead: score, produto, estágio, contador de mensagens, contexto.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'funil.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { leads: {} };
  }
}

function save(d) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
  } catch {}
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

function getLead(leadId) {
  if (!leadId) return null;
  return load().leads[leadId] || null;
}

function upsertLead(lead) {
  const d = load();
  const atual = d.leads[lead.leadId] || { criadoEm: new Date().toISOString() };
  d.leads[lead.leadId] = { ...atual, ...lead, atualizadoEm: new Date().toISOString() };
  save(d);
  return d.leads[lead.leadId];
}

function listLeads() {
  return Object.values(load().leads);
}

function registrarCompra(c) {
  const d = load();
  d.compras = d.compras || [];
  d.compras.push({ ...c, ts: new Date().toISOString() });
  save(d);
  return c;
}

function registrarReembolso(r) {
  const d = load();
  d.reembolsos = d.reembolsos || [];
  d.reembolsos.push({ ...r, ts: new Date().toISOString() });
  save(d);
}

module.exports = { getLead, upsertLead, listLeads, load, registrarCompra, registrarReembolso };
