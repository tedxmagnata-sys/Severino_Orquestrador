const fs = require('fs');
const sharp = require('sharp');

const DATA = JSON.parse(fs.readFileSync('/root/severino/ecosystem/data/clima_card.json', 'utf8'));

function brl(v) { return 'US$ ' + Number(v).toLocaleString('en-US'); }

const principal = DATA.periodos['1D'] || {};
const preco = DATA.precoBTC || principal.preco || 0;
const fng = DATA.medoGanancia || {};
const rsi = principal.rsi ?? 50;

// Cores e estados reais do painel BTC Weather
// direction: up -> sunny (#ffb703), down -> stormy (#ff3366), lateral -> cloudy (#00f0ff)
function mapearClima(clima, forca) {
  const c = (clima || '').toUpperCase();
  if (c.includes('SOBRECOMPRA')) return { cor: '#ff3366', classe: 'card-bearish', status: 'Tempestade', dir: 'down', label: 'SOBRECOMPRA' };
  if (c.includes('SOBREVENDA')) return { cor: '#ffb703', classe: 'card-bullish', status: 'Oportunidade', dir: 'up', label: 'SOBREVENDA' };
  if (c.includes('ALTA')) return { cor: '#ffb703', classe: 'card-bullish', status: 'Ensolarado', dir: 'up', label: 'ALTA' };
  if (c.includes('BAIXA')) return { cor: '#ff3366', classe: 'card-bearish', status: 'Chuva Ácida', dir: 'down', label: 'BAIXA' };
  return { cor: '#00f0ff', classe: 'card-neutral', status: 'Parcialmente Nublado', dir: 'lat', label: 'NEUTRO' };
}

// Icones Lucide do painel (paths reais dos icons)
const ICONES = {
  'sun': 'M12 3v4m0 10v4m9-9h-4M7 12H3m15.36 6.36-2.83-2.83M8.47 8.47 5.64 5.64m12.72 0-2.83 2.83M8.47 15.53l-2.83 2.83M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  'cloud-sun': 'M13 13a4 4 0 0 0-7.2-2.6M7.5 17.5a4 4 0 0 0 .8 7.5H18a4 4 0 0 0 .6-8M12 2v3m6.36 6.36 2.12-2.12M16 5.5h3M17 3l-1 2',
  'cloud-lightning': 'M6 16.33A5.5 5.5 0 0 1 7.5 6a6 6 0 0 1 11 2.5A4.5 4.5 0 0 1 18 16.33M13 11l-3 5h4l-3 5',
  'cloud-rain': 'M4 14.9A4.8 4.8 0 0 1 5.6 5.4a6 6 0 0 1 11.5 1.7 4 4 0 0 1 .9 7.8M8 19l-1 3m5-3-1 3m5-3-1 3',
  'wind': 'M12.8 19.6A2 2 0 1 0 14 16H2m15.4-2.6a2 2 0 1 0-3.5-1.9M14 5.5a2 2 0 1 1 3 1.7M2 8h9a3 3 0 1 0-3-3',
  'flame': 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
};
const ICON_TIMEFRAME = {
  '15M': 'cloud-rain', '1H': 'wind', '4H': 'sun', '1D': 'sun', '3D': 'flame', '1W': 'cloud-sun', '1M': 'cloud-lightning'
};

const BG = '#08090f';
const BG_CARD = 'rgba(18,20,32,0.55)';
const TXT = '#f1f3f9';
const TXT2 = '#8f92a3';
const PREMIUM = '#2979ff';

const W = 1080, H = 1350;
const ORD = ['15M', '1H', '4H', '1D', '3D', '1W', '1M'];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function polar(cx, cy, r, angDeg) {
  const rad = (angDeg - 135) * Math.PI / 180;
  return [(cx + r * Math.cos(rad)).toFixed(1), (cy + r * Math.sin(rad)).toFixed(1)];
}
function arcPath(cx, cy, r, pct) {
  const [x0, y0] = polar(cx, cy, r, 0);
  const [x1, y1] = polar(cx, cy, r, 270 * pct);
  const large = pct > 0.5 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

function lucideIcon(name, color, size, cx, cy) {
  const d = ICONES[name] || ICONES['cloud-sun'];
  const s = size / 24;
  return `<g transform="translate(${cx},${cy}) scale(${s}) translate(-12,-12)"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

function svgCard() {
  const sel = mapearClima(principal.clima, principal.forca);
  const cols = ORD.map((k, i) => {
    const p = DATA.periodos[k] || {};
    const m = mapearClima(p.clima, p.forca);
    const active = k === '1D';
    const x = 70 + i * 135;
    const w = 122;
    const yTop = active ? 1010 : 1032;
    const h = active ? 208 : 178;
    const ico = ICON_TIMEFRAME[k] || 'cloud-sun';
    const icoSize = active ? 58 : 46;
    const icoY = active ? yTop + 118 : yTop + 108;
    return `
      <g>
        <rect x="${x}" y="${yTop}" width="${w}" height="${h}" rx="20" fill="${BG_CARD}" stroke="${active ? m.cor : 'rgba(255,255,255,0.08)'}" stroke-width="${active ? 3 : 1}"/>
        <text x="${x + w/2}" y="${yTop + 34}" text-anchor="middle" font-family="Inter" font-size="22" font-weight="700" fill="${TXT2}">${k}</text>
        ${lucideIcon(ico, m.cor, icoSize, x + w/2, icoY)}
        <text x="${x + w/2}" y="${yTop + h - 34}" text-anchor="middle" font-family="Inter" font-size="19" font-weight="800" fill="${m.cor}">${esc(p.clima || '--')}</text>
        <text x="${x + w/2}" y="${yTop + h - 8}" text-anchor="middle" font-family="Inter" font-size="15" font-weight="500" fill="${TXT2}">RSI ${p.rsi ?? '--'}</text>
      </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="#0c0e18"/>
        <stop offset="100%" stop-color="${BG}"/>
      </linearGradient>
      <radialGradient id="glowSun" cx="0.5" cy="0.35" r="0.55">
        <stop offset="0%" stop-color="rgba(255,183,3,0.12)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
      <linearGradient id="arc" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${sel.cor}" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="${sel.cor}"/>
      </linearGradient>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/></filter>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.5"/></filter>
      <filter id="glowTxt" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glowSun)"/>
    <circle cx="130" cy="1180" r="360" fill="${PREMIUM}" opacity="0.06" filter="url(#soft)"/>
    <circle cx="950" cy="140" r="300" fill="${sel.cor}" opacity="0.07" filter="url(#soft)"/>

    <!-- Topo -->
    <g>
      <text x="70" y="112" font-family="Inter" font-size="36" font-weight="800" fill="${TXT}">BTC <tspan fill="${PREMIUM}">Weather</tspan> Panel</text>
      <rect x="805" y="70" width="205" height="56" rx="28" fill="${BG_CARD}"/>
      <text x="907" y="107" text-anchor="middle" font-family="Inter" font-size="26" font-weight="700" fill="${TXT2}">${DATA.geradoEm.slice(0, 10).split('-').reverse().join('/')}</text>
    </g>

    <!-- Gauge central -->
    <circle cx="540" cy="460" r="290" fill="#000000" fill-opacity="0.3" filter="url(#soft)"/>
    <circle cx="540" cy="460" r="240" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="24"/>
    <path d="${arcPath(540, 460, 240, 1)}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="24" stroke-linecap="round"/>
    <path d="${arcPath(540, 460, 240, Math.max(0.03, Math.min(1, rsi / 100)))}" fill="none" stroke="url(#arc)" stroke-width="24" stroke-linecap="round" filter="url(#soft)"/>
    <path d="${arcPath(540, 460, 240, Math.max(0.03, Math.min(1, rsi / 100)))}" fill="none" stroke="${sel.cor}" stroke-width="24" stroke-linecap="round"/>

    <text x="215" y="468" font-family="Inter" font-size="22" font-weight="700" fill="${TXT2}">0</text>
    <text x="865" y="468" font-family="Inter" font-size="22" font-weight="700" fill="${TXT2}">100</text>
    <text x="540" y="185" text-anchor="middle" font-family="Inter" font-size="26" font-weight="700" fill="${TXT2}">RSI ${rsi}/100</text>

    <text x="540" y="470" text-anchor="middle" font-size="120" font-family="Inter">${sel.cor === '#ff3366' ? '⛈️' : sel.cor === '#ffb703' ? '☀️' : '🌤️'}</text>
    <text x="540" y="545" text-anchor="middle" font-family="Inter" font-size="40" font-weight="700" letter-spacing="3" fill="${TXT2}">CLIMA HOJE</text>
    <text x="540" y="630" text-anchor="middle" font-family="Inter" font-size="82" font-weight="900" fill="${sel.cor}" filter="url(#glowTxt)">${sel.label}</text>

    <!-- Preço -->
    <g filter="url(#shadow)">
      <rect x="320" y="685" width="440" height="92" rx="46" fill="${BG_CARD}"/>
      <text x="540" y="748" text-anchor="middle" font-family="Inter" font-size="58" font-weight="800" fill="${TXT}">${brl(preco)}</text>
    </g>

    <!-- Frase de impacto -->
    <text x="540" y="880" text-anchor="middle" font-family="Inter" font-size="38" font-weight="600" fill="${TXT}">“${esc(sel.status === 'Ensolarado' ? 'Tendência de alta no radar. Estação de cultivar.' : sel.status === 'Chuva Ácida' ? 'Clima de queda no radar. Estação de se proteger.' : sel.status === 'Oportunidade' ? 'Medo no mercado, oportunidade de plantar.' : 'Mercado lateral. Paciência também é estratégia.')}”</text>

    <!-- Grid períodos -->
    ${cols}

    <!-- Rodapé -->
    <line x1="70" y1="1260" x2="1010" y2="1260" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
    <text x="80" y="1302" font-family="Inter" font-size="25" font-weight="600" fill="${TXT2}">😱 Medo &amp; Ganância: ${fng.value}/100 · ${esc(fng.classification)}</text>
    <g filter="url(#shadow)">
      <rect x="700" y="1272" width="290" height="76" rx="38" fill="${PREMIUM}"/>
      <text x="845" y="1322" text-anchor="middle" font-family="Inter" font-size="29" font-weight="800" fill="#ffffff">7 DIAS GRÁTIS</text>
    </g>
  </svg>`;
}

(async () => {
  const svg = svgCard();
  fs.writeFileSync('/root/severino/ecosystem/data/card_today.svg', svg);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync('/root/severino/ecosystem/data/card_today.png', png);
  console.log('CARD_GERADO', Math.round(png.length / 1024), 'KB');
})();
