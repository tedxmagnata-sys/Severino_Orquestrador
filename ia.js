const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ENV_FILE = path.join(DIR, '..', '.env');
const BUDGET_FILE = path.join(DIR, 'data', 'llm_state.json');

/** ======= CAMADA DE SEGURANÇA: ALLOWLIST DE MODELOS ======= **/
const MODELOS_PERMITIDOS = new Set([
  'deepseek/deepseek-v4-flash',
  'deepseek/deepseek-v4-flash-0731',
  'deepseek/deepseek-v3.2',
  'deepseek/deepseek-v4.1-flash',
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-2.5-flash-image'
]);

function validarModelo(modelo) {
  if (!MODELOS_PERMITIDOS.has(modelo)) {
    const erro = new Error(`🚫 MODELO BLOQUEADO: ${modelo} — não está na allowlist. Modelos permitidos: ${Array.from(MODELOS_PERMITIDOS).join(', ')}`);
    erro.code = 'MODELO_NAO_PERMITIDO';
    throw erro;
  }
  return true;
}

/** ======= CAMADA DE SEGURANÇA: ORÇAMENTO RÍGIDO USD ======= **/
const ORCAMENTO_MAX_USD_DIA = parseFloat(process.env.LLM_BUDGET_MAX_USD_DIA || '5.00');
const ORCAMENTO_MAX_USD_MES = parseFloat(process.env.LLM_BUDGET_MAX_USD_MES || '50.00');

/** ======= CAMADA DE SEGURANÇA: AUDITORIA ======= **/
function auditoria(evento, detalhes) {
  const log = {
    ts: new Date().toISOString(),
    evento,
    ...detalhes
  };
  console.log('[AUDIT-LLM]', JSON.stringify(log));
  // Também salva em arquivo para análise forense
  try {
    const logFile = path.join(DIR, 'data', 'llm_audit.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(log) + '\n');
  } catch {}
}

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

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function lerOrcamento() {
  try {
    const s = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    if (s.dia !== hoje()) return { dia: hoje(), mes: mesAtual(), tokens: 0, chamadas: 0, custoUsd: 0, custoUsdMes: 0 };
    if (s.mes !== mesAtual()) return { dia: hoje(), mes: mesAtual(), tokens: 0, chamadas: 0, custoUsd: 0, custoUsdMes: 0 };
    return s;
  } catch {
    return { dia: hoje(), mes: mesAtual(), tokens: 0, chamadas: 0, custoUsd: 0, custoUsdMes: 0 };
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
    barato: env('LLM_MODEL_BARATO', 'deepseek/deepseek-v4-flash'),
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
  const limiteTokens = parseInt(env('LLM_BUDGET_TOKENS_DIA', '200000'), 10);
  if (!ignorarOrcamento && state.tokens + estReq > limiteTokens) {
    auditoria('BUDGET_TOKENS_EXCEEDED', { agente, tokensAtual: state.tokens, limite: limiteTokens });
    throw new Error(`Orçamento de tokens do dia estourado (${state.tokens} de ${limiteTokens})`);
  }

  // ======= VALIDAÇÃO DE ORÇAMENTO USD =======
  if (!ignorarOrcamento) {
    if (state.custoUsd >= ORCAMENTO_MAX_USD_DIA) {
      auditoria('BUDGET_USD_DIA_EXCEEDED', { agente, custoAtual: state.custoUsd, limite: ORCAMENTO_MAX_USD_DIA });
      throw new Error(`Orçamento diário USD esgotado ($${state.custoUsd.toFixed(2)} / $${ORCAMENTO_MAX_USD_DIA.toFixed(2)})`);
    }
    if (state.custoUsdMes >= ORCAMENTO_MAX_USD_MES) {
      auditoria('BUDGET_USD_MES_EXCEEDED', { agente, custoMes: state.custoUsdMes, limite: ORCAMENTO_MAX_USD_MES });
      throw new Error(`Orçamento mensal USD esgotado ($${state.custoUsdMes.toFixed(2)} / $${ORCAMENTO_MAX_USD_MES.toFixed(2)})`);
    }
  }

  const chain = cadeia(modelo);
  let ultimoErro = null;

  for (const model of chain) {
    // ======= VALIDAÇÃO DE MODELO (ALLOWLIST) =======
    try { validarModelo(model); }
    catch (e) {
      auditoria('MODELO_BLOQUEADO', { agente, modeloTentado: model, modeloConfigurado: modelo });
      continue; // pula para próximo modelo da cadeia
    }

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
          const errText = (await resp.text()).slice(0, 200);
          ultimoErro = new Error(`LLM HTTP ${resp.status}: ${errText}`);
          auditoria('LLM_HTTP_ERROR', { agente, modelo: model, status: resp.status, erro: errText });
          break;
        }
        const data = await resp.json();
        const conteudo = data.choices?.[0]?.message?.content || '';
        const tokens = data.usage?.total_tokens || estReq + estimarTokens(conteudo);
        
        // Estimativa de custo baseada no modelo
        const tokensIn = data.usage?.prompt_tokens || estReq;
        const tokensOut = data.usage?.completion_tokens || tokens - tokensIn;
        const custoEstimado = calcularCustoEstimado(model, tokensIn, tokensOut);
        
        state.tokens += tokens;
        state.chamadas = (state.chamadas || 0) + 1;
        state.custoUsd = (state.custoUsd || 0) + custoEstimado;
        state.custoUsdMes = (state.custoUsdMes || 0) + custoEstimado;
        salvarOrcamento(state);
        
        auditoria('LLM_SUCCESS', { agente, modelo: model, tokens, custoUsd: custoEstimado, custoTotalDia: state.custoUsd });
        return { texto: conteudo, modelo: model, tokens, agente };
      } catch (e) {
        clearTimeout(t);
        ultimoErro = e;
        auditoria('LLM_EXCEPTION', { agente, modelo: model, erro: e.message });
      }
    }
  }
  throw ultimoErro || new Error('Falha no LLM');
}

// Tabela de custos por 1M tokens (input/output) - OpenRouter 2024/2025
const CUSTOS_POR_MODELO = {
  'deepseek/deepseek-v4-flash': { in: 0.25, out: 1.00 },
  'deepseek/deepseek-v4-flash-0731': { in: 0.25, out: 1.00 },
  'deepseek/deepseek-v3.2': { in: 0.25, out: 1.00 },
  'deepseek/deepseek-v4.1-flash': { in: 0.25, out: 1.00 },
  'google/gemini-2.0-flash-exp:free': { in: 0, out: 0 },
  'google/gemini-2.5-flash-image': { in: 0.50, out: 1.50 }
};

function calcularCustoEstimado(modelo, tokensIn, tokensOut) {
  const preco = CUSTOS_POR_MODELO[modelo] || { in: 0.25, out: 1.00 };
  return (tokensIn / 1e6 * preco.in) + (tokensOut / 1e6 * preco.out);
}

// Verificação de inicialização - garante que config está correta
function verificarConfigInicializacao() {
  const m = modelos();
  const problemas = [];
  
  if (!MODELOS_PERMITIDOS.has(m.barato)) {
    problemas.push(`LLM_MODEL_BARATO="${m.barato}" NÃO PERMITIDO`);
  }
  if (!MODELOS_PERMITIDOS.has(m.forte)) {
    problemas.push(`LLM_MODEL_FORTE="${m.forte}" NÃO PERMITIDO`);
  }
  
  if (problemas.length > 0) {
    const msg = '🚨 CONFIG INVÁLIDA: ' + problemas.join(' | ');
    auditoria('CONFIG_INVALIDA', { problemas, modelosConfigurados: m });
    console.error(msg);
    // NÃO lança erro para não quebrar init, mas loga alto
  } else {
    auditoria('CONFIG_OK', { modelos: m });
  }
  return problemas.length === 0;
}

// Executa verificação na carga do módulo
verificarConfigInicializacao();

module.exports = { perguntar, modelos, estimarTokens, lerOrcamento, env, validarModelo, MODELOS_PERMITIDOS };