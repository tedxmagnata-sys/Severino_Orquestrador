#!/usr/bin/env node
/**
 * 📣 Gerador de Post para Redes Sociais (X + Instagram) — BTC Weather Panel
 *
 * Lê o clima do mercado (clima_card.json) e gera:
 *   - caption para X (texto curto + hashtags)
 *   - caption para Instagram (texto com emojis + hashtags)
 *   - aponta para o card do dia (data/card_today.png) pronto para publicar
 *
 * Saída: data/posts_redes.json (consumido pelo Postiz ou por publicação manual)
 *
 * Uso: node gerar_post_redes.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
const CLIMA_JSON = path.join(DATA_DIR, 'clima_card.json');
const OUT_JSON = path.join(DATA_DIR, 'posts_redes.json');
const CARD_PNG = path.join(DATA_DIR, 'card_today.png');

function exec(cmd) {
  execSync(cmd, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
}

function formatarPreco(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function resumoClima(clima) {
  const p1d = (clima.periodos && clima.periodos['1D']) || {};
  const p4h = (clima.periodos && clima.periodos['4H']) || {};
  const p15 = (clima.periodos && clima.periodos['15M']) || {};
  const fng = clima.medoGanancia || {};
  return {
    preco: formatarPreco(clima.precoBTC),
    fng: `${fng.value || '--'}/100 (${fng.classification || '--'})`,
    m15: `${p15.emoji || ''} ${p15.clima || '--'} (RSI ${p15.rsi ?? '--'})`,
    h1: `${p1d.emoji || ''} ${p1d.clima || '--'} (RSI ${p1d.rsi ?? '--'})`,
    h4: `${p4h.emoji || ''} ${p4h.clima || '--'} (RSI ${p4h.rsi ?? '--'})`
  };
}

(async () => {
  if (!fs.existsSync(CLIMA_JSON)) {
    console.log('[redes] gerando clima...');
    try { exec('node clima_card.js'); } catch (e) { console.log('clima falhou:', e.message); }
  }
  const clima = JSON.parse(fs.readFileSync(CLIMA_JSON, 'utf8'));
  const r = resumoClima(clima);
  const data = new Date().toLocaleDateString('pt-BR');

  const cardX = `🌦️ CLIMA DO BTC — ${data}

💰 BTC: $${r.preco}
😱 Medo & Ganância: ${r.fng}

📊 Hoje:
• 15M: ${r.m15}
• 1H: ${r.h1}
• 4H: ${r.h4}

🎯 Em que estação o mercado está? Plantar, cultivar ou colher?

📘 E-book grátis + teste 7 dias → link na bio 👆

#Bitcoin #BTC #Cripto #Trading #FearAndGreed`;

  const cardIG = `🌦️ *CLIMA DO BTC* — ${data}

💰 Preço: $${r.preco}
😱 Medo & Ganância: ${r.fng}

🌡️ RSI por período:
• 15M → ${r.m15}
• 1H → ${r.h1}
• 4H → ${r.h4}

🌱 Todo fruto tem estação. O Bitcoin também.
Descubra se o momento é de *plantar* (acumular no medo), *cultivar* (segurar) ou *colher* (realizar).

📘 E-book grátis: https://btcweatherpanel.com/ebook
🎁 Teste 7 dias sem cartão: https://btcweatherpanel.com/oferta

#bitcoin #btc #cripto #trading #investimento #fearandgreed #cryptocurrency #bitcoinbrasil`;

  const post = {
    geradoEm: new Date().toISOString(),
    data,
    precoBTC: r.preco,
    medoGanancia: r.fng,
    cardPNG: CARD_PNG,
    x: { texto: cardX, rede: 'x', hashtags: ['#Bitcoin', '#BTC', '#Trading'] },
    instagram: { texto: cardIG, rede: 'instagram', hashtags: ['#bitcoin', '#btc', '#cripto'] }
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(post, null, 2));
  console.log('[redes] post gerado ->', OUT_JSON);
  console.log('--- X ---\n' + cardX + '\n--- IG ---\n' + cardIG);
})();
