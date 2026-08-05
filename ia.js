/**
 * 🤖 Serviço de IA único do ecossistema (OpenRouter).
 * Todas as chamadas de LLM dos agentes passam por aqui, com:
 *  - modelo barato por padrão, forte quando solicitado
 *  - retry (2x) + timeout
 *  - orçamento diário de tokens (Guardião de Custos)
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = 'https://openrouter.ai/api/v1/chat/completions';
const TEMPO_MAX = 45000;
const BUDGET_FILE = path.join(__dirname, '..', 'data', 'llm_state.json');

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
  try {
    fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true });
  } catch {}
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(s, null, 2));
}

function estimarTokens(texto) {
  return Math.ceil(String(texto || '').length / 4);
}

function modelos() {
  return {
    barato: process.env.LLM_MODEL_BARATO || 'deepseek/deepseek-chat',
    forte: process.env.LLM_MODEL_FORTE || 'openai/gpt-4o-mini'
  };
}

/**
 * Pergunta ao LLM. Lança erro se faltar chave ou estourar orçamento.
 * @param {object} opts
 * @param {string} opts.agente - nome do agente que chama (para log)
 * @param {string} opts.sistema - prompt de sistema
 * @param {Array} opts.mensagens - [{role:'user'|'assistant'|'system', content}]
 * @param {string} [opts.modelo] - 'barato' | 'forte' ou id completo
 * @param {number} [opts.temperatura]
 * @param {boolean} [opts.ignorarOrcamento] - true para chamadas críticas
 */
async function perguntar({ agente = 'desconhecido', sistema = '', mensagens = [], modelo = 'barato', temperatura = 0.7, ignorarOrcamento = false }) {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error('LLM_API_KEY ausente no .env');

  const state = lerOrcamento();
  const estReq = estimarTokens(sistema) + mensagens.reduce((a, m) => a + estimarTokens(m.content || ''), 0);
  const limite = parseInt(process.env.LLM_BUDGET_TOKENS_DIA || '100000', 10);
  if (!ignorarOrcamento && state.tokens + estReq > limite) {
    throw new Error(`Orçamento de tokens do dia estourado (${state.tokens} + ~${estReq} > ${limite})`);
  }

  const model = modelo === 'barato' || modelo === 'forte' ? modelos()[modelo] : modelo;
  const body = {
    model,
    messages: [{ role: 'system', content: sistema }, ...mensagens],
    temperature: temperatura
  };

  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TEMPO_MAX);
    try {
      const resp = await fetch(BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': 'https://btcweatherpanel.com',
          'X-Title': 'Ecosistema Severino'
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!resp.ok) {
        ultimoErro = new Error(`OpenRouter HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
        continue;
      }
      const data = await resp.json();
      const conteudo = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || estReq + estimarTokens(conteudo);
      state.tokens += tokens;
      state.chamadas = (state.chamadas || 0) + 1;
      salvarOrcamento(state);
      return { ok: true, texto: conteudo, modelo: model, tokens, agente };
    } catch (e) {
      clearTimeout(t);
      ultimoErro = e;
    }
  }
  throw ultimoErro || new Error('Falha no LLM');
}

module.exports = { perguntar, modelos, estimarTokens, lerOrcamento, salvarOrcamento };
