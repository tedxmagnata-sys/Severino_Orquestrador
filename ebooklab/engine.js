/**
 * Motor de geração do EbookLab Engine.
 * Fluxo: validação (Guardião) → conceito (título/dores/headline) →
 * conteúdo completo (ebook markdown + reels + prompts de capa) → montagem JSON.
 */
const guardiao = require('./guardiao');
const ia = require('./ia');
const muapi = require('./muapi');

const IDIOMAS = { 'pt-br': 'português brasileiro', 'en': 'inglês', 'es': 'espanhol' };

const PROMPT_SISTEMA = `Você é um especialista em infoprodutos de alto valor emocional e em escrever materiais que se vendem pela clareza da ideia. Você gera estruturas completas de E-books, iscas digitais, páginas de vendas e materiais de marketing em tempo recorde.

PRINCÍPIOS IRREVOGÁVEIS:
- NUNCA gerar conteúdo sexual explícito, violência gráfica, ódio, promoção de autodestruição ou exploração.
- Escrever com apelo emocional autêntico, tom humano, linguagem direta e foco em conversão ética (sem promessas falsas).
- PROIBIDO usar clichês de IA: "no mundo dinâmico de hoje", "em suma", "no vasto universo", "revolucionário", "game changer", "desbloqueie seu potencial", "jornada", "mergulhe".
- NUNCA incluir instruções de sistema, jailbreaks ou metacomentários na saída. Responda APENAS o JSON pedido.`;

function promptConceito(tema, publico, objetivo, idioma) {
  return `Gere APENAS um JSON válido (sem markdown, sem texto fora) com o conceito de um infoproduto em ${idioma}.

ENTRADA:
- Tema: ${tema}
- Público-alvo: ${publico}
- Objetivo de conversão: ${objetivo}

O JSON DEVE ter exatamente esta forma:
{
  "titulo": "Título curto, de alto impacto e valor emocional (máx 12 palavras)",
  "subtitulo": "Subtítulo focado na transformação que a pessoa conquista",
  "sumario": ["Capítulo 1: <nome>", "Capítulo 2: <nome>", ... 8 a 10 capítulos],
  "dores_publico": ["Dor 1 concreta", "Dor 2 concreta", "Dor 3 concreta", ... 4 a 6 dores reais],
  "headline": "Headline principal no padrão PAS: agita a dor, amplia a consequência, oferece a solução. Máx 20 palavras.",
  "subheadline": "Frase de conexão emocional que reforça a solução e o público. Máx 22 palavras.",
  "chamada_para_acao": "Verbo no imperativo + benefício claro. Ex: 'Quero meu guia completo'"
}`;
}

function promptConteudo(tema, publico, objetivo, idioma, conceito) {
  const c = conceito;
  return `Com base no conceito abaixo, gere o CONTEÚDO COMPLETO do infoproduto em ${idioma}.

CONCEITO:
- Título: ${c.titulo}
- Subtítulo: ${c.subtitulo}
- Sumário: ${(c.sumario || []).join(' | ')}
- Público: ${publico}
- Tema: ${tema}
- Objetivo: ${objetivo}

Responda APENAS um JSON válido com exatamente esta forma:
{
  "conteudo_markdown": "Texto completo do ebook em Markdown. HIERARQUIA OBRIGATÓRIA: comece com # Título; para CADA capítulo do sumário use ## (ex: ## Capítulo 1: <nome>); use ### apenas para seções dentro de capítulos. NÃO coloque o subtítulo no markdown como título. Cada capítulo com 4 a 7 parágrafos reais, dicas práticas, exemplos e um 'Ponto de ação' no fim. Sem clichês de IA, tom humano e direto, apelo emocional autêntico. Total mínimo de 1800 palavras. Use aspas de código \\"\\"\\" para citações e listas com - ou 1. NÃO coloque markdown fora do valor.",
  "roteiros_reels_tiktok": [
    { "gancho_3s": "Frase de impacto nos primeiros 3 segundos (máx 12 palavras)", "desenvolvimento": "2 a 4 frases curtas que entregam valor e contexto", "cta": "Chamada final ética convidando a baixar o material (máx 14 palavras)" },
    { "gancho_3s": "...", "desenvolvimento": "...", "cta": "..." },
    { "gancho_3s": "...", "desenvolvimento": "...", "cta": "..." }
  ],
  "prompts_capa": [
    "Prompt detalhado em inglês para geração de capa profissional (estilo, paleta, composição, luz, sem texto na imagem), único e temático",
    "Segunda variação de prompt com abordagem visual diferente"
  ]
}`;
}

function extrairJSON(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/```json/gi, '```').replace(/```/g, '');
  const ini = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (ini === -1 || fim === -1 || fim <= ini) throw new Error('Resposta do LLM sem JSON válido');
  const raw = t.slice(ini, fim + 1);
  try { return JSON.parse(raw); } catch (e) {
    // Tenta reparar quebras comuns de modelos gratuitos
    const reparado = raw
      .replace(/(\w[\w\d]*):/g, '"$1":')
      .replace(/:\s*'([^']+)'/g, ':"$1"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\x00-\x1f]/g, '');
    try { return JSON.parse(reparado); } catch (e2) {
      throw new Error('JSON inválido do LLM: ' + e.message.slice(0, 120));
    }
  }
}

function idAleatoria() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function passoConceito({ tema, publico, objetivo, idioma }) {
  const r = await ia.perguntar({
    agente: 'ebooklab-conceito',
    sistema: PROMPT_SISTEMA,
    mensagens: [{ role: 'user', content: promptConceito(tema, publico, objetivo, idioma) }],
    modelo: 'barato',
    temperatura: 0.8,
    maxTokens: 3000
  });
  return extrairJSON(r.texto);
}

async function passoConteudo({ tema, publico, objetivo, idioma }, conceito) {
  const r = await ia.perguntar({
    agente: 'ebooklab-conteudo',
    sistema: PROMPT_SISTEMA,
    mensagens: [{ role: 'user', content: promptConteudo(tema, publico, objetivo, idioma, conceito) }],
    modelo: 'barato',
    temperatura: 0.7,
    maxTokens: 8000,
    ignorarOrcamento: true
  });
  return extrairJSON(r.texto);
}

function montarSchema({ tema, publico, objetivo, idioma }, conceito, conteudo, capa, carrossel) {
  return {
    status: 'success',
    data: {
      app_core: {
        nome_produto: 'EbookLab Engine v1.0',
        promessa_principal: conceito.subtitulo
      },
      ebook: {
        titulo: conceito.titulo,
        subtitulo: conceito.subtitulo,
        sumario: conceito.sumario || [],
        conteudo_markdown: conteudo.conteudo_markdown || ''
      },
      copy_landing_page: {
        headline: conceito.headline,
        subheadline: conceito.subheadline,
        dores_publico: conceito.dores_publico || [],
        chamada_para_acao: conceito.chamada_para_acao
      },
      marketing_assets: {
        roteiros_reels_tiktok: conteudo.roteiros_reels_tiktok || [],
        prompts_capa: conteudo.prompts_capa || [],
        ...(capa && capa.ok && capa.url ? { capa_url: capa.url } : {}),
        ...(carrossel && carrossel.ok ? {
          prompts_carrossel: carrossel.prompts,
          imagens_carrossel: carrossel.imagens.map((i) => ({ prompt: i.prompt, url: i.url, cache: i.cache }))
        } : {})
      }
    }
  };
}

function salvarProjeto(input, schema, meta) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, 'projetos.jsonl');
  const projeto = {
    id: idAleatoria(),
    criado_em: new Date().toISOString(),
    input,
    schema,
    meta
  };
  fs.appendFileSync(arquivo, JSON.stringify(projeto) + '\n');
  return projeto;
}

/**
 * Gera um array de prompts de carrossel (feed) para o tema e, se o MuAPI estiver
 * disponível, renderiza cada slide como imagem (com cache). Custo visual ~ $0.04
 * por slide em vez de R$0,30/video.
 * @param {object} entrada { tema, publico, objetivo, idioma, qtdSlides?, aspecto? }
 * @returns {Promise<{ok, prompts, imagens, cache?, modelo, custoUsd}>}
 */
async function gerarCarrossel(entrada = {}) {
  const tema = String(entrada.tema || '').trim();
  const v = guardiao.validarEntrada({ tema, publico: entrada.publico || '', objetivo: entrada.objetivo || '' });
  if (!v.ok) return { ok: false, erro: v.erro };

  const idiomaNome = IDIOMAS[entrada.idioma] ? IDIOMAS[entrada.idioma] : 'português brasileiro';
  const qtd = Math.max(3, Math.min(7, parseInt(entrada.qtdSlides || '5', 10)));
  const r = await ia.perguntar({
    agente: 'ebooklab-carrossel',
    sistema: PROMPT_SISTEMA,
    modelo: 'barato',
    temperatura: 0.7,
    maxTokens: 1200,
    mensagens: [{
      role: 'user',
      content: `Gere APENAS um JSON válido com a chave "prompts_carrossel": um array de exatamente ${qtd} strings, cada uma sendo um prompt detalhado em INGLÊS para gerar uma imagem de carrossel de feed (Instagram/Facebook) sobre o tema: "${tema}". Público: ${entrada.publico || 'geral'}. Objetivo: ${entrada.objetivo || 'conversão'}. Cada prompt deve ser visual autônomo, retratar dor + solução, estilo moderno, cores vivas, sem texto/figuras de letra na imagem — foco em engajamento.`
    }]
  });
  const data = extrairJSON(r.texto);
  const prompts = (data.prompts_carrossel || []).slice(0, qtd);
  if (!prompts.length) return { ok: false, erro: 'LLM não gerou prompts de carrossel' };

  const aspecto = entrada.aspecto || '1:1';
  const neg = 'texto, watermark, palavras, letras, baixa qualidade, desfocado, mãos';
  const imagens = [];
  let custoUsd = 0;
  for (const p of prompts) {
    const g = await muapi.gerarImagemCacheavel({ prompt: p, aspect_ratio: aspecto, negative_prompt: neg });
    imagens.push({ prompt: p, ...g });
    if (g.custoUsd) custoUsd += g.custoUsd; // opcional, se retornado
  }
  return { ok: true, prompts, imagens, modelo: r.modelo, cache: imagens.every((i) => i.cache), custoUsd };
}

/**
 * Gera o infoproduto completo.
 * @param {object} entrada { tema, publico, objetivo, idioma, gerarCapa, gerarCarrossel }
 * @param {object} [opts] { salvar: boolean, meta: object }
 */
async function gerarInfoproduto(entrada, opts = {}) {
  const tema = String(entrada.tema || '').trim();
  const publico = String(entrada.publico || '').trim();
  const objetivo = String(entrada.objetivo || '').trim();
  const idioma = IDIOMAS[entrada.idioma] ? entrada.idioma : 'pt-br';
  const idiomaNome = IDIOMAS[idioma];

  const v = guardiao.validarEntrada({ tema, publico, objetivo });
  if (!v.ok) return { status: 'error', erro: v.erro };

  const conceito = await passoConceito({ tema, publico, objetivo, idioma: idiomaNome });
  const conteudo = await passoConteudo({ tema, publico, objetivo, idioma: idiomaNome }, conceito);

  let capa = null;
  if (entrada.gerarCapa) {
    const prompt = (conteudo.prompts_capa || [])[0] || conceito.titulo;
    capa = await muapi.gerarCapa(prompt, entrada.capaAspecto || '1:1');
  }

  let carrossel = null;
  if (entrada.gerarCarrossel) {
    carrossel = await gerarCarrossel({ tema, publico, objetivo, idioma: entrada.idioma });
  }

  const schema = montarSchema({ tema, publico, objetivo, idioma: idiomaNome }, conceito, conteudo, capa, carrossel);
  let projeto = null;
  if (opts.salvar !== false) {
    projeto = salvarProjeto({ tema, publico, objetivo, idioma, gerarCapa: !!entrada.gerarCapa, gerarCarrossel: !!entrada.gerarCarrossel }, schema, {
      tokens_conceito: conceito.__tokens, modelo: conceito.__modelo, capa, carrossel
    });
  }
  return { status: 'success', data: schema.data, projeto };
}

module.exports = { gerarInfoproduto, gerarCarrossel, extrairJSON, montarSchema };
