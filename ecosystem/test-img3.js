const fs = require('fs');
const API_KEY = fs.readFileSync('/root/severino/.env','utf8').match(/LLM_API_KEY=(\S+)/)[1];
const DATA = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/clima_card.json', 'utf8'));
const preco = DATA.precoBTC || 0;
const fng = DATA.medoGanancia || {};
const rsi = DATA.periodos['1D']?.rsi || 50;
const prompt = `Generate a professional 9:16 vertical crypto dashboard card. Dark theme #08090f background. Bitcoin Weather Panel style. Data: BTC $${Number(preco).toLocaleString('en-US')}, RSI ${rsi}/100, Fear&Greed ${fng.value}/100 (${fng.classification}). Amber #ffb703, cyan #00f0ff, red #ff3366 accents. Glassmorphism cards. 1080x1350. Clean financial design.`;

fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'google/gemini-3-pro-image',
    messages: [{ role: 'user', content: prompt }]
  })
}).then(r => r.json()).then(d => {
  const msg = d.choices?.[0]?.message;
  if (msg?.images && msg.images.length > 0) {
    const img = msg.images[0];
    console.log('TYPE:', img.type);
    const urlObj = img.image_url || {};
    console.log('URL_OBJ_KEYS:', Object.keys(urlObj).join(','));
    const url = urlObj.url || '';
    if (url) {
      console.log('URL_PREFIX:', url.slice(0, 80));
      fetch(url).then(r => r.arrayBuffer()).then(buf => {
        fs.writeFileSync('/root/severino/ecosystem/data/card_flux.png', Buffer.from(buf));
        console.log('DOWNLOADED', buf.byteLength, 'bytes');
      }).catch(e => console.error('DL_ERR:', e.message));
    } else {
      console.log('URL_OBJ:', JSON.stringify(urlObj).slice(0, 400));
    }
  } else {
    console.log('No images found');
    console.log('MSG_RAW:', JSON.stringify(msg).slice(0, 800));
  }
}).catch(e => console.error('ERR:', e.message));