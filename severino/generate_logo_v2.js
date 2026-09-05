const sharp = require('sharp');
const https = require('https');
const fs = require('fs');

const PNG_PATH = '/tmp/logo_v2.png';
const TOKEN = '8843645093:AAG-g6ZpqOjmvuPradtTPj4_u22CuhKc5tw';
const CHAT_ID = '1088548125';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#132a3a"/>
      <stop offset="100%" stop-color="#0a1628"/>
    </radialGradient>
    <linearGradient id="glowGreen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00e676"/>
      <stop offset="100%" stop-color="#009624"/>
    </linearGradient>
    <linearGradient id="glowOrange" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f7931a"/>
      <stop offset="100%" stop-color="#e67e22"/>
    </linearGradient>
    <linearGradient id="face" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#1a3a4a"/>
      <stop offset="100%" stop-color="#0d1b2a"/>
    </linearGradient>
    <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <clipPath id="circle">
      <circle cx="256" cy="256" r="240"/>
    </clipPath>
  </defs>

  <!-- Background circle -->
  <circle cx="256" cy="256" r="240" fill="url(#bg)"/>
  
  <!-- Outer tech ring -->
  <circle cx="256" cy="256" r="235" fill="none" stroke="#00e676" stroke-width="1.5" opacity="0.15" stroke-dasharray="8 6"/>
  <circle cx="256" cy="256" r="225" fill="none" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.1"/>
  
  <!-- Tech arc top -->
  <path d="M 76 140 A 200 200 0 0 1 436 140" fill="none" stroke="url(#glowGreen)" stroke-width="1" opacity="0.12" stroke-dasharray="4 8"/>

  <!-- Robot face - main shape -->
  <g clip-path="url(#circle)">
    <!-- Head outline -->
    <rect x="156" y="96" width="200" height="240" rx="40" fill="url(#face)" stroke="url(#glowGreen)" stroke-width="1.5" opacity="0.9"/>
    
    <!-- Forehead panel -->
    <rect x="181" y="116" width="150" height="30" rx="6" fill="none" stroke="#00e676" stroke-width="0.8" opacity="0.2"/>
    
    <!-- Eyes - futuristic hexagonal -->
    <polygon points="196,180 216,168 236,180 236,200 216,212 196,200" fill="none" stroke="url(#glowGreen)" stroke-width="2.5" filter="url(#neon)"/>
    <polygon points="276,180 296,168 316,180 316,200 296,212 276,200" fill="none" stroke="url(#glowGreen)" stroke-width="2.5" filter="url(#neon)"/>
    
    <!-- Eye pupils -->
    <circle cx="216" cy="190" r="4" fill="#00e676" opacity="0.8"/>
    <circle cx="296" cy="190" r="4" fill="#00e676" opacity="0.8"/>
    
    <!-- Eye scanner lines -->
    <line x1="186" y1="178" x2="176" y2="170" stroke="#00e676" stroke-width="0.5" opacity="0.3"/>
    <line x1="246" y1="178" x2="256" y2="170" stroke="#00e676" stroke-width="0.5" opacity="0.3"/>
    <line x1="266" y1="178" x2="276" y2="170" stroke="#00e676" stroke-width="0.5" opacity="0.3"/>
    <line x1="326" y1="178" x2="336" y2="170" stroke="#00e676" stroke-width="0.5" opacity="0.3"/>

    <!-- Mouth / ventilator grill -->
    <rect x="206" y="250" width="100" height="36" rx="8" fill="none" stroke="url(#glowGreen)" stroke-width="1.2" opacity="0.4"/>
    <line x1="222" y1="258" x2="222" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>
    <line x1="234" y1="258" x2="234" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>
    <line x1="246" y1="258" x2="246" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>
    <line x1="258" y1="258" x2="258" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>
    <line x1="270" y1="258" x2="270" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>
    <line x1="282" y1="258" x2="282" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>
    <line x1="294" y1="258" x2="294" y2="278" stroke="#00e676" stroke-width="0.8" opacity="0.3"/>

    <!-- Ear panels -->
    <rect x="148" y="175" width="14" height="50" rx="4" fill="none" stroke="#00e676" stroke-width="1" opacity="0.25"/>
    <rect x="350" y="175" width="14" height="50" rx="4" fill="none" stroke="#00e676" stroke-width="1" opacity="0.25"/>

    <!-- BTC mini symbol on forehead -->
    <text x="256" y="137" font-family="Arial" font-size="18" font-weight="bold" fill="url(#glowOrange)" text-anchor="middle" opacity="0.5">&#x20BF;</text>

    <!-- Data stream lines (left side) -->
    <line x1="80" y1="160" x2="130" y2="160" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.15"/>
    <line x1="90" y1="170" x2="130" y2="170" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.1"/>
    <line x1="70" y1="180" x2="130" y2="180" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.08"/>
    <!-- Data stream lines (right side) -->
    <line x1="382" y1="160" x2="432" y2="160" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.15"/>
    <line x1="382" y1="170" x2="422" y2="170" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.1"/>
    <line x1="382" y1="180" x2="442" y2="180" stroke="url(#glowGreen)" stroke-width="0.5" opacity="0.08"/>

    <!-- Bottom data waves -->
    <path d="M 100 320 Q 150 310 200 320 T 300 320 T 412 320" fill="none" stroke="#00e676" stroke-width="0.6" opacity="0.08"/>
    <path d="M 110 330 Q 160 325 210 333 T 310 328 T 402 333" fill="none" stroke="#00e676" stroke-width="0.4" opacity="0.05"/>
  </g>

  <!-- Bottom label -->
  <rect x="156" y="362" width="200" height="36" rx="6" fill="#0d1b2a" stroke="#00e676" stroke-width="1" opacity="0.5"/>
  
  <text x="256" y="375" font-family="Arial Black, Arial, sans-serif" font-size="17" font-weight="900" 
        fill="url(#glowGreen)" text-anchor="middle" letter-spacing="2.5" filter="url(#neon)">BTC</text>

  <text x="256" y="397" font-family="Arial, sans-serif" font-size="10" font-weight="400" 
        fill="#667788" text-anchor="middle" letter-spacing="4">WEATHER</text>

  <!-- Small decorative dots -->
  <circle cx="115" cy="400" r="1.5" fill="#00e676" opacity="0.2"/>
  <circle cx="397" cy="400" r="1.5" fill="#00e676" opacity="0.2"/>
  <circle cx="256" cy="445" r="1.5" fill="#f7931a" opacity="0.15"/>
  
  <!-- Corner tech brackets -->
  <path d="M 72 72 L 72 92 M 72 72 L 92 72" fill="none" stroke="#00e676" stroke-width="1" opacity="0.15"/>
  <path d="M 440 72 L 440 92 M 440 72 L 420 72" fill="none" stroke="#00e676" stroke-width="1" opacity="0.15"/>
  <path d="M 72 440 L 72 420 M 72 440 L 92 440" fill="none" stroke="#00e676" stroke-width="1" opacity="0.15"/>
  <path d="M 440 440 L 440 420 M 440 440 L 420 440" fill="none" stroke="#00e676" stroke-width="1" opacity="0.15"/>
</svg>`;

fs.writeFileSync('/tmp/logo_v2.svg', svg);

sharp('/tmp/logo_v2.svg')
  .resize(512, 512)
  .png()
  .toFile(PNG_PATH)
  .then(() => {
    const boundary = '----Boundary' + Math.random().toString(36).slice(2);
    const img = fs.readFileSync(PNG_PATH);
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n' + CHAT_ID + '\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="photo"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n'),
      img,
      Buffer.from('\r\n--' + boundary + '--\r\n')
    ]);
    const opts = {
      hostname: 'api.telegram.org', port: 443,
      path: '/bot' + TOKEN + '/sendPhoto',
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        console.log('SendPhoto:', d);
        const caption = JSON.stringify({
          chat_id: CHAT_ID,
          text: 'Logo v2 — Futuristic Trader Bot\n\nUse @BotFather para setar como foto:\n/mybots → @btcweatherpanel_bot → Bot Settings → Edit Bot Profile Photo',
          parse_mode: 'HTML'
        });
        const cr = https.request({ hostname: 'api.telegram.org', port: 443, path: '/bot' + TOKEN + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(caption) } }, r => {
          let cd = ''; r.on('data', c => cd += c);
          r.on('end', () => console.log('Caption:', cd));
        });
        cr.on('error', e => console.error(e));
        cr.write(caption); cr.end();
      });
    });
    req.on('error', e => console.error(e));
    req.write(body); req.end();
  })
  .catch(e => console.error('Sharp:', e));
