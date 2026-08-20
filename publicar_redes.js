#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const POSTS_JSON = path.join(DATA_DIR, 'posts_redes.json');
const CARD_MP4 = path.join(DATA_DIR, 'card_today.mp4');
const CARD_PNG = path.join(DATA_DIR, 'card_today.png');

const INTEGRATIONS = {
  x: 'cmshy3hgm0001ny6ng293kp4j',
  instagram: 'cmsibf1tc0007qu62xujvp6r6',
};

// Usa o vídeo animado (loop infinito) quando existir e POSTAR_VIDEO_CARD=on (default)
const POSTAR_VIDEO = process.env.POSTAR_VIDEO_CARD !== 'off';

async function uploadArquivo(apiUrl, apiKey, caminho, mime, nome) {
  const buf = fs.readFileSync(caminho);
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append('file', blob, nome);
  const up = await fetch(apiUrl + '/upload', {
    method: 'POST', headers: { Authorization: apiKey }, body: form,
  });
  const upData = await up.json();
  if (!upData.id) throw new Error('upload sem id');
  return [{ id: upData.id, path: upData.path }];
}

(async () => {
  const apiUrl = (process.env.POSTIZ_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.POSTIZ_API_KEY || '';
  if (!apiUrl || !apiKey) { console.log('[redes] config ausente'); return; }
  if (!fs.existsSync(POSTS_JSON)) { console.log('[redes] posts_redes.json nao existe'); return; }

  const post = JSON.parse(fs.readFileSync(POSTS_JSON, 'utf8'));
  const destinos = [];
  if (process.argv.includes('--x')) destinos.push({ rede: 'X', id: INTEGRATIONS.x, texto: post.x.texto });
  if (process.argv.includes('--ig')) destinos.push({ rede: 'Instagram', id: INTEGRATIONS.instagram, texto: post.instagram.texto });
  if (!destinos.length) {
    destinos.push({ rede: 'X', id: INTEGRATIONS.x, texto: post.x.texto });
    destinos.push({ rede: 'Instagram', id: INTEGRATIONS.instagram, texto: post.instagram.texto });
  }

  for (const d of destinos) {
    let media = [];
    try {
      // 1) tenta vídeo animado (qualquer rede; Instagram vira Reel)
      if (POSTAR_VIDEO && fs.existsSync(CARD_MP4)) {
        media = await uploadArquivo(apiUrl, apiKey, CARD_MP4, 'video/mp4', 'card_today.mp4');
        console.log(`[redes] ${d.rede}: usando VIDEO card_today.mp4`);
      } else if (fs.existsSync(CARD_PNG)) {
        media = await uploadArquivo(apiUrl, apiKey, CARD_PNG, 'image/png', 'card.png');
        console.log(`[redes] ${d.rede}: usando IMAGEM card_today.png`);
      }
    } catch (e) {
      console.log(`[redes] ${d.rede}: upload falhou (${e.message}) — tenta imagem`);
      try {
        if (fs.existsSync(CARD_PNG)) {
          media = await uploadArquivo(apiUrl, apiKey, CARD_PNG, 'image/png', 'card.png');
        }
      } catch (e2) {
        console.log(`[redes] ${d.rede}: imagem tambem falhou (${e2.message})`);
      }
    }

    let content = d.texto;
    if (d.rede === 'X' && content.length > 250) content = content.slice(0, 240) + '…';

    const ehVideo = media.some((m) => m.path && m.path.endsWith('.mp4'));
    const payload = {
      type: 'now',
      date: new Date().toISOString(),
      shortLink: true,
      tags: [{ tag: 'btc' }, { tag: 'bitcoin' }],
      posts: [{
        integration: { id: d.id },
        value: [{ content, image: media }],
        settings: {
          who_can_reply_post: 'everyone',
          // Postiz self-hosted aceita apenas 'post' ou 'story' (sem 'reel'); vídeo vira feed video
          ...(d.rede === 'Instagram' ? { post_type: 'post' } : {}),
        },
      }],
    };

    const res = await fetch(apiUrl + '/posts', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    console.log(`[redes] ${d.rede}: HTTP ${res.status}`, body.slice(0, 300));
  }
})();