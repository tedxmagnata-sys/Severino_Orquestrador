#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const POSTS_JSON = path.join(DATA_DIR, 'posts_redes.json');

const INTEGRATIONS = {
  x: 'cmshy3hgm0001ny6ng293kp4j',
  instagram: 'cmsibf1tc0007qu62xujvp6r6',
};

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
    let image = [];
    if (fs.existsSync(post.cardPNG)) {
      const img = fs.readFileSync(post.cardPNG);
      const blob = new Blob([img], { type: 'image/png' });
      const form = new FormData();
      form.append('file', blob, 'card.png');
      const up = await fetch(apiUrl + '/upload', {
        method: 'POST', headers: { Authorization: apiKey }, body: form,
      });
      const upData = await up.json();
      if (upData.id) image = [{ id: upData.id, path: upData.path }];
    }

    let content = d.texto;
    if (d.rede === 'X' && content.length > 250) content = content.slice(0, 240) + '…';

    const payload = {
      type: 'now',
      date: new Date().toISOString(),
      shortLink: true,
      tags: [{ tag: 'btc' }, { tag: 'bitcoin' }],
      posts: [{
        integration: { id: d.id },
        value: [{ content, image }],
        settings: {
          who_can_reply_post: 'everyone',
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