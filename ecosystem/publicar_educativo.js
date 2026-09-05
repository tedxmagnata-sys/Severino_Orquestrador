#!/usr/bin/env node
/**
 * 📣 Publicador do Post Educativo diário (X + Instagram) — BTC Weather Panel
 *
 * Lê data/posts_educativo.json e publica no Postiz:
 *   - X: texto educativo (<=250 chars, truncado se preciso)
 *   - Instagram: texto educativo + imagem do card
 *
 * Uso: node publicar_educativo.js [--x | --ig]
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const POSTS_JSON = path.join(DATA_DIR, 'posts_educativo.json');

const INTEGRATIONS = {
  x: 'cmshy3hgm0001ny6ng293kp4j',
  instagram: 'cmsibf1tc0007qu62xujvp6r6',
};

async function uploadImagem(apiUrl, apiKey, filePath) {
  const img = fs.readFileSync(filePath);
  const blob = new Blob([img], { type: 'image/png' });
  const form = new FormData();
  form.append('file', blob, 'card.png');
  const up = await fetch(apiUrl + '/upload', {
    method: 'POST', headers: { Authorization: apiKey }, body: form,
  });
  return up.json();
}

async function publicar(apiUrl, apiKey, integrationId, texto, image, isInstagram) {
  const payload = {
    type: 'now',
    date: new Date().toISOString(),
    shortLink: true,
    tags: [{ tag: 'btc' }, { tag: 'bitcoin' }],
    posts: [{
      integration: { id: integrationId },
      value: [{ content: texto, image }],
      settings: {
        who_can_reply_post: 'everyone',
        ...(isInstagram ? { post_type: 'post' } : {}),
      },
    }],
  };
  const res = await fetch(apiUrl + '/posts', {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`[educativo] HTTP ${res.status}`, body.slice(0, 300));
}

(async () => {
  const apiUrl = (process.env.POSTIZ_API_URL || '').replace(/\/$/, '');
  const apiKey = process.env.POSTIZ_API_KEY || '';
  if (!apiUrl || !apiKey) { console.log('[educativo] config ausente'); return; }
  if (!fs.existsSync(POSTS_JSON)) { console.log('[educativo] posts_educativo.json nao existe'); return; }

  const post = JSON.parse(fs.readFileSync(POSTS_JSON, 'utf8'));

  // IG sempre com imagem do card; X tambem (aumenta alcance visual)
  let image = [];
  if (fs.existsSync(post.cardPNG)) {
    const up = await uploadImagem(apiUrl, apiKey, post.cardPNG);
    if (up.id) image = [{ id: up.id, path: up.path }];
  }

  let textoX = post.x.texto;
  if (textoX.length > 280) textoX = textoX.slice(0, 270) + '…';

  const fazer = (rede, texto) => publicar(apiUrl, apiKey, INTEGRATIONS[rede], texto, image, rede === 'instagram');

  if (process.argv.includes('--x')) await fazer('x', textoX);
  else if (process.argv.includes('--ig')) await fazer('instagram', post.instagram.texto);
  else {
    await fazer('x', textoX);
    await fazer('instagram', post.instagram.texto);
  }
})();
