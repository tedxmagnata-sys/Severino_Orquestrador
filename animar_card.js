/**
 * 🎬 Animar Card Diário — "Clima do BTC" (VIDEO, 100% gratuito via ffmpeg)
 *
 * Camadas (parallax cinematográfico):
 *   1. Fundo IA (card_bg.png)  -> zoom lento + pan direcional (câmera)
 *   2. Estrelas distantes       -> veloc. lenta, pequenas, tênues
 *   3. Estrelas médias          -> veloc. média, brilho moderado
 *   4. Estrelas próximas        -> veloc. rápida, maiores, levemente blur
 *   5. Overlay de dados         -> texto na FRENTE (estrelas ATRÁS)
 *   + vinheta, fade in/out, boost de saturação
 *
 * Técnica de loop: cada campo de estrelas é gerado com altura 2H (wrap
 * vertical perfeito). O crop desliza em função do frame `n` — movimento
 * infinito e contínuo, sem costura.
 *
 * Saída: data/card_today.mp4 (7s, 30fps)
 *
 * Uso: node animar_card.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
const BG = path.join(DATA_DIR, 'card_bg.png');
const OVERLAY = path.join(DATA_DIR, 'overlay_today.png');
const CARD = path.join(DATA_DIR, 'card_today.png');
const OUT = path.join(DATA_DIR, 'card_today.mp4');
const WORK_DIR = path.join(DATA_DIR, '_anim');

const W = 1080, H = 1350;
const FPS = 30;
const DURACAO = 7;

function exec(cmd) {
  execSync(cmd, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Gera campos de estrelas com sharp (RGBA). altura 2H com wrap vertical perfeito.
async function gerarEstrelas() {
  const sharp = require('sharp');
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const camadas = [
    { nome: 'longe', N: 560, tam: 1.0, alpha0: 70, alpha1: 150, blur: 0.4, limiteBorda: 6, cor: [205, 215, 235], v: 14 },
    { nome: 'media', N: 260, tam: 1.8, alpha0: 110, alpha1: 220, blur: 0.7, limiteBorda: 10, cor: [225, 232, 248], v: 38 },
    { nome: 'perto', N: 95, tam: 3.0, alpha0: 150, alpha1: 255, blur: 1.4, limiteBorda: 14, cor: [245, 250, 255], v: 85 }
  ];
  for (const c of camadas) {
    const raw = Buffer.alloc(W * H * 2 * 4); // RGBA 1080x2700
    for (let i = 0; i < c.N; i++) {
      const x = Math.floor(c.limiteBorda + Math.random() * (W - 2 * c.limiteBorda));
      const y = Math.floor(c.limiteBorda + Math.random() * (H * 2 - 2 * c.limiteBorda));
      const b = 0.5 + Math.random() * 0.5; // brilho
      const r = Math.floor(c.cor[0] + Math.random() * 20);
      const g = Math.floor(c.cor[1] + Math.random() * 15);
      const bl = Math.floor(c.cor[2]);
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
          raw[idx] = r; raw[idx + 1] = g; raw[idx + 2] = bl;
          if (brilhoPx > raw[idx + 3]) raw[idx + 3] = brilhoPx;
        }
      }
    }
    await sharp(raw, { raw: { width: W, height: H * 2, channels: 4 } })
      .blur(c.blur)
      .png()
      .toFile(path.join(WORK_DIR, 'stars_' + c.nome + '.png'));
  }
  console.log('[animar_card] 3 campos de estrelas (2H, wrap) OK');
}

// Prepara o fundo 1080x1350 (cover)
async function prepararFundo() {
  const sharp = require('sharp');
  const src = fs.existsSync(BG) ? BG : CARD;
  await sharp(src)
    .resize(W, H, { fit: 'cover' })
    .png()
    .toFile(path.join(WORK_DIR, 'bg_ready.png'));
}

async function main() {
  console.log('[animar_card] iniciando...');
  const temOverlay = fs.existsSync(OVERLAY);
  if (!fs.existsSync(BG) && !fs.existsSync(CARD)) {
    console.log('[animar_card] sem fundo — pulando animação');
    process.exit(0);
  }

  await gerarEstrelas();
  await prepararFundo();

  const v = { longe: 14, media: 38, perto: 85 };

  // Cada campo é 1080x2700; crop desliza 1350px em loop (px/frame = v/FPS)
  function camada(idx, vpx) {
    return (
      `[${idx}:v]format=rgba,crop=w=${W}:h=${H}:x=0:y='${H}-mod(n*(${vpx}/${FPS}),${H})'[C${idx}]`
    );
  }

  const filtros = [
    // 0 fundo zoom (drift vertical lento + oscilação sutil de câmera)
    `[0:v]zoompan=z='1+0.0008*in':x='iw/2-(iw/zoom)/2+10*sin(in*0.05)':y='ih/2-(ih/zoom)/2-0.15*in':d=${FPS * DURACAO}:s=${W}x${H}:fps=${FPS}[bgz]`,
    camada(1, v.longe),
    camada(2, v.media),
    camada(3, v.perto),
    // compõe camadas (fundo -> estrelas, blend screen para só brilhar sobre o céu)
    `[bgz][C1]blend=all_mode=screen:all_opacity=0.45[L1]`,
    `[L1][C2]blend=all_mode=screen:all_opacity=0.6[L2]`,
    `[L2][C3]blend=all_mode=screen:all_opacity=0.7[L3]`,
    // vinheta + saturação + fade in/out cinematográfico
    `[L3]vignette=PI/5,eq=saturation=1.12,format=yuv420p[fade0]`,
    `[fade0]fade=t=in:st=0:d=0.5,fade=t=out:st=${DURACAO - 0.6}:d=0.6[cinv]`
  ];

  if (temOverlay) {
    filtros.push(`[4:v]format=rgba[ovd]; [cinv][ovd]overlay=0:0[outv]`);
  } else {
    filtros.push(`[cinv]null[outv]`);
  }

  const F = filtros.join('; ');

  const inputs =
    `-i "${path.join(WORK_DIR, 'bg_ready.png')}" ` +
    `-loop 1 -framerate ${FPS} -i "${path.join(WORK_DIR, 'stars_longe.png')}" ` +
    `-loop 1 -framerate ${FPS} -i "${path.join(WORK_DIR, 'stars_media.png')}" ` +
    `-loop 1 -framerate ${FPS} -i "${path.join(WORK_DIR, 'stars_perto.png')}"` +
    (temOverlay ? ` -loop 1 -framerate ${FPS} -i "${OVERLAY}"` : '');

  const cmd =
    `ffmpeg -y ${inputs} -filter_complex "${F}" -map "[outv]" ` +
    `-r ${FPS} -t ${DURACAO} -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart ${OUT}`;

  try {
    exec(cmd);
    const size = Math.round(fs.statSync(OUT).size / 1024);
    console.log('[animar_card] MP4 OK', size, 'KB ->', OUT);
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString();
    console.log('[animar_card] ffmpeg falhou:', msg.split('\n').filter(l => /error|invalid|No such|garbage|trailing|matches no|Cannot/i.test(l)).slice(0, 6).join('\n'));
    console.log('[animar_card] mantendo apenas o card PNG (fallback)');
    process.exit(0);
  }
}

main().catch((e) => {
  console.log('[animar_card] erro geral:', e.message);
  process.exit(0);
});