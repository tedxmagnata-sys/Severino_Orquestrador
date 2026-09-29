const fs = require('fs');
const API_KEY = fs.readFileSync('/root/severino/.env','utf8').match(/LLM_API_KEY=(\S+)/)[1];
const DATA = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/clima_card.json', 'utf8'));
const preco = DATA.precoBTC || 0;
const fng = DATA.medoGanancia || {};
const rsi = DATA.periodos['1D']?.rsi || 50;
const prompt = `Generate a professional 9:16 vertical crypto dashboard card. Dark theme #08090f. Bitcoin Weather Panel style. Data: BTC $${Number(preco).toLocaleString('en-US')}, RSI ${rsi}/100, Fear&Greed ${fng.value}/100 (${fng.classification}). Amber #ffb703, cyan #00f0ff, red #ff3366 accents. Glassmorphism. 1080x1350.`;

fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image',
    messages: [{ role: 'user', content: prompt }]
  })
}).then(r => r.json()).then(d => {
  const s = JSON.stringify(d);
  console.log('LENGTH:', s.length);
  console.log('KEYS:', Object.keys(d).join(','));
  if (d.choices?.[0]?.message) {
    const m = d.choices[0].message;
    console.log('MSG_KEYS:', Object.keys(m).join(','));
    console.log('MSG_JSON:', JSON.stringify(m).slice(0, 600));
  }
  console.log('TOP_RAW:', s.slice(0, 900));
}).catch(e => console.error('ERR:', e.message));