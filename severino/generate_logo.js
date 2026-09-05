const sharp = require('sharp');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SVG_PATH = '/tmp/logo.svg';
const PNG_PATH = '/tmp/logo.png';

// Create the SVG
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0d1b2a"/>
      <stop offset="50%" style="stop-color:#1b2838"/>
      <stop offset="100%" style="stop-color:#0d1b2a"/>
    </linearGradient>
    <linearGradient id="btc" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f7931a"/>
      <stop offset="100%" style="stop-color:#f9b348"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00e676"/>
      <stop offset="100%" style="stop-color:#00c853"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#00e676" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="256" cy="256" r="240" fill="url(#bg)" stroke="url(#glow)" stroke-width="3"/>
  <circle cx="256" cy="256" r="220" fill="none" stroke="url(#glow)" stroke-width="1" opacity="0.15"/>
  <circle cx="256" cy="256" r="200" fill="none" stroke="url(#glow)" stroke-width="0.5" opacity="0.08"/>
  <g transform="translate(256, 240)">
    <text x="0" y="40" font-family="Arial Black, sans-serif" font-size="180" font-weight="900"
          fill="url(#btc)" text-anchor="middle" dominant-baseline="middle"
          filter="url(#shadow)">&#x20BF;</text>
  </g>
  <g opacity="0.6">
    <line x1="256" y1="60" x2="256" y2="85" stroke="#f9b348" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="256" y1="60" x2="256" y2="85" stroke="#f9b348" stroke-width="2.5" stroke-linecap="round" transform="rotate(45 256 60)"/>
    <line x1="256" y1="60" x2="256" y2="85" stroke="#f9b348" stroke-width="2.5" stroke-linecap="round" transform="rotate(90 256 60)"/>
    <line x1="256" y1="60" x2="256" y2="85" stroke="#f9b348" stroke-width="2.5" stroke-linecap="round" transform="rotate(135 256 60)"/>
    <ellipse cx="220" cy="72" rx="25" ry="12" fill="#8899aa" opacity="0.4"/>
    <ellipse cx="240" cy="68" rx="20" ry="10" fill="#8899aa" opacity="0.3"/>
    <ellipse cx="290" cy="74" rx="22" ry="10" fill="#8899aa" opacity="0.35"/>
  </g>
  <text x="256" y="370" font-family="Arial, sans-serif" font-size="28" font-weight="700"
        fill="url(#glow)" text-anchor="middle" letter-spacing="3">BTC WEATHER</text>
  <text x="256" y="400" font-family="Arial, sans-serif" font-size="14" font-weight="400"
        fill="#667788" text-anchor="middle" letter-spacing="2">PANEL</text>
  <circle cx="430" cy="430" r="3" fill="url(#glow)" opacity="0.3"/>
  <circle cx="80" cy="430" r="2" fill="url(#glow)" opacity="0.2"/>
  <circle cx="440" cy="120" r="2" fill="#f9b348" opacity="0.3"/>
  <circle cx="70" cy="100" r="1.5" fill="#f9b348" opacity="0.2"/>
</svg>`;

fs.writeFileSync(SVG_PATH, svg);
console.log('SVG created');

// Convert to PNG using sharp
sharp(SVG_PATH)
  .resize(512, 512)
  .png()
  .toFile(PNG_PATH)
  .then(() => {
    console.log('PNG created');

    // Send to admin via Telegram
    const token = '8843645093:AAG-g6ZpqOjmvuPradtTPj4_u22CuhKc5tw';
    const chatId = '1088548125';

    // First send as document (photo may fail if bot not started)
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const img = fs.readFileSync(PNG_PATH);
    const payload = [
      '--' + boundary,
      'Content-Disposition: form-data; name="chat_id"',
      '',
      chatId,
      '--' + boundary,
      'Content-Disposition: form-data; name="photo"; filename="logo.png"',
      'Content-Type: image/png',
      '',
      img.toString('binary'),
      '--' + boundary + '--',
      ''
    ].join('\r\n');

    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + token + '/sendPhoto',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': Buffer.byteLength(payload, 'binary')
      }
    };

    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        console.log('Response:', d);
        // Also try sending a caption
        const captionPayload = JSON.stringify({
          chat_id: chatId,
          text: 'Logo BTC Weather Panel para usar no @btcweatherpanel_bot',
          parse_mode: 'HTML'
        });
        const captionReq = https.request({
          hostname: 'api.telegram.org',
          port: 443,
          path: '/bot' + token + '/sendMessage',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(captionPayload) }
        }, cr => {
          let cd = '';
          cr.on('data', c => cd += c);
          cr.on('end', () => console.log('Caption:', cd));
        });
        captionReq.on('error', e => console.error('Caption error:', e));
        captionReq.write(captionPayload);
        captionReq.end();
      });
    });
    req.on('error', e => console.error('Send error:', e));
    req.write(payload, 'binary');
    req.end();
  })
  .catch(e => console.error('Sharp error:', e));
