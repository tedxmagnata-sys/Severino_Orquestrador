/**
 * 🎬 Serviço MuAPI do ecossistema — geração de vídeo/imagem via API.
 * Padrão submit-then-poll: POST no endpoint do modelo → request_id →
 * GET /predictions/{id}/result até status completed/failed.
 *
 * Uso típico no Videasta:
 *   const sub = await muapi.gerarVideo({ model, prompt, duration, resolution });
 *   // salvar sub.request_id; mais tarde:
 *   const res = await muapi.verificar(request_id);
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = 'https://api.muapi.ai';
const API_KEY = process.env.MUAPI_API_KEY || '';

const MODELO_VIDEO_PADRAO = process.env.MUAPI_VIDEO_MODEL || 'wan2.2-5b-fast-t2v';
const RESOLUCAO_PADRAO = process.env.MUAPI_VIDEO_RESOLUTION || '720p';
const DURACAO_PADRAO = parseInt(process.env.MUAPI_VIDEO_DURATION || '5', 10);

async function chamar(rota, options = {}) {
  const url = `${BASE}${rota}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'x-api-key': API_KEY } : {})
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let texto = '';
    try { texto = await res.text(); } catch {}
    throw new Error(`MuAPI HTTP ${res.status}: ${String(texto).slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Submete a geração de vídeo e retorna { request_id, status, cost }.
 * @param {object} params
 * @param {string} [params.model]
 * @param {string} params.prompt
 * @param {string} [params.negative_prompt]
 * @param {number} [params.duration]
 * @param {string} [params.resolution] - '480p' | '580p' | '720p'
 * @param {string} [params.aspect_ratio] - ex: '9:16', '16:9', '1:1'
 */
async function gerarVideo({ model, prompt, negative_prompt, duration, resolution, aspect_ratio, seed }) {
  const body = {
    prompt,
    negative_prompt: negative_prompt || undefined,
    duration: duration || DURACAO_PADRAO,
    resolution: resolution || RESOLUCAO_PADRAO,
    aspect_ratio: aspect_ratio || undefined,
    seed: seed ?? undefined
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
  return chamar(`/api/v1/${model || MODELO_VIDEO_PADRAO}`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

/** Consulta o resultado de uma geração. */
async function verificar(requestId) {
  return chamar(`/api/v1/predictions/${requestId}/result`);
}

module.exports = { gerarVideo, verificar, MODELO_VIDEO_PADRAO, RESOLUCAO_PADRAO, DURACAO_PADRAO };
