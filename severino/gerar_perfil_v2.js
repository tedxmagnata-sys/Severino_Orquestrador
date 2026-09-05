/**
 * 🖼️ Foto de perfil do canal — HÍBRIDA (Gemini Flash fundo + sharp texto Inter)
 * Gera 2 variações para escolher.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const API_KEY = process.env.LLM_API_KEY || '';
const MODELO = 'google/gemini-2.5-flash-image';
const SZ = 640;

function overlaySvg(variante) {
  const cor = variante === 'v1' ? '#ffb703' : '#00f0ff';
  const subCor = variante === 'v1' ? '#00f0ff' : '#ffb703';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SZ}" height="${SZ}" viewBox="0 0 ${SZ} ${SZ}">
  <defs>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.72">
      <stop offset="0%" stop-color="rgba(8,9,15,0.0)"/>
      <stop offset="78%" stop-color="rgba(8,9,15,0.15)"/>
      <stop offset="100%" stop-color="rgba(8,9,15,0.55)"/>
    </radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect width="${SZ}" height="${SZ}" fill="url(#vig)"/>

  <!-- moldura fina -->
  <rect x="14" y="14" width="${SZ-28}" height="${SZ-28}" rx="34" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
  <rect x="22" y="22" width="${SZ-44}" height="${SZ-44}" rx="28" fill="none" stroke="${cor}" stroke-width="1.5" stroke-dasharray="10 14" opacity="0.7"/>

  <!-- placa do nome -->
  <g filter="url(#soft)">
    <rect x="90" y="474" width="460" height="96" rx="26" fill="rgba(8,9,15,0.78)"/>
  </g>
  <text x="320" y="516" text-anchor="middle" font-family="Inter, Arial" font-size="54" font-weight="800" fill="#ffffff" letter-spacing="2">BTC WEATHER</text>
  <text x="320" y="556" text-anchor="middle" font-family="Inter, Arial" font-size="21" font-weight="500" fill="${subCor}" letter-spacing="8">CLIMA DO MERCADO</text>

  <!-- moeda central -->
  <g filter="url(#glow)">
    <circle cx="320" cy="330" r="120" fill="${cor}" fill-opacity="0.14"/>
    <circle cx="320" cy="330" r="112" fill="none" stroke="${cor}" stroke-width="5"/>
  </g>
  <text x="320" y="398" text-anchor="middle" font-family="Arial, sans-serif" font-size="130" font-weight="800" fill="#ffffff">₿</text>
</svg>`;
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
  const variantes = [
    {
      id: 'v1',
      label: 'V1 - ouro/âmbar',
      prompt: `Square 640x640 premium cryptocurrency logo background art. A golden bitcoin coin with intricate engraved details and glowing amber (#ffb703) light, surrounded by elegant weather elements: soft clouds, a small sun with rays, a lightning bolt. Dark navy luxury background (#08090f) with subtle smoke and light particles, cinematic rim lighting, high detail, museum quality. IMPORTANT: no text, no letters, no numbers, no watermark. Leave bottom center area (y 470-580) relatively clean/darker for text overlay.`
    },
    {
      id: 'v2',
      label: 'V2 - ciano',
      prompt: `Square 640x640 premium futuristic cryptocurrency logo background art. A glowing cyan (#00f0ff) bitcoin coin with holographic effects and intricate circuit details, surrounded by elegant weather elements: geometric clouds, a small sun, a lightning bolt. Deep navy-black luxury background (#08090f) with digital particles and soft glow, cinematic lighting, high detail, premium fintech aesthetic. IMPORTANT: no text, no letters, no numbers, no watermark. Leave bottom center area (y 470-580) relatively clean/darker for text overlay.`
    }
  ];

  for (const v of variantes) {
    try {
      const fundo = await gerarFundo(v.prompt);
      fs.writeFileSync(path.join(DATA_DIR, 'perfil_' + v.id + '_bg.png'), fundo);
      const bgResized = await sharp(fundo).resize(SZ, SZ, { fit: 'cover' }).toBuffer();
      const out = await sharp(bgResized).composite([{ input: Buffer.from(overlaySvg(v.id)), top: 0, left: 0 }]).png().toBuffer();
      const outPath = path.join(DATA_DIR, 'perfil_' + v.id + '.png');
      fs.writeFileSync(outPath, out);
      console.log('OK', v.id, v.label, Math.round(out.length / 1024), 'KB');
    } catch (e) {
      console.log('ERRO', v.id, e.message.slice(0, 100));
    }
  }
})();
