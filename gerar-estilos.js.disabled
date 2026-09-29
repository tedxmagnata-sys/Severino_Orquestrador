const fs = require('fs');
const API_KEY = fs.readFileSync('/root/severino/.env','utf8').match(/LLM_API_KEY=(\S+)/)[1];

const ESTILOS = [
  {
    id: 'estilo1',
    nome: 'Glassmorphism Premium',
    prompt: `Design a complete dark crypto trading dashboard web UI mockup, 16:9 landscape, full browser window. Modern glassmorphism style: frosted glass cards (rgba white 8% opacity, 1px white 8% border, backdrop blur). Deep navy-black background #08090f with subtle ambient glow orbs. Top header bar with logo "BTC WEATHER PANEL" and navigation buttons. Main area: large hero card showing BTC price $64,519.99 with a big circular RSI gauge 68/100, plus a horizontal cycle progress bar 57%. Below: a row of 7 small forecast cards for timeframes 15M 1H 4H 1D 3D 1W 1M, each with a weather icon (sun, wind, cloud, lightning) and colored status (amber #ffb703, cyan #00f0ff, red #ff3366). Side panel with strategy cards and thermometer. Lucide line icons. Inter font. Premium, clean, professional trading terminal aesthetic. High fidelity UI screenshot.`
  },
  {
    id: 'estilo2',
    nome: 'Neon Cyberpunk',
    nome2: 'Neon Terminal',
    prompt: `Design a futuristic crypto trading dashboard web UI mockup, 16:9 landscape, full browser window. Cyberpunk neon terminal aesthetic: black background #050608 with neon glow accents, glowing borders, scanline subtle effects. Header with glowing logo "BTC WEATHER PANEL" in neon font. Main hero card: BTC price $64,519.99 with animated glow, a large donut gauge showing RSI 68/100 in neon cyan #00f0ff, cycle progress bar glowing. Grid of 7 timeframe cards (15M 1H 4H 1D 3D 1W 1M) with neon icons and status pills glowing in amber #ffb703, cyan #00f0ff, magenta/red #ff3366. Right sidebar with strategy panels. Monospace numeric font, glowing dividers. High contrast, energetic, trading terminal feel. High fidelity UI screenshot.`
  },
  {
    id: 'estilo3',
    nome: 'Minimal Luxo',
    nome2: 'Luxo Minimalista',
    prompt: `Design an elegant minimal luxury crypto dashboard web UI mockup, 16:9 landscape, full browser window. Ultra-clean flat design: very dark charcoal background #0a0a0f, generous white space, thin hairline borders, no heavy glows. Sophisticated typography (light Inter/Helvetica). Top bar with refined "BTC WEATHER PANEL" wordmark. Main hero: BTC price $64,519.99 in large light-weight numerals, subtle RSI indicator bar 68/100, slim cycle progress line. A clean grid of 7 minimal forecast cards (15M 1H 4H 1D 3D 1W 1M) with small refined weather icons, quiet color accents amber #ffb703, slate blue, soft red. Side panel with tidy strategy list. Luxury fintech aesthetic like Apple/Stripe design. High fidelity UI screenshot.`
  }
];

async function gerar(estilo) {
  const body = {
    model: 'google/gemini-3-pro-image',
    messages: [{ role: 'user', content: estilo.prompt }]
  };
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  const msg = d.choices?.[0]?.message;
  if (!msg?.images?.length) throw new Error('Sem imagem: ' + JSON.stringify(d).slice(0, 200));
  const url = msg.images[0].image_url.url;
  const buf = Buffer.from(url.split(',')[1], 'base64');
  const out = '/root/severino/ecosystem/data/dash_' + estilo.id + '.png';
  fs.writeFileSync(out, buf);
  console.log(estilo.id, 'OK', Math.round(buf.length / 1024), 'KB');
}

(async () => {
  for (const e of ESTILOS) {
    try { await gerar(e); } catch (err) { console.log(e.id, 'ERRO', err.message); }
  }
})();
