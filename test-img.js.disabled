const fs = require('fs');
const API_KEY = fs.readFileSync('/root/severino/.env','utf8').match(/LLM_API_KEY=(\S+)/)[1];

const DATA = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/clima_card.json', 'utf8'));
const preco = DATA.precoBTC || 0;
const fng = DATA.medoGanancia || {};
const rsi = DATA.periodos['1D']?.rsi || 50;

const prompt = `Generate a professional 9:16 vertical crypto dashboard card. Dark theme #08090f background. Bitcoin Weather Panel style. Show real data: BTC price $${Number(preco).toLocaleString('en-US')}, RSI ${rsi}/100, Fear & Greed ${fng.value}/100 (${fng.classification}). Use amber #ffb703, cyan #00f0ff, red #ff3366 accents. Glassmorphism cards. 1080x1350. Clean financial design.`;

fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image',
    messages: [{ role: 'user', content: prompt }]
  })
}).then(r => r.json()).then(d => {
  const c = d.choices?.[0]?.message;
  console.log(JSON.stringify({id: d.id, model: d.model, hasContent: !!c?.content}, null, 2));
  if (c?.content) {
    for (const part of c.content) {
      if (part.type === 'image_url') {
        console.log('IMAGE_URL_PREFIX:', part.image_url?.url?.slice(0, 80));
      } else if (part.type === 'text') {
        console.log('TEXT:', part.text?.slice(0, 400));
      } else {
        console.log('PART_TYPE:', part.type);
      }
    }
  }
  if (d.error) console.log('ERROR:', JSON.stringify(d.error));
}).catch(e => console.error('FETCH_ERROR:', e.message));