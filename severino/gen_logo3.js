const sharp = require('sharp');
const https = require('https');
const fs = require('fs');

const TOKEN = '8843645093:AAG-g6ZpqOjmvuPradtTPj4_u22CuhKc5tw';
const CHAT_ID = '1088548125';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#0a1929"/><stop offset="60%" stop-color="#050e1a"/><stop offset="100%" stop-color="#02070d"/>
    </radialGradient>
    <radialGradient id="glowCenter" cx="50%" cy="45%" r="35%">
      <stop offset="0%" stop-color="#00e676" stop-opacity="0.08"/><stop offset="100%" stop-color="#00e676" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="neonGreen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#69f0ae"/><stop offset="50%" stop-color="#00e676"/><stop offset="100%" stop-color="#00b248"/>
    </linearGradient>
    <linearGradient id="btcOrange" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbc02d"/><stop offset="50%" stop-color="#f7931a"/><stop offset="100%" stop-color="#e65100"/>
    </linearGradient>
    <linearGradient id="visorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#00e676" stop-opacity="0.9"/>
      <stop offset="30%" stop-color="#00e676" stop-opacity="0.3"/>
      <stop offset="70%" stop-color="#00b248" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#006b3f" stop-opacity="0.4"/>
    </linearGradient>
    <linearGradient id="metal" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a3a4a"/><stop offset="50%" stop-color="#1a2a3a"/><stop offset="100%" stop-color="#0a1a2a"/>
    </linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <clipPath id="circle"><circle cx="256" cy="256" r="240"/></clipPath>
  </defs>

  <circle cx="256" cy="256" r="240" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="240" fill="url(#glowCenter)"/>
  <circle cx="256" cy="256" r="235" fill="none" stroke="#00e676" stroke-width="0.5" opacity="0.06"/>

  <g clip-path="url(#circle)" filter="url(#shadow)">
    <path d="M156 110 Q156 70 196 66 L316 66 Q356 70 356 110 L358 250 Q358 320 300 340 L212 340 Q154 320 154 250 Z" fill="url(#metal)" stroke="#3a5a6a" stroke-width="0.6" opacity="0.95"/>
    <path d="M190 280 Q256 300 322 280 L320 320 Q300 338 256 340 Q212 338 192 320 Z" fill="#050e1a" stroke="#2a4a5a" stroke-width="0.5" opacity="0.7"/>
    
    <rect x="216" y="340" width="80" height="20" rx="2" fill="#050e1a" stroke="#2a4a5a" stroke-width="0.3" opacity="0.6"/>
    <rect x="148" y="175" width="10" height="50" rx="2" fill="url(#metal)" stroke="#00e676" stroke-width="0.3" opacity="0.25"/>
    <rect x="354" y="175" width="10" height="50" rx="2" fill="url(#metal)" stroke="#00e676" stroke-width="0.3" opacity="0.25"/>

    <path d="M170 135 Q170 115 190 113 L322 113 Q342 115 342 135 L344 185 Q344 205 322 207 L190 207 Q170 205 170 185 Z" fill="#050e1a" stroke="#3a7a5a" stroke-width="1"/>
    <path d="M176 138 Q176 122 192 118 L320 118 Q336 122 336 138 L338 183 Q338 199 320 201 L192 201 Q176 199 176 183 Z" fill="url(#visorGrad)" opacity="0.5"/>

    <polygon points="196,150 216,138 236,150 236,170 216,182 196,170" fill="none" stroke="url(#neonGreen)" stroke-width="2" filter="url(#glow)"/>
    <circle cx="216" cy="160" r="4" fill="#69f0ae" opacity="0.4" filter="url(#glow)"/>
    <circle cx="216" cy="160" r="1.5" fill="#fff" opacity="0.5"/>

    <polygon points="276,150 296,138 316,150 316,170 296,182 276,170" fill="none" stroke="url(#neonGreen)" stroke-width="2" filter="url(#glow)"/>
    <circle cx="296" cy="160" r="4" fill="#69f0ae" opacity="0.4" filter="url(#glow)"/>
    <circle cx="296" cy="160" r="1.5" fill="#fff" opacity="0.5"/>

    <circle cx="256" cy="126" r="9" fill="none" stroke="url(#btcOrange)" stroke-width="0.6" opacity="0.35"/>
    <text x="256" y="130" font-family="Arial" font-size="10" font-weight="bold" fill="url(#btcOrange)" text-anchor="middle" opacity="0.5">&#x20BF;</text>

    <rect x="200" y="238" width="112" height="26" rx="4" fill="#050e1a" stroke="#2a5a4a" stroke-width="0.6"/>
    <line x1="212" y1="244" x2="212" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="224" y1="244" x2="224" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="236" y1="244" x2="236" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="248" y1="244" x2="248" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="260" y1="244" x2="260" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="272" y1="244" x2="272" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="284" y1="244" x2="284" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="296" y1="244" x2="296" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>
    <line x1="308" y1="244" x2="308" y2="258" stroke="#00e676" stroke-width="0.4" opacity="0.1"/>

    <path d="M210 272 Q230 264 250 272 T290 272 T310 268" fill="none" stroke="url(#neonGreen)" stroke-width="0.4" opacity="0.1"/>

    <g opacity="0.06">
      <rect x="80" y="155" width="50" height="1.5" fill="#00e676"/>
      <rect x="85" y="167" width="45" height="1" fill="#00e676"/>
      <rect x="75" y="179" width="55" height="1.5" fill="#00e676"/>
      <rect x="82" y="191" width="48" height="1" fill="#00e676"/>
      <rect x="78" y="203" width="52" height="1.5" fill="#00e676"/>
      <rect x="90" y="215" width="40" height="1" fill="#00e676"/>
      <rect x="382" y="155" width="50" height="1.5" fill="#00e676"/>
      <rect x="382" y="167" width="45" height="1" fill="#00e676"/>
      <rect x="382" y="179" width="55" height="1.5" fill="#00e676"/>
      <rect x="382" y="191" width="48" height="1" fill="#00e676"/>
      <rect x="382" y="203" width="52" height="1.5" fill="#00e676"/>
      <rect x="382" y="215" width="40" height="1" fill="#00e676"/>
    </g>

    <text x="256" y="388" font-family="Arial Black, Arial, sans-serif" font-size="35" font-weight="900" fill="url(#neonGreen)" text-anchor="middle" letter-spacing="3" filter="url(#glow)">BTC</text>
    <text x="256" y="412" font-family="Arial, sans-serif" font-size="12" font-weight="400" fill="#667788" text-anchor="middle" letter-spacing="5">WEATHER</text>
    <text x="256" y="435" font-family="Arial, sans-serif" font-size="8" font-weight="400" fill="#445566" text-anchor="middle" letter-spacing="2">TRADER BOT</text>
  </g>
</svg>`;

fs.writeFileSync('/tmp/logo3.svg', svg);

sharp('/tmp/logo3.svg')
  .resize(512, 512)
  .png()
  .toFile('/tmp/logo3.png')
  .then(() => {
    const boundary = '----Bound' + Math.random().toString(36).slice(2);
    const img = fs.readFileSync('/tmp/logo3.png');
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n' + CHAT_ID + '\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="photo"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n'),
      img,
      Buffer.from('\r\n--' + boundary + '--\r\n')
    ]);
    const opts = {
      hostname: 'api.telegram.org', port: 443,
      path: '/bot' + TOKEN + '/sendPhoto', method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        console.log('Photo:', d);
        const cap = JSON.stringify({ chat_id: CHAT_ID, text: 'Logo v3 - Futuristic Trader Bot AI\n\nUse no @BotFather:\n/mybots -> @btcweatherpanel_bot -> Bot Settings -> Edit Bot Profile Photo', parse_mode: 'HTML' });
        const cr = https.request({ hostname: 'api.telegram.org', port: 443, path: '/bot' + TOKEN + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cap) } }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => console.log('Caption:', d)); });
        cr.on('error', e => console.error(e)); cr.write(cap); cr.end();
      });
    });
    req.on('error', e => console.error(e)); req.write(body); req.end();
  })
  .catch(e => console.error('Sharp:', e));
