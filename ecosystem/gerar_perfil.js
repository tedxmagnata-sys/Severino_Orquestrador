/**
 * 🖼️ Gerar foto de perfil do canal Telegram (640x640 quadrado)
 * Identidade BTC Weather: disco BTC com clima (sol/raio/nuvem) + gradiente dark
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 640, H = 640, CX = 320, CY = 320;

const CORES = {
  bg1: '#0c0e18',
  bg2: '#08090f',
  sunny: '#ffb703',
  cloudy: '#00f0ff',
  stormy: '#ff3366'
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.9">
      <stop offset="0%" stop-color="${CORES.bg1}"/>
      <stop offset="100%" stop-color="${CORES.bg2}"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="rgba(255,183,3,0.18)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <linearGradient id="coinGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${CORES.sunny}"/>
      <stop offset="100%" stop-color="#ff8f00"/>
    </linearGradient>
    <filter id="glowCoin" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowCloud" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- fundo -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${CX}" cy="${CY}" r="300" fill="url(#halo)"/>

  <!-- anel externo tipo dashboards -->
  <circle cx="${CX}" cy="${CY}" r="272" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
  <circle cx="${CX}" cy="${CY}" r="252" fill="none" stroke="rgba(255,183,3,0.35)" stroke-width="2" stroke-dasharray="6 14"/>

  <!-- nuvem pequena (clima) atrás -->
  <g transform="translate(258,268)" filter="url(#glowCloud)">
    <path d="M 0 46 a 20 20 0 0 1 0 -40 a 26 26 0 0 1 50 -6 a 22 22 0 0 1 0 46 z"
          fill="${CORES.cloudy}" opacity="0.9"/>
  </g>
  <!-- raio (tempestade) pequeno -->
  <g transform="translate(368,398)" filter="url(#glowCloud)">
    <path d="M 4 -34 L -16 8 L 0 8 L -8 34 L 16 -6 L 2 -6 L 14 -34 z" fill="${CORES.stormy}" opacity="0.95"/>
  </g>
  <!-- sol pequeno -->
  <g transform="translate(418,262)" filter="url(#glowCloud)">
    <circle r="22" fill="${CORES.sunny}" opacity="0.95"/>
    <g stroke="${CORES.sunny}" stroke-width="4" stroke-linecap="round" opacity="0.95">
      <line x1="0" y1="-32" x2="0" y2="-38"/>
      <line x1="0" y1="32" x2="0" y2="38"/>
      <line x1="-32" y1="0" x2="-38" y2="0"/>
      <line x1="32" y1="0" x2="38" y2="0"/>
      <line x1="-23" y1="-23" x2="-27" y2="-27"/>
      <line x1="23" y1="23" x2="27" y2="27"/>
      <line x1="23" y1="-23" x2="27" y2="-27"/>
      <line x1="-23" y1="23" x2="-27" y2="27"/>
    </g>
  </g>

  <!-- moeda BTC central -->
  <g filter="url(#glowCoin)">
    <circle cx="${CX}" cy="${CY}" r="132" fill="url(#coinGrad)"/>
    <circle cx="${CX}" cy="${CY}" r="132" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
  </g>
  <text x="${CX}" y="${CY + 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="150" font-weight="800" fill="#ffffff">₿</text>

  <!-- nome embaixo -->
  <text x="${CX}" y="570" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="800" fill="#f1f3f9" letter-spacing="4">BTC WEATHER</text>
  <text x="${CX}" y="612" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="500" fill="${CORES.cloudy}" letter-spacing="6">CLIMA DO MERCADO</text>
</svg>`;

(async () => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const out = path.join(__dirname, 'data', 'canal_perfil.png');
  fs.writeFileSync(out, png);
  console.log('PERFIL_GERADO', Math.round(png.length / 1024), 'KB ->', out);
})();
