/**
 * 👀 Observador — publica o conteúdo pronto (vídeos do Videasta) nas redes sociais.
 * - conteudo.pronto: faz upload do vídeo no Postiz e publica no X e Instagram,
 *   registra o resultado em data/videos.json (anti-repetição por rede) e avisa o admin.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const canais = require('../canais');
const produtos = require('../produtos.json');

const DATA_DIR = path.join(__dirname, '..', 'data');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');

const INTEGRATIONS = {
  x: { rede: 'X', id: 'cmshy3hgm0001ny6ng293kp4j' },
  instagram: { rede: 'Instagram', id: 'cmsibf1tc0007qu62xujvp6r6' },
};

function apiUrl() {
  return (process.env.POSTIZ_API_URL || '').replace(/\/$/, '');
}
function apiKey() {
  return process.env.POSTIZ_API_KEY || '';
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
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
  fs.writeFileSync(VIDEOS_FILE, JSON.stringify(arr, null, 2));
}

function gravarResultado(videoId, resultados) {
  const videos = lerVideos();
  const alvo = videos.find((v) => v.id === videoId);
  if (alvo) {
    alvo.publicacoes = resultados;
    alvo.publicadoEm = new Date().toISOString();
    const redesOk = Object.keys(INTEGRATIONS).filter((k) =>
      resultados.some((r) => r.etapa === INTEGRATIONS[k].rede && r.ok)
    );
    alvo.publicado = redesOk.length === Object.keys(INTEGRATIONS).length;
    salvarVideos(videos);
  }
}

async function uploadVideo(url) {
  const res = await fetch(apiUrl() + '/upload-from-url', {
    method: 'POST',
    headers: { Authorization: apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const body = await res.json();
  if (!res.ok || !body.id) {
    throw new Error(`upload falhou (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { id: body.id, path: body.path };
}

async function publicarNoPostiz(integration, texto, media) {
  const payload = {
    type: 'now',
    date: new Date().toISOString(),
    shortLink: true,
    tags: [{ tag: 'btc' }, { tag: 'bitcoin' }],
    posts: [{
      integration: { id: integration.id },
      value: [{
        content: texto,
        image: [{ id: media.id, path: media.path }],
      }],
      settings: {
        who_can_reply_post: 'everyone',
        ...(integration.rede === 'Instagram' ? { post_type: 'post' } : {}),
      },
    }],
  };
  const res = await fetch(apiUrl() + '/posts', {
    method: 'POST',
    headers: { Authorization: apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${integration.rede} falhou (${res.status}): ${body.slice(0, 300)}`);
  }
  return { rede: integration.rede, resposta: body.slice(0, 120) };
}

function legendaFinal(legenda, produtoId, linkNaBio) {
  const info = produtos[produtoId] || produtos.btcweather;
  const checkout = (info && info.checkoutUrl) || 'https://pay.kiwify.com.br/ffphj4e';
  const link = linkNaBio ? 'link na bio 👆' : checkout;
  let txt = String(legenda || '')
    .replace(/\[link\]/gi, link)
    .replace(/\{\{?CHECKOUT\}?\}/gi, link)
    .trim();
  if (txt.length > 240) txt = txt.slice(0, 237) + '…';
  return txt;
}

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const videoId = p.videoId;
  const url = p.url;
  const produtoId = evento.produto || p.produto || 'btcweather';

  if (evento.tipo !== 'conteudo.pronto') {
    return { agente: 'observador', acao: 'tipo não tratado', novosEventos: [] };
  }

  if (!apiUrl() || !apiKey()) {
    await canais.enviarAdmin(`👀 Observador: configuração POSTIZ ausente (não publicou vídeo ${videoId}).`);
    return { agente: 'observador', acao: 'config ausente', novosEventos: [] };
  }

  const videos = lerVideos();
  const video = videos.find((v) => v.id === videoId);
  if (!video) {
    return { agente: 'observador', acao: `vídeo ${videoId} não encontrado`, novosEventos: [] };
  }

  const previas = (video.publicacoes || []).filter((r) => r.ok);
  const jaFeito = new Set(previas.map((r) => r.etapa));
  if (video.publicado) {
    return { agente: 'observador', acao: `vídeo ${videoId} já publicado`, novosEventos: [] };
  }

  const textoX = legendaFinal((video.roteiro && video.roteiro.legenda) || p.legenda || '', produtoId, true);
  const hashtags = (video.roteiro && video.roteiro.hashtags) || p.hashtags || '';
  const hashtagsParte = hashtags ? '\n\n' + hashtags : '';
  const textoIG = legendaFinal((video.roteiro && video.roteiro.legenda) || p.legenda || '', produtoId, false) + hashtagsParte;

  const resultados = previas.slice();
  try {
    let media = null;
    if (jaFeito.has('upload')) {
      const m = video.publicacoes.find((r) => r.etapa === 'upload');
      if (m && m.id && m.path) media = { id: m.id, path: m.path };
    }
    if (!media) {
      const m = await uploadVideo(url || video.url);
      media = m;
      resultados.push({ etapa: 'upload', ok: true, id: m.id, path: m.path });
    }

    for (const integracao of Object.values(INTEGRATIONS)) {
      if (jaFeito.has(integracao.rede)) continue;
      const texto = integracao.rede === 'Instagram' ? textoIG : textoX;
      const r = await publicarNoPostiz(integracao, texto, media);
      resultados.push({ etapa: integracao.rede, ok: true, ...r });
    }

    gravarResultado(videoId, resultados);

    const info = produtos[produtoId] || produtos.btcweather;
    const redes = Object.keys(INTEGRATIONS).map((k) => {
      const ok = resultados.some((r) => r.etapa === INTEGRATIONS[k].rede && r.ok);
      return `${ok ? '✅' : '⏳'} ${INTEGRATIONS[k].rede}: ${ok ? 'publicado' : 'pendente'}`;
    });
    await canais.enviarAdmin(
      `👀 Observador: vídeo publicado!\n\n` +
      `Produto: ${info.nome}\n` +
      `Vídeo: ${videoId}\n` +
      redes.join('\n') +
      `\n\nLegenda: ${textoX.slice(0, 120)}...`
    );

    return { agente: 'observador', acao: `publicado X+IG (${videoId})`, novosEventos: [] };
  } catch (e) {
    gravarResultado(videoId, resultados); // guarda progresso parcial
    await canais.enviarAdmin(`👀 Observador: erro ao publicar ${videoId} — ${e.message}`);
    return { agente: 'observador', acao: `erro: ${e.message}`, novosEventos: [] };
  }
}

module.exports = { processar };
