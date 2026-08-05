const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/clima_card.json', 'utf8'));
const API_KEY = fs.readFileSync('/root/severino/.env','utf8').match(/LLM_API_KEY=(\S+)/)[1];

const preco = DATA.precoBTC || 0;
const fng = DATA.medoGanancia || {};
const rsi = DATA.periodos['1D']?.rsi || 50;

const prompt = `generate an image: Professional dark crypto dashboard card 9:16, Bitcoin price $${Number(preco).toLocaleString('en-US')}, RSI ${rsi}, Fear & Greed ${fng.value}, carbon fiber background, neon blue and amber accents, glassmorphism widgets, grid pattern, high quality 1080x1350, no text errors`;

fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/tedxmagnata-severino',
    'X-Title': 'Severino'
  },
  body: JSON.stringify({
    model: 'black-forest-labs/flux-pro',
    messages: [{ role: 'user', content: prompt }]
  })
}).then(r => r.json()).then(d => {
  const c = d.choices?.[0]?.message?.content || JSON.stringify(d);
  console.log(c);
}).catch(e => console.error('ERROR:', e.message));