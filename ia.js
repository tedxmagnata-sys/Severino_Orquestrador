const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ENV_FILE = path.join(DIR, '..', '.env');
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
const TEMPO_MAX = 120000;

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
    barato: env('LLM_MODEL_BARATO', 'deepseek/deepseek-v3.2'),
    forte: env('LLM_MODEL_FORTE', 'deepseek/deepseek-v4-flash')
  };
}

function cadeia(modelo) {
  const m = modelos();
  const usaRouter = /openrouter\.ai/.test(BASE);
  if (modelo === 'forte') return [m.forte];
  if (modelo === 'barato') {
    if (!usaRouter) return [m.barato];
    return /(:free|openrouter\/free)$/.test(m.barato) ? [m.barato, m.forte] : [m.barato];
  }
  return [modelo];
}

async function perguntar({ sistema = '', mensagens = [], modelo = 'barato', temperatura = 0.7, maxTokens, agente = 'ecossistema', ignorarOrcamento = false } = {}) {
  const key = env('LLM_API_KEY', '');
  if (!key) throw new Error('LLM_API_KEY ausente — configure no .env (raiz do projeto)');

  const state = lerOrcamento();
  const estReq = estimarTokens(sistema) + mensagens.reduce((a, m) => a + estimarTokens(m.content || ''), 0);
  const limite = parseInt(env('LLM_BUDGET_TOKENS_DIA', '200000'), 10);
  if (!ignorarOrcamento && state.tokens + estReq > limite) {
    throw new Error(`Orçamento de tokens do dia estourado (${state.tokens} de ${limite})`);
  }

  const chain = cadeia(modelo);
  let ultimoErro = null;

  for (const model of chain) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TEMPO_MAX);
      try {
        const body = { model, messages: [] };
        if (sistema) body.messages.push({ role: 'system', content: sistema });
        body.messages.push(...mensagens);
        if (maxTokens) body.max_tokens = maxTokens;
        body.temperature = temperatura;

        const resp = await fetch(BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': env('LLM_REFERER', 'https://severino.app'),
            'X-Title': 'Severino Ecossistema'
          },
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (!resp.ok) {
          ultimoErro = new Error(`LLM HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
          break;
        }
        const data = await resp.json();
        const conteudo = data.choices?.[0]?.message?.content || '';
        const tokens = data.usage?.total_tokens || estReq + estimarTokens(conteudo);
        state.tokens += tokens;
        state.chamadas = (state.chamadas || 0) + 1;
        salvarOrcamento(state);
        return { texto: conteudo, modelo: model, tokens, agente };
      } catch (e) {
        clearTimeout(t);
        ultimoErro = e;
      }
    }
  }
  throw ultimoErro || new Error('Falha no LLM');
}

module.exports = { perguntar, modelos, estimarTokens, lerOrcamento, env };