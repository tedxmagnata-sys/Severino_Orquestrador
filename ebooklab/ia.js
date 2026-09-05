/**
 * Serviço de IA do EbookLab Engine — OpenAI-compatible (OpenRouter ou 9Router).
 * Carrega .env manualmente, aplica retry + timeout + orçamento diário de tokens.
 * Para usar 9Router: defina LLM_BASE_URL=http://localhost:20128/v1/chat/completions
 * e aponte LLM_MODEL_BARATO/FORTE para os nomes dos combos criados no 9Router.
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ENV_FILE = path.join(DIR, '.env');
const BUDGET_FILE = path.join(DIR, 'data', 'llm_state.json');

const envCache = {};
function loadEnv() {
  if (Object.keys(envCache).length) return envCache;
  try {
    const raw = fs.readFileSync(ENV_FILE, 'utf8');
    for (const linha of raw.split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !linha.trim().startsWith('#')) {
        envCache[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch {}
  return envCache;
}

function env(k, def) {
  const v = process.env[k] ?? loadEnv()[k];
  return v === undefined || v === '' ? def : v;
}

const BASE = env('LLM_BASE_URL', 'https://openrouter.ai/api/v1/chat/completions');
const TEMPO_MAX = 240000;

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function lerOrcamento() {
  try {
    const s = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    if (s.dia !== hoje()) return { dia: hoje(), tokens: 0, chamadas: 0, custoUsd: 0 };
    return s;
  } catch {
    return { dia: hoje(), tokens: 0, chamadas: 0, custoUsd: 0 };
  }
}

function salvarOrcamento(s) {
  try { fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true }); } catch {}
  try { fs.writeFileSync(BUDGET_FILE, JSON.stringify(s, null, 2)); } catch {}
}

function estimarTokens(texto) {
  return Math.ceil(String(texto || '').length / 4);
}

function modelos() {
  return {
    barato: env('LLM_MODEL_BARATO', 'meta-llama/llama-3.3-70b-instruct:free'),
    forte: env('LLM_MODEL_FORTE', 'meta-llama/llama-3.3-70b-instruct:free')
  };
}

/**
 * Cadeia de modelos — SEM fallback pago (política zero-cost).
 * Retorna array de 1 modelo: barato ou forte.
 */
function cadeia(modelo) {
  const m = modelos();
  return [modelo === 'forte' ? m.forte : m.barato];
}

/**
 * Pergunta ao LLM.
 * @param {object} opts { sistema, mensagens, modelo: 'barato'|'forte'|id, temperatura, maxTokens, agente, ignorarOrcamento }
 * @returns {Promise<{ok:true,texto:string,modelo:string,tokens:number}>}
 */
async function perguntar({ sistema = '', mensagens = [], modelo = 'barato', temperatura = 0.7, maxTokens, agente = 'leadbook', ignorarOrcamento = false } = {}) {
  const key = env('LLM_API_KEY', '');
  if (!key) throw new Error('LLM_API_KEY ausente — configure no .env (na pasta do app: ebooklab/.env)');

  const state = lerOrcamento();
  const estReq = estimarTokens(sistema) + mensagens.reduce((a, m) => a + estimarTokens(m.content || ''), 0);
  const limite = parseInt(env('LLM_BUDGET_TOKENS_DIA', '200000'), 10);
  if (!ignorarOrcamento && state.tokens + estReq > limite) {
    throw new Error(`Orçamento de tokens do dia estourado (${state.tokens} + ~${estReq} > ${limite})`);
  }

  const chain = cadeia(modelo);
  const body = {
    messages: [{ role: 'system', content: sistema }, ...mensagens],
    temperature: temperatura
  };
  if (maxTokens) body.max_tokens = maxTokens;

  let ultimoErro = null;
  for (const model of chain) {
    body.model = model;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TEMPO_MAX);
      try {
        const resp = await fetch(BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': env('LLM_REFERER', 'https://ebooklab.severinobot.com'),
            'X-Title': 'EbookLab Engine'
          },
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (!resp.ok) {
          ultimoErro = new Error(`OpenRouter HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
          break; // free falhou (ex: 429/404) -> tenta próximo modelo da cadeia
        }
        const data = await resp.json();
        const conteudo = data.choices?.[0]?.message?.content || '';
        const tokens = data.usage?.total_tokens || estReq + estimarTokens(conteudo);
        if (!String(conteudo).trim()) {
          ultimoErro = new Error(`Resposta vazia do modelo ${model}`);
          break; // free/devolveu vazio (200) -> tenta próximo modelo da cadeia
        }
        state.tokens += tokens;
        state.chamadas = (state.chamadas || 0) + 1;
        salvarOrcamento(state);
        return { ok: true, texto: conteudo, modelo: model, tokens, agente };
      } catch (e) {
        clearTimeout(t);
        ultimoErro = e;
      }
    }
  }
  throw ultimoErro || new Error('Falha no LLM');
}

module.exports = { perguntar, modelos, estimarTokens, lerOrcamento, env };
