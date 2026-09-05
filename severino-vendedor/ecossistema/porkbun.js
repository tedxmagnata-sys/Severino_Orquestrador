/**
 * 🐷 Porkbun API v3 — Registro de domínios + DNS
 * Docs: https://porkbun.com/api/json/v3/documentation
 */
const fs = require('fs');
const path = require('path');

function env(k, def) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    for (const linha of raw.split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === k && !linha.trim().startsWith('#')) {
        return m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch (e) {}
  return process.env[k] || def;
}

const BASE = 'https://api.porkbun.com/api/json/v3';
const CUSTO_DOMINIO_BR = 12.99; // USD ~ R$ 35/ano (preço aproximado .com.br)

async function api(path, data) {
  const apikey = env('PORKBUN_API_KEY', '');
  const secret = env('PORKBUN_SECRET_KEY', '');
  if (!apikey || !secret) throw new Error('PORKBUN_API_KEY e PORKBUN_SECRET_KEY necessárias no .env');
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey, secretapikey: secret, ...data })
  });
  const j = await r.json();
  if (!r.ok || j.status === 'ERROR') throw new Error(j.message || 'Erro Porkbun: HTTP ' + r.status);
  return j;
}

/** Verifica disponibilidade de um domínio */
async function verificar(dominio) {
  const j = await api('/domain/checkDomain/' + dominio, {});
  const resp = j.response || {};
  const disponivel = resp.avail === 'yes';
  return {
    disponivel,
    dominio: dominio,
    preco: resp.price || null,
    moeda: 'USD',
    mensagem: disponivel ? 'Domínio disponível!' : 'Domínio não disponível ou já registrado.'
  };
}

/** Registra/comprar um domínio */
async function comprar(dominio, dados) {
  // dados: { firstName, lastName, email, address1, city, state, zip, country, phone }
  // Primeiro verifica o preço atual
  const check = await verificar(dominio);
  const precoStr = String(check.preco || '0').replace(/[^0-9.]/g, '');
  const preco = parseFloat(precoStr) || 0;
  const custoCentavos = Math.round(preco * 100);

  const payload = {
    cost: custoCentavos,
    agreeToTerms: 'yes',
    whoisPrivacy: true,
    ...dados,
    pw: '', // senha opcional
    fwd: '' // forward opcional
  };
  const j = await api('/domain/create/' + dominio, payload);
  return { sucesso: true, preco: j.cost || custoCentavos, orderId: j.orderId || null };
}

/** Cria registro CNAME apontando para severinobot.com */
async function criarCname(dominio, alias) {
  const payload = {
    type: 'CNAME',
    name: alias || '', // ex: www ou @ — se vazio é o root
    content: 'vendedor.severinobot.com',
    ttl: 600
  };
  const j = await api('/dns/create/' + dominio, payload);
  return { sucesso: true, id: j.id || null };
}

/** Lista domínios do mercante (admin) */
async function listar() {
  const j = await api('/domain/listAll', {});
  return (j.domains || []).map(d => ({
    dominio: d.domain,
    expires: d.expireDate || d.expires || '',
    status: d.status || ''
  }));
}

module.exports = { verificar, comprar, criarCname, listar, CUSTO_DOMINIO_BR };
