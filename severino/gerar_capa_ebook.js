/**
 * 🖼️ Capa do E-book — "A Estratégia do Agricultor de Bitcoin"
 * Híbrida: Gemini Flash v2 gera o fundo artístico + sharp sobrepõe texto (Inter)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.LLM_API_KEY || '';
const MODELO = 'google/gemini-2.5-flash-image';
const W = 1080, H = 1350;

function overlaySvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(8,9,15,0.88)"/>
      <stop offset="45%" stop-color="rgba(8,9,15,0.55)"/>
      <stop offset="100%" stop-color="rgba(8,9,15,0.10)"/>
    </linearGradient>
    <linearGradient id="bot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(8,9,15,0.05)"/>
      <stop offset="100%" stop-color="rgba(8,9,15,0.85)"/>
    </linearGradient>
    <linearGradient id="tit" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffb703"/>
      <stop offset="55%" stop-color="#ff3366"/>
      <stop offset="100%" stop-color="#00f0ff"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#top)"/>
  <rect y="${H-420}" width="${W}" height="${H}" fill="url(#bot)"/>
  <text x="${W/2}" y="150" text-anchor="middle" font-family="Inter, Arial" font-size="30" font-weight="700" fill="#00f0ff" letter-spacing="6">O SEGREDO QUE OS AGRICULTORES SABEM</text>
  <text x="${W/2}" y="250" text-anchor="middle" font-family="Inter, Arial" font-size="78" font-weight="900" fill="#ffffff">A ESTRATÉGIA DO</text>
  <text x="${W/2}" y="360" text-anchor="middle" font-family="Inter, Arial" font-size="78" font-weight="900" fill="url(#tit)">AGRICULTOR DE BITCOIN</text>
  <text x="${W/2}" y="470" text-anchor="middle" font-family="Inter, Arial" font-size="36" font-weight="600" fill="#f1f3f9">Plante no medo · Cultive com paciência · Colha na euforia</text>
  <g>
    <rect x="${W/2-330}" y="${H-330}" width="660" height="110" rx="55" fill="rgba(255,183,3,0.12)" stroke="#ffb703" stroke-width="3"/>
    <text x="${W/2}" y="${H-258}" text-anchor="middle" font-family="Inter, Arial" font-size="40" font-weight="800" fill="#ffb703">🌦️ CLIMA DO BTC</text>
  </g>
  <text x="${W/2}" y="${H-150}" text-anchor="middle" font-family="Inter, Arial" font-size="28" font-weight="500" fill="#c8cdda">Teste grátis 7 dias · btcweatherpanel.com</text>
</svg>`;
  return Buffer.from(svg);
}

function gerarFundo(prompt) {
  return new Promise((resolve, reject) => {
    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        messages: [{ role: 'user', content: prompt }]
      })
    }).then(r => r.json()).then(d => {
      const msg = d.choices?.[0]?.message;
      if (!msg?.images?.length) return reject(new Error('sem imagem ' + JSON.stringify(d).slice(0, 120)));
      const url = msg.images[0].image_url.url;
      if (!url.startsWith('data:image')) return reject(new Error('formato ' + url.slice(0, 20)));
      resolve(Buffer.from(url.split(',')[1], 'base64'));
    }).catch(reject);
  });
}

(async () => {
  const prompt = `Vertical 1080x1350 premium ebook cover background art for a Bitcoin investment strategy guide. A beautiful golden Bitcoin coin rising like a sun over a lush green agricultural field at sunrise, with rows of growing crops, gentle morning mist, a farmer silhouette standing contemplatively, warm amber (#ffb703) light mixing with cyan (#00f0ff) sky tones. Cinematic, high detail, painterly, inspirational mood of patience and harvest. Dark cinematic edges for text overlay. IMPORTANT: no text, no letters, no numbers, no watermark.`;
  try {
    const fundo = await gerarFundo(prompt);
    const bgResized = await sharp(fundo).resize(W, H, { fit: 'cover' }).toBuffer();
    const out = await sharp(bgResized).composite([{ input: overlaySvg(), top: 0, left: 0 }]).png().toBuffer();
    fs.writeFileSync(path.join(__dirname, 'data', 'ebook_capa.png'), out);
    console.log('OK capa', Math.round(out.length / 1024), 'KB');
  } catch (e) {
    console.log('ERRO', e.message.slice(0, 140));
  }
})();
