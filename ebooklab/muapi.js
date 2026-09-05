/**
 * MuAPI — geração opcional da capa do ebook (text-to-image).
 * Padrão submit-then-poll. Sem MUAPI_API_KEY configurada, o app
 * retorna apenas o prompt da capa (custo zero) e pula a geração.
 */
const fs = require('fs');
const path = require('path');
const ia = require('./ia');

const BASE = 'https://api.muapi.ai';
const TEMPO_MAX = 240000;

async function chamar(rota, options = {}) {
  const key = ia.env('MUAPI_API_KEY', '');
  const res = await fetch(`${BASE}${rota}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'x-api-key': key } : {})
    }
  });
  if (!res.ok) {
    let texto = '';
    try { texto = await res.text(); } catch {}
    throw new Error(`MuAPI HTTP ${res.status}: ${String(texto).slice(0, 300)}`);
  }
  return res.json();
}

function disponivel() {
  return !!ia.env('MUAPI_API_KEY', '');
}

function modeloPadrao() {
  return ia.env('MUAPI_IMAGE_MODEL', 'flux-2-dev');
}

// Cache simples de capa por (modelo+aspect+prompt) p/ não regerar igual (economia).
const crypto = require('crypto');
const CACHE_FILE = path.join(__dirname, 'data', 'capas_cache.json');
function _hash(str) { return crypto.createHash('md5').update(str).digest('hex'); }
function _lerCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8') || '{}'); } catch { return {}; }
}
function _salvarCache(c) {
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); } catch {}
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2)); } catch {}
}

/** Submete geração de imagem e retorna { request_id, status } */
async function gerarImagem({ prompt, negative_prompt, aspect_ratio, seed, model }) {
  const body = { prompt };
  if (negative_prompt) body.negative_prompt = negative_prompt;
  if (aspect_ratio) body.aspect_ratio = aspect_ratio;
  if (seed !== undefined) body.seed = seed;
  return chamar(`/api/v1/${model || modeloPadrao()}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

/** Poll do resultado até completed/failed */
async function verificar(requestId) {
  return chamar(`/api/v1/predictions/${requestId}/result`);
}

async function aguardarResultado(requestId, maxTentativas = 40) {
  for (let i = 0; i < maxTentativas; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await verificar(requestId);
    const status = String(r.status || r.state || '').toLowerCase();
    if (status === 'completed' || r.result) {
      const out = r.outputs && r.outputs.length ? r.outputs[0] : null;
      return { ok: true, url: out || (Array.isArray(r.output) ? r.output[0] : (r.output || r.result || r.url || null)) };
    }
    if (status === 'failed' || status === 'error' || status === 'canceled') {
      return { ok: false, erro: String(r.error || r.message || 'geração falhou') };
    }
  }
  return { ok: false, erro: 'timeout aguardando a geração da capa' };
}

/**
 * Gera uma imagem via MuAPI com cache por (modelo+aspect+prompt+negative).
 * Falha sem derrubar o fluxo. Reaproveitado por gerarCapa e gerarCarrossel.
 */
async function gerarImagemCacheavel({ prompt, aspect_ratio = '1:1', negative_prompt, model } = {}) {
  if (!disponivel()) return { ok: false, pulado: true, motivo: 'MUAPI_API_KEY não configurada (somente prompt retornado)' };
  const modelo = model || modeloPadrao();
  const ar = aspect_ratio || '1:1';
  const chave = _hash(`${modelo}|${ar}|${prompt}|${negative_prompt || ''}`);
  const cache = _lerCache();
  if (cache[chave]) return { ok: true, url: cache[chave], request_id: null, cache: true, modelo };
  try {
    const sub = await gerarImagem({ prompt, aspect_ratio: ar, negative_prompt, model: modelo });
    const requestId = sub.request_id || sub.id;
    if (!requestId) return { ok: false, erro: JSON.stringify(sub).slice(0, 200) };
    const r = await aguardarResultado(requestId);
    if (r.ok) { cache[chave] = r.url; _salvarCache(cache); }
    return r.ok ? { ok: true, url: r.url, request_id: requestId, cache: false, modelo } : { ok: false, erro: r.erro, modelo };
  } catch (e) {
    return { ok: false, erro: e.message, modelo };
  }
}

/** Tenta gerar a capa; falha sem derrubar o resto do fluxo. Usa cache por prompt. */
async function gerarCapa(prompt, aspectRatio) {
  return gerarImagemCacheavel({
    prompt,
    aspect_ratio: aspectRatio || '1:1',
    negative_prompt: 'texto, marca d\'água, palavras, letras, qualidade baixa, desfocado'
  });
}

module.exports = { gerarCapa, gerarImagem, gerarImagemCacheavel, aguardarResultado, verificar, disponivel, modeloPadrao };
