/**
 * 📅 Postar Card Diário — "Clima do BTC" (Telegram)
 * 
 * Fluxo:
 *   1. Gera dados de clima reais (Binance + Fear&Greed) -> data/clima_card.json
 *   2. Gera o card PNG (1080x1350) com sharp -> data/card_today.png
 *   3. Envia para o canal Telegram com legenda + CTA trial 7 dias
 *
 * Uso: node postar_card.js [--test]
 *   --test  envia para o admin (TELEGRAM_CHAT_ID) em vez do canal
 * 
 * Config no .env:
 *   TELEGRAM_CANAL_ID  -> chat_id do canal público (ex: -100xxxx ou @canal)
 *   SEM_CANAL_ID       -> se não definido e não for --test, só gera o card
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const ADMIN = process.env.TELEGRAM_CHAT_ID || '';
const CANAL = process.env.TELEGRAM_CANAL_ID || '';
const DATA_DIR = path.join(__dirname, 'data');
const CARD_PNG = path.join(DATA_DIR, 'card_today.png');
const CLIMA_JSON = path.join(DATA_DIR, 'clima_card.json');
const TEST_MODE = process.argv.includes('--test');

function exec(cmd) {
  execSync(cmd, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
}

function formatarPreco(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function montarLegenda(clima) {
  const preco = formatarPreco(clima.precoBTC);
  const fng = clima.medoGanancia || {};
  const p1d = clima.periodos && clima.periodos['1D'] ? clima.periodos['1D'] : {};
  const p4h = clima.periodos && clima.periodos['4H'] ? clima.periodos['4H'] : {};

  const linha1 = `🌦️ <b>CLIMA DO BTC — HOJE</b>\n`;
  const linha2 = `💰 <b>BTC:</b> $${preco}\n`;
  const linha3 = `😱 <b>Medo & Ganância:</b> ${fng.value}/100 (${fng.classification || '--'})\n\n`;
  const linha4 = `📊 <b>Destaques:</b>\n`;
  const linha5 = `  • 1D: ${p1d.emoji || '•'} ${p1d.clima || '--'} — RSI ${p1d.rsi ?? '--'}\n`;
  const linha6 = `  • 4H: ${p4h.emoji || '•'} ${p4h.clima || '--'} — RSI ${p4h.rsi ?? '--'}\n\n`;
  const linha7 = `🆓 <b>TESTE GRÁTIS 7 DIAS:</b>\n🔗 https://btcweatherpanel.com/btc-weather-panel/\n\n`;
  const linha8 = `⚡ Painel completo: 7 períodos, RSI, suportes e resistências em tempo real.`;

  return [linha1, linha2, linha3, linha4, linha5, linha6, linha7, linha8].join('');
}

function sendPhoto(chatId, photoPath, caption) {
  return new Promise((resolve) => {
    if (!TOKEN || !chatId) return resolve(false);
    if (!fs.existsSync(photoPath)) return resolve(false);

    const boundary = '----card-' + Date.now();
    const CRLF = '\r\n';
    const fileData = fs.readFileSync(photoPath);
    const fileMime = 'image/png';
    const fileField = 'photo';
    const fileName = 'clima-btc.png';

    let payload = '';
    payload += `--${boundary}${CRLF}`;
    payload += `Content-Disposition: form-data; name="chat_id"${CRLF}${CRLF}${chatId}${CRLF}`;
    payload += `--${boundary}${CRLF}`;
    payload += `Content-Disposition: form-data; name="caption"${CRLF}${CRLF}${caption}${CRLF}`;
    payload += `--${boundary}${CRLF}`;
    payload += `Content-Disposition: form-data; name="parse_mode"${CRLF}${CRLF}HTML${CRLF}`;
    payload += `--${boundary}${CRLF}`;
    const replyMarkup = JSON.stringify({
      inline_keyboard: [[
        { text: '🎁 Teste Grátis 7 Dias', url: 'https://btcweatherpanel.com/oferta' }
      ]]
    });
    payload += `Content-Disposition: form-data; name="reply_markup"${CRLF}${CRLF}${replyMarkup}${CRLF}`;
    payload += `--${boundary}${CRLF}`;
    payload += `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"${CRLF}`;
    payload += `Content-Type: ${fileMime}${CRLF}${CRLF}`;

    const payloadBuffer = Buffer.from(payload, 'utf8');
    const endBuffer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
    const body = Buffer.concat([payloadBuffer, fileData, endBuffer]);

    const opts = {
      hostname: 'api.telegram.org',
      port: 443,
      path: '/bot' + TOKEN + '/sendPhoto',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let ok = false;
        try { ok = JSON.parse(d).ok === true; } catch {}
        if (!ok) console.log('[postar_card] resposta API:', d.slice(0, 300));
        resolve(ok);
      });
    });
    req.on('error', (e) => { console.log('[postar_card] erro:', e.message); resolve(false); });
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log('[postar_card] gerando dados de clima...');
  try { exec('node clima_card.js'); } catch (e) { console.log('[postar_card] clima_card falhou:', e.message); }

  console.log('[postar_card] gerando card PNG (híbrido Gemini Flash + sharp)...');
  try { exec('node gerar_card_ia.js'); } catch (e) { console.log('[postar_card] gerar_card_ia falhou:', e.message); }

  const clima = JSON.parse(fs.readFileSync(CLIMA_JSON, 'utf8'));
  const legenda = montarLegenda(clima);

  const alvo = TEST_MODE ? ADMIN : CANAL;
  if (!alvo) {
    console.log('[postar_card] nenhum destino definido (use --test ou defina TELEGRAM_CANAL_ID). Card gerado em ' + CARD_PNG);
    return;
  }
  const ok = await sendPhoto(alvo, CARD_PNG, legenda);
  console.log('[postar_card] enviado para', alvo, '->', ok ? 'OK' : 'FALHOU');
})();
