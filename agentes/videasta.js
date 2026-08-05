/**
 * 🎬 Videasta — gera vídeos virais para as campanhas (Fase 6).
 * - campanha.nova: escreve roteiro (LLM) + legenda + submete a geração no MuAPI,
 *   registra em data/videos.json e avisa o admin.
 * - tick.conteudo: verifica gerações pendentes; quando completas, registra a URL,
 *   posta conteudo.pronto (p/ publicação) e atualiza o admin.
 * - Limite diário de vídeos (MUAPI_VIDEO_LIMITE_DIA, padrão 5) p/ controlar custo.
 */
const fs = require('fs');
const path = require('path');
const ia = require('../ia');
const muapi = require('../muapi');
const canais = require('../canais');
const produtos = require('../produtos.json');

const VIDEOS_FILE = path.join(__dirname, '..', 'data', 'videos.json');
const LIMITE_DIA = parseInt(process.env.MUAPI_VIDEO_LIMITE_DIA || '5', 10);
const ASPECT = process.env.MUAPI_VIDEO_ASPECT || '9:16';
const MODELO = process.env.MUAPI_VIDEO_MODEL || muapi.MODELO_VIDEO_PADRAO;

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function lerVideos() {
  try {
    return JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8') || '[]');
  } catch {
    return [];
  }
}

function salvarVideos(arr) {
  try {
    fs.mkdirSync(path.dirname(VIDEOS_FILE), { recursive: true });
  } catch {}
  fs.writeFileSync(VIDEOS_FILE, JSON.stringify(arr, null, 2));
}

function geradosHoje() {
  const d = hoje();
  return lerVideos().filter((v) => (v.criadoEm || '').slice(0, 10) === d).length;
}

async function escreverRoteiro(produtoId, sugestao) {
  const info = produtos[produtoId] || produtos.btcweather;
  const r = await ia.perguntar({
    agente: 'videasta',
    modelo: 'barato',
    sistema:
      'Você é o Videasta, criador de vídeos virais para redes sociais. Escreva o roteiro e a legenda de UM vídeo curto (5-8s) de prospecção. Responda APENAS com JSON válido com as chaves: "video_prompt" (prompt do vídeo EM INGLÊS, visual cinematográfico, descreva cena e movimento, sem texto de legenda dentro do vídeo), "legenda" (texto curto PT-BR, gancho + CTA com link), "hashtags" (até 5, separadas por espaço). Sem prometer lucro garantido.',
    mensagens: [{ role: 'user', content: `Produto: ${info.nome}. Persona: ${info.persona}. Argumentos: ${(info.argumentos || []).join('; ')}. Campanha: ${sugestao || 'sem sugestão'}` }],
    temperatura: 0.8
  });
  try {
    return JSON.parse(r.texto.trim().replace(/^```json\s*/i, '').replace(/```$/s, '').trim());
  } catch {
    return { video_prompt: r.texto.trim(), legenda: '', hashtags: '' };
  }
}

async function submeter(produtoId, sugestao) {
  const roteiro = await escreverRoteiro(produtoId, sugestao);
  const sub = await muapi.gerarVideo({
    model: MODELO,
    prompt: roteiro.video_prompt,
    aspect_ratio: ASPECT
  });
  const videos = lerVideos();
  const item = {
    id: sub.request_id,
    criadoEm: new Date().toISOString(),
    produto: produtoId,
    modelo: MODELO,
    roteiro,
    requestId: sub.request_id,
    status: sub.status || 'processing',
    custoUsd: (sub.cost && sub.cost.amount_usd) || 0,
    custoCreditos: (sub.cost && sub.cost.amount_credits) || 0
  };
  videos.push(item);
  salvarVideos(videos);
  return item;
}

async function verificarPendentes() {
  const videos = lerVideos();
  const pendentes = videos.filter((v) => v.status === 'processing' || v.status === 'queued' || v.status === 'pending');
  const prontos = [];
  for (const v of pendentes) {
    try {
      const res = await muapi.verificar(v.requestId);
      if (res.status === 'completed') {
        v.status = 'completed';
        v.url = (res.outputs || [])[0] || null;
        v.concluidoEm = new Date().toISOString();
        v.hasNsfw = (res.has_nsfw_contents || [])[0] || false;
        prontos.push(v);
      } else if (res.status === 'failed') {
        v.status = 'failed';
        v.erro = res.error || 'geração falhou';
      }
    } catch {}
  }
  if (pendentes.length) salvarVideos(videos);
  return prontos;
}

async function avisarPronto(v) {
  const info = produtos[v.produto] || produtos.btcweather;
  const checkout = (info && info.checkoutUrl) || '';
  await canais.enviarAdmin(
    `🎬 Videasta: vídeo pronto!\n\n` +
    `Produto: ${info.nome}\n` +
    `Modelo: ${v.modelo} (US$${(v.custoUsd || 0).toFixed(3)})\n` +
    `URL: ${v.url || 'sem link'}\n\n` +
    `Legenda: ${v.roteiro.legenda || '—'}\n` +
    `# ${v.roteiro.hashtags || ''}\n` +
    `CTA: ${checkout}`
  );
}

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const produtoId = evento.produto || p.produto || 'btcweather';

  if (evento.tipo === 'campanha.nova') {
    if (geradosHoje() >= LIMITE_DIA) {
      await canais.enviarAdmin(`🎬 Videasta: limite diário (${LIMITE_DIA}) atingido, campanha aguarda amanhã.`);
      return { agente: 'videasta', acao: 'limite diário atingido', novosEventos: [] };
    }
    let item;
    try {
      item = await submeter(produtoId, p.sugestao || p.resumo || '');
    } catch (e) {
      await canais.enviarAdmin(`🎬 Videasta: erro ao submeter — ${e.message}`);
      return { agente: 'videasta', acao: `erro: ${e.message}`, novosEventos: [] };
    }
    await canais.enviarAdmin(
      `🎬 Videasta: geração submetida (${geradosHoje()}/${LIMITE_DIA} hoje).\n` +
      `Modelo: ${item.modelo} · custo ~US$${(item.custoUsd || 0).toFixed(3)}\n` +
      `Prompt: ${(item.roteiro.video_prompt || '').slice(0, 120)}...`
    );
    return { agente: 'videasta', acao: 'geração submetida: ' + item.requestId, novosEventos: [] };
  }

  if (evento.tipo === 'tick.conteudo') {
    const prontos = await verificarPendentes();
    const novosEventos = prontos.map((v) => ({
      tipo: 'conteudo.pronto',
      produto: v.produto,
      payload: {
        videoId: v.id,
        url: v.url,
        legenda: v.roteiro.legenda,
        hashtags: v.roteiro.hashtags,
        produto: v.produto,
        modelo: v.modelo,
        custoUsd: v.custoUsd
      }
    }));
    for (const v of prontos) await avisarPronto(v);

    // Produzir novo se ocioso (nada processando), há campanha e abaixo do limite.
    const pendentes = lerVideos().filter((v) => v.status === 'processing' || v.status === 'queued' || v.status === 'pending');
    const temCampanha = fs.existsSync(path.join(__dirname, '..', 'data', 'campanhas.json'));
    const acoes = prontos.length ? `${prontos.length} pronto(s)` : 'nada pronto';
    if (!pendentes.length && temCampanha && geradosHoje() < LIMITE_DIA) {
      const ultima = (() => {
        try {
          const c = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'campanhas.json'), 'utf8') || '[]');
          return c[c.length - 1] || null;
        } catch {
          return null;
        }
      })();
      const sugestao = (ultima && ultima.sugestao) || '';
      try {
        const item = await submeter(produtoId, sugestao);
        await canais.enviarAdmin(
          `🎬 Videasta: nova geração (${geradosHoje()}/${LIMITE_DIA} hoje).\n` +
          `Modelo: ${item.modelo} · custo ~US$${(item.custoUsd || 0).toFixed(3)}\n` +
          `Prompt: ${(item.roteiro.video_prompt || '').slice(0, 120)}...`
        );
        return { agente: 'videasta', acao: `${acoes}; nova geração: ${item.requestId}`, novosEventos };
      } catch (e) {
        await canais.enviarAdmin(`🎬 Videasta: erro ao produzir — ${e.message}`);
        return { agente: 'videasta', acao: `${acoes}; erro: ${e.message}`, novosEventos };
      }
    }
    return { agente: 'videasta', acao: acoes, novosEventos };
  }

  return { agente: 'videasta', acao: 'tipo não tratado', novosEventos: [] };
}

module.exports = { processar, lerVideos, geradosHoje };
