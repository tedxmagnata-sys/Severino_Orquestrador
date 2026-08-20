/**
 * 🎬 Animar Card Diário — "Clima do BTC" (VIDEO LOOP PERFEITO, 100% grátis)
 *
 * Conforme o CLIMA REAL do dia (clima_card.json):
 *   - céu procedimental (gradiente + glow + nebulosas) na paleta da estação
 *   - ENSOLARADO / ALTA  -> âmbar dourado  (#ffb703)
 *   - SOBREVENDA         -> dourado/orange (oportunidade)
 *   - SOBRECOMPRA        -> fogo magenta    (#ff3366)
 *   - BAIXA / CHUVA      -> vermelho escuro
 *   - NEUTRO             -> ciano futurista (#00f0ff)
 *
 * Loop infinito SEAMLESS (funciona para qualquer DURACAO):
 *   - zoom/pan cíclicos sin/cos (periodo = duracao) -> voltam ao inicio
 *   - estrelas com vF = k * (H/D) -> fecham a janela exata no último frame
 *
 * Ajustáveis via const CONFIG (ou env): DURACAO_S, ESTRELAS_X, AUDIO
 *
 * Saída: data/card_today.mp4 (1080x1350)  |  Uso: node animar_card.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATA_DIR = path.join(__dirname, 'data');
const BG = path.join(DATA_DIR, 'card_bg.png');
const OVERLAY = path.join(DATA_DIR, 'overlay_today.png');
const CARD = path.join(DATA_DIR, 'card_today.png');
const OUT = path.join(DATA_DIR, 'card_today.mp4');
const CLIMA_JSON = path.join(DATA_DIR, 'clima_card.json');
const WORK_DIR = path.join(DATA_DIR, '_anim');

const W = 1080, H = 1350;
const W2 = W * 2, H2 = H * 2;           // supersampling do fundo (2x)
const FPS = 30;

// ---------------- CONFIG (ajustável) ----------------
const CONFIG = {
  DURACAO_S: parseFloat(process.env.CARD_DURACAO_S || process.env.DURACAO_S || '9'),
  ESTRELAS_X: parseFloat(process.env.CARD_ESTRELAS_X || process.env.ESTRELAS_X || '1'), // 0.5 = metade, 2 = dobro
  AUDIO: (process.env.CARD_AUDIO || process.env.AUDIO || 'on') !== 'off'
};

function exec(cmd) {
  execSync(cmd, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
}

// ---------------- Clima real do dia -> paleta ----------------
function paletaDoClima() {
  let climaAtual = 'NEUTRO';
  try {
    const DATA = JSON.parse(fs.readFileSync(CLIMA_JSON, 'utf8'));
    const principal = (DATA.periodos || {})['1D'] || {};
    climaAtual = String(principal.clima || 'NEUTRO').toUpperCase();
  } catch (e) { console.log('[animar_card] sem clima_card.json, usando NEUTRO'); }

  if (climaAtual.includes('SOBRECOMPRA')) {
    return { nome: 'fogo', top: '#2b0a2e', mid: '#4a1020', base: '#0d040a', glow: '#ff3366', estrelas: [255, 80, 140] };
  }
  if (climaAtual.includes('SOBREVENDA') || climaAtual.includes('ALTA')) {
    return { nome: 'ensaolarado', top: '#1a1a3e', mid: '#3a2b12', base: '#0c0812', glow: '#ffb703', estrelas: [255, 200, 120] };
  }
  if (climaAtual.includes('BAIXA') || climaAtual.includes('CHUVA')) {
    return { nome: 'chuva', top: '#170d22', mid: '#34111c', base: '#080510', glow: '#ff3366', estrelas: [200, 90, 130] };
  }
  return { nome: 'neutro', top: '#062b3a', mid: '#0e1a2e', base: '#050a14', glow: '#00f0ff', estrelas: [140, 220, 255] };
}

// ---------------- Gera o CÉU procedimental (1080x2700, wrap, paleta do clima) ----------------
function gerarCeu(paleta) {
  const sharp = require('sharp');
  const img = Buffer.alloc(W * H * 3); // RGB 1080x1350
  const tR = [parseInt(paleta.top.slice(1, 3), 16), parseInt(paleta.top.slice(3, 5), 16), parseInt(paleta.top.slice(5, 7), 16)];
  const mR = [parseInt(paleta.mid.slice(1, 3), 16), parseInt(paleta.mid.slice(3, 5), 16), parseInt(paleta.mid.slice(5, 7), 16)];
  const bR = [parseInt(paleta.base.slice(1, 3), 16), parseInt(paleta.base.slice(3, 5), 16), parseInt(paleta.base.slice(5, 7), 16)];
  const gR = [parseInt(paleta.glow.slice(1, 3), 16), parseInt(paleta.glow.slice(3, 5), 16), parseInt(paleta.glow.slice(5, 7), 16)];

  // gradiente vertical topo -> meio -> base
  for (let y = 0; y < H; y++) {
    const f = y / H;
    let r, g, b;
    if (f < 0.45) { const k = f / 0.45; r = tR[0] + (mR[0] - tR[0]) * k; g = tR[1] + (mR[1] - tR[1]) * k; b = tR[2] + (mR[2] - tR[2]) * k; }
    else { const k = (f - 0.45) / 0.55; r = mR[0] + (bR[0] - mR[0]) * k; g = mR[1] + (bR[1] - mR[1]) * k; b = mR[2] + (bR[2] - mR[2]) * k; }
    // leve ruído atmosférico (+/- 3)
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 3;
      img[idx] = Math.max(0, Math.min(255, r + (Math.random() * 6 - 3)));
      img[idx + 1] = Math.max(0, Math.min(255, g + (Math.random() * 6 - 3)));
      img[idx + 2] = Math.max(0, Math.min(255, b + (Math.random() * 6 - 3)));
    }
  }

  // glow central (sol/aurora) soft
  const cx = W * 0.5, cy = H * 0.22, R = 260;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d < R) {
        const a = Math.pow(1 - d / R, 2) * 120;
        const idx = (y * W + x) * 3;
        img[idx] = Math.min(255, img[idx] + gR[0] * a / 255 * 1.2);
        img[idx + 1] = Math.min(255, img[idx + 1] + gR[1] * a / 255 * 1.2);
        img[idx + 2] = Math.min(255, img[idx + 2] + gR[2] * a / 255 * 1.2);
      }
    }
  }

  // nebulosas (circulos blurrados, cor do glow) espalhadas
  const nebulas = [
    [W * 0.15, H * 0.55, 140], [W * 0.82, H * 0.7, 180], [W * 0.35, H * 0.9, 120]
  ];
  for (const [nx, ny, nr] of nebulas) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.sqrt((x - nx) * (x - nx) + (y - ny) * (y - ny));
        if (d < nr) {
          const a = Math.pow(1 - d / nr, 2) * 55;
          const idx = (y * W + x) * 3;
          img[idx] = Math.min(255, img[idx] + gR[0] * a / 255 * 0.8);
          img[idx + 1] = Math.min(255, img[idx + 1] + gR[1] * a / 255 * 0.8);
          img[idx + 2] = Math.min(255, img[idx + 2] + gR[2] * a / 255 * 0.8);
        }
      }
    }
  }

  // duplica vertical (wrap p/ loop vertical do céu também, se quisermos mover)
  const raw2 = Buffer.alloc(W * H * 2 * 3);
  for (let y = 0; y < H * 2; y++) {
    const ySrc = y % H;
    raw2.copy(raw2, y * W * 3, 0, W * 3); // (preenchido no loop abaixo)
    img.copy(raw2, y * W * 3, ySrc * W * 3, ySrc * W * 3 + W * 3);
  }
  return sharp(raw2, { raw: { width: W, height: H * 2, channels: 3 } })
    .blur(0.6)
    .png()
    .toFile(path.join(WORK_DIR, 'ceu.png'));
}

// ---------------- Gera estrelas (densidade = ESTRELAS_X) ----------------
async function gerarEstrelas(px, estrelasX) {
  const sharp = require('sharp');
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const camadas = [
    { nome: 'longe', N: Math.round(700 * estrelasX), tam: 1.0, alpha0: 70, alpha1: 160, blur: 0.4, limiteBorda: 6, cor: px.estrelas.map(v => Math.min(255, v + 30)), k: 1 },
    { nome: 'media', N: Math.round(330 * estrelasX), tam: 1.8, alpha0: 115, alpha1: 230, blur: 0.7, limiteBorda: 10, cor: px.estrelas, k: 2 },
    { nome: 'perto', N: Math.round(120 * estrelasX), tam: 3.0, alpha0: 160, alpha1: 255, blur: 1.4, limiteBorda: 14, cor: px.estrelas.map(v => Math.min(255, v + 60)), k: 3 }
  ];
  for (const c of camadas) {
    const raw = Buffer.alloc(W * H * 2 * 4); // RGBA 1080x2700
    for (let i = 0; i < c.N; i++) {
      const x = Math.floor(c.limiteBorda + Math.random() * (W - 2 * c.limiteBorda));
      const y = Math.floor(c.limiteBorda + Math.random() * (H * 2 - 2 * c.limiteBorda));
      const b = 0.5 + Math.random() * 0.5;
      const a = Math.floor((c.alpha0 + Math.random() * (c.alpha1 - c.alpha0)) * b);
      const rPx = Math.max(1, Math.round(c.tam));
      for (let dy = -rPx; dy <= rPx; dy++) {
        for (let dx = -rPx; dx <= rPx; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= W) continue;
          const yw = ((yy % (H * 2)) + (H * 2)) % (H * 2);
          const dist = Math.sqrt(dx * dx + dy * dy) / rPx;
          if (dist > 1) continue;
          const idx = (yw * W + xx) * 4;
          const brilhoPx = Math.floor(a * (0.35 + 0.65 * Math.pow(1 - dist, 1.6)));
          raw[idx] = c.cor[0]; raw[idx + 1] = c.cor[1]; raw[idx + 2] = c.cor[2];
          if (brilhoPx > raw[idx + 3]) raw[idx + 3] = brilhoPx;
        }
      }
    }
    await sharp(raw, { raw: { width: W, height: H * 2, channels: 4 } })
      .blur(c.blur)
      .png()
      .toFile(path.join(WORK_DIR, 'stars_' + c.nome + '.png'));
  }
  console.log('[animar_card] estrelas OK (density x' + estrelasX + ')');
}

async function prepararFundo() {
  const sharp = require('sharp');
  const src = fs.existsSync(BG) ? BG : CARD;
  await sharp(src)
    .resize(W2, H2, { fit: 'cover' })
    .png()
    .toFile(path.join(WORK_DIR, 'bg_ready.png'));
}

async function main() {
  const DURACAO = CONFIG.DURACAO_S;
  const D = Math.round(FPS * DURACAO);
  const baseVF = H / D;                 // px/frame base -> deslocamento total fechado
  const temOverlay = fs.existsSync(OVERLAY);
  console.log('[animar_card] dur=' + DURACAO + 's frames=' + D + ' estrelasX=' + CONFIG.ESTRELAS_X + ' audio=' + CONFIG.AUDIO);

  if (!fs.existsSync(BG) && !fs.existsSync(CARD)) {
    console.log('[animar_card] sem fundo — pulando animação');
    process.exit(0);
  }

  const paleta = paletaDoClima();
  console.log('[animar_card] clima -> céu:', paleta.nome, paleta.glow);

  await fs.promises.mkdir(WORK_DIR, { recursive: true });
  await gerarCeu(paleta);
  await gerarEstrelas(paleta, CONFIG.ESTRELAS_X);
  await prepararFundo();

  // Movimento cíclico (1-cos) e sin fecham o loop exatamente no frame D
  const ciclo = `1-cos(2*PI*in/${D})`;
  const zoom = `1 + 0.13*(${ciclo})`;
  const panY = `(ih/zoom/2) - (ih/2) + 30*(${ciclo})`;
  const panX = `(iw/zoom/2) - (iw/2) + 12*sin(2*PI*in/${D})`;

  function camada(idx, vF) {
    return `[${idx}:v]format=rgba,crop=w=${W}:h=${H}:x=0:y='${H}-mod(n*${vF},${H})'[C${idx}]`;
  }

  // inputs: 0=bg, 1=longe, 2=media, 3=perto, 4=overlay, 5=ceu, 6=audio
  const F = [
    `[0:v]zoompan=z='${zoom}':x='${panX}':y='${panY}':d=${D}:s=${W}x${H}:fps=${FPS}[bgz]`,
    // céu procedimental do clima por cima do fundo (blend overlay dá o tom)
    `[5:v]scale=${W}:${H}[SKY]`,
    `[bgz][SKY]blend=all_mode=overlay:all_opacity=0.55[KT]`,
    camada(1, baseVF * 1),
    camada(2, baseVF * 2),
    camada(3, baseVF * 3),
    `[KT][C1]blend=all_mode=screen:all_opacity=0.45[L1]`,
    `[L1][C2]blend=all_mode=screen:all_opacity=0.6[L2]`,
    `[L2][C3]blend=all_mode=screen:all_opacity=0.7[L3]`,
    `[L3]vignette=PI/5,eq=saturation=1.12,format=yuv420p[op]`
  ];

  const audioIdx = temOverlay ? 6 : 5;
  if (temOverlay) {
    F.push(
      `[4:v]format=rgba[ovd]`,
      `[op][ovd]overlay=0:0[opv]`,
      `[opv]fade=t=in:st=0:d=0.35,fade=t=out:st=${DURACAO - 0.35}:d=0.35[outv]`
    );
  } else {
    F.push(`[op]fade=t=in:st=0:d=0.35,fade=t=out:st=${DURACAO - 0.35}:d=0.35[outv]`);
  }
  const FC = F.join('; ');

  let inputs =
    `-i "${path.join(WORK_DIR, 'bg_ready.png')}" ` +
    `-loop 1 -framerate ${FPS} -i "${path.join(WORK_DIR, 'stars_longe.png')}" ` +
    `-loop 1 -framerate ${FPS} -i "${path.join(WORK_DIR, 'stars_media.png')}" ` +
    `-loop 1 -framerate ${FPS} -i "${path.join(WORK_DIR, 'stars_perto.png')}"` +
    (temOverlay ? ` -loop 1 -framerate ${FPS} -i "${OVERLAY}"` : '') +
    ` -i "${path.join(WORK_DIR, 'ceu.png')}"`;

  // ---- Música ambiente sintética (drone espacial, lavfi, zero custo) ----
  let audioBip = '';
  let cmd;
  if (CONFIG.AUDIO) {
    // acorde cinematográfico: fundamental + 5a justa + oitava + batimento suave
    const baseF = paleta.nome === 'ensaolarado' ? 55 : 41.2;   // A1 ou E1
    const expr =
      `0.30*sin(2*PI*t*${baseF})+` +
      `0.22*sin(2*PI*t*(${baseF}*1.5))+` +
      `0.12*sin(2*PI*t*(${baseF}*2))+` +
      `0.08*sin(2*PI*t*(${baseF}*2.01))+` +   // batimento lento (espaço)
      `0.05*sin(2*PI*t*(${baseF}*0.5))`;
    inputs += ` -f lavfi -i "aevalsrc=${expr}|${expr}:s=44100:d=${DURACAO}"`;
    audioBip =
      `-af "aecho=0.7:0.4:120|240|480:0.25|0.15|0.08,afade=t=in:st=0:d=1.5,afade=t=out:st=${DURACAO - 1.5}:d=1.5,volume=0.35" ` +
      `-c:a aac -b:a 128k `;
    cmd =
      `ffmpeg -y ${inputs} -filter_complex "${FC}" -map "[outv]" -map "${audioIdx}:a" ` +
      `-r ${FPS} -t ${DURACAO} ${audioBip}-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart ${OUT}`;
  } else {
    cmd =
      `ffmpeg -y ${inputs} -filter_complex "${FC}" -map "[outv]" ` +
      `-r ${FPS} -t ${DURACAO} -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart ${OUT}`;
  }

  try {
    exec(cmd);
    const size = Math.round(fs.statSync(OUT).size / 1024);
    console.log('[animar_card] MP4 OK', size, 'KB ->', OUT);
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString();
    console.log('[animar_card] ffmpeg falhou:', msg.split('\n').filter(l => /error|invalid|No such|garbage|trailing|matches no|Cannot/i.test(l)).slice(0, 8).join('\n'));
    console.log('[animar_card] tentando SEM áudio...');
    try {
      exec(cmd.replace(/-f lavfi[^ ]*aevalsrc[^ |"]*[^\s]*/, ''));
    } catch (e2) {
      console.log('[animar_card] tambem falhou sem audio:', (e2.stderr || e2.message || '').toString().split('\n').filter(l => /error|invalid/i.test(l)).slice(0, 4).join('\n'));
      console.log('[animar_card] mantendo apenas o card PNG (fallback)');
      process.exit(0);
    }
  }
}

main().catch((e) => {
  console.log('[animar_card] erro geral:', e.message);
  process.exit(0);
});