/**
 * 🧪 Testar qualidade de fundos IA (variações de modelo/prompt)
 * Gera 3 fundos diferentes para o usuário escolher o estilo.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const CLIMA_JSON = path.join(DATA_DIR, 'clima_card.json');
const DATA = JSON.parse(fs.readFileSync(CLIMA_JSON, 'utf8'));
const API_KEY = process.env.LLM_API_KEY || '';

const principal = DATA.periodos['1D'] || {};
const sel = (() => {
  const c = (principal.clima || '').toUpperCase();
  if (c.includes('SOBRECOMPRA')) return '#ff3366';
  if (c.includes('SOBREVENDA')) return '#ffb703';
  if (c.includes('ALTA')) return '#ffb703';
  if (c.includes('BAIXA')) return '#ff3366';
  return '#00f0ff';
})();

const CENAS = {
  '#ffb703': 'a cinematic golden sunrise over a vast wheat field ready for harvest, warm amber light rays through clouds, a glowing golden bitcoin coin floating above the horizon, epic volumetric lighting, ultra detailed',
  '#ff3366': 'a dramatic dark thunderstorm over a farmland, heavy rain and lightning strikes, ominous moody clouds, a bitcoin coin glowing faint red under a stormy sky, cinematic, high contrast, ultra detailed',
  '#00f0ff': 'a serene misty morning over rolling green hills, soft blue-cyan fog layers, calm clouds, subtle glowing bitcoin symbol in the sky, peaceful cinematic atmosphere, ultra detailed'
};

const VARIANTES = [
  {
    id: 'pro-art',
    modelo: 'google/gemini-3-pro-image',
    label: 'Gemini Pro - arte premium',
    prompt: `Vertical 9:16 premium digital artwork, cryptocurrency concept. ${CENAS[sel]}. Dark elegant color palette (#08090f base), cinematic lighting, rich detail, depth of field. IMPORTANT: no text, no letters, no numbers, no watermark, no logos. Center area kept relatively clean for UI overlay. Bottom third darker gradient for readability. Museum-quality art.`
  },
  {
    id: 'pro-real',
    modelo: 'google/gemini-3-pro-image',
    label: 'Gemini Pro - foto realista',
    prompt: `Vertical 9:16 photorealistic cinematic scene. ${CENAS[sel]}. Dramatic natural lighting, real photography style, 8k quality, shallow depth of field. IMPORTANT: absolutely no text, no letters, no numbers, no watermark. Center open space for overlay. Bottom slightly darker. Award-winning photograph.`
  },
  {
    id: 'flash-v2',
    modelo: 'google/gemini-2.5-flash-image',
    label: 'Gemini Flash v2 - abstrato',
    prompt: `Vertical 9:16 abstract premium wallpaper, dark moody gradients in deep navy and ${sel} accent glow, subtle digital smoke and light particles, futuristic financial atmosphere, elegant minimal composition. IMPORTANT: no text, no numbers, no watermark. Clean center.`
  }
];

function gerar(v) {
  return new Promise((resolve, reject) => {
    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: v.modelo,
        messages: [{ role: 'user', content: v.prompt }]
      })
    }).then(r => r.json()).then(d => {
      const msg = d.choices?.[0]?.message;
      if (!msg?.images?.length) return reject(new Error(v.id + ': sem imagem ' + JSON.stringify(d).slice(0, 120)));
      const url = msg.images[0].image_url.url;
      if (!url.startsWith('data:image')) return reject(new Error(v.id + ': formato ' + url.slice(0, 30)));
      const buf = Buffer.from(url.split(',')[1], 'base64');
      const out = path.join(DATA_DIR, 'fundo_' + v.id + '.png');
      fs.writeFileSync(out, buf);
      console.log('OK', v.id, '(', v.label, ')', Math.round(buf.length / 1024), 'KB');
      resolve();
    }).catch(reject);
  });
}

(async () => {
  for (const v of VARIANTES) {
    try { await gerar(v); }
    catch (e) { console.log('ERRO', v.id, '->', e.message.slice(0, 120)); }
  }
  console.log('DONE');
})();
