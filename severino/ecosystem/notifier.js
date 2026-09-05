/**
 * 📡 Notifier — BTC Weather Panel
 * 
 * Gera análise diária, monitora mudanças nos 7 cards de clima
 * (cooldown de 15 min por card) e sinais operacionais.
 * Todas as notificações também são espelhadas para o administrador.
 * 
 * Uso: node notifier.js [daily|climate|signal|both|climate-signal|test|test-cards]
 *   daily          — Envia análise diária (9h)
 *   climate        — Verifica mudanças nos cards (15M a 1M) e notifica
 *   signal         — Verifica sinais operacionais
 *   climate-signal — Cards + sinais (cron a cada minuto)
 *   both           — Faz tudo (default)
 *   test           — Envia análise diária de teste ao admin
 *   test-cards     — Envia amostra das novas mensagens de cards ao admin
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const notif = require('./notifications');

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const ADMIN_CHAT = process.env.TELEGRAM_CHAT_ID || '';

const LICENSES_PATH = path.join(__dirname, '..', 'data', 'licenses.json');
const CARD_ALERTS_PATH = path.join(__dirname, '..', 'data', 'card_alerts.json');
const CARD_COOLDOWN_MS = 15 * 60 * 1000; // não repetir o mesmo card por 15 minutos

function loadLicenses() {
  try { return JSON.parse(fs.readFileSync(LICENSES_PATH, 'utf8')); }
  catch { return {}; }
}

function isVip(licenseCode) {
  if (!licenseCode) return false;
  const licenses = loadLicenses();
  const lic = licenses[licenseCode];
  if (!lic || !lic.activatedAt || lic.activatedAt === 'null') return false;
  const daysSince = (Date.now() - new Date(lic.activatedAt).getTime()) / 86400000;
  return daysSince <= 7;
}

// ===== HELPERS =====

function fetch(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    }).on('error', reject);
  });
}

function sendTelegram(chatId, text) {
  if (!TOKEN || !chatId) return;
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
  const opts = { hostname: 'api.telegram.org', port: 443, path: '/bot' + TOKEN + '/sendMessage', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
  const req = https.request(opts);
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

function sendToAdmin(text) {
  if (ADMIN_CHAT) sendTelegram(ADMIN_CHAT, text);
}

function sendEmail(to, subject, text) {
  // Email sending via sendmail or API — for now, just log
  console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
  // Future: integrate SendGrid / SES / etc.
}

// ===== BTC DATA =====

async function getBTCPrice() {
  try {
    const d = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    return parseFloat(d.price);
  } catch { return 0; }
}

async function getFearGreed() {
  try {
    const d = await fetch('https://api.alternative.me/fng/?limit=1');
    if (d.data && d.data[0]) return { value: parseInt(d.data[0].value), classification: d.data[0].value_classification };
    return { value: 50, classification: 'Neutro' };
  } catch { return { value: 50, classification: 'Neutro' }; }
}

async function getKlines(symbol = 'BTCUSDT', interval = '1d', limit = 30) {
  try {
    const d = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    return d.map(k => ({ open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }));
  } catch { return []; }
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcSMA(closes, period) {
  if (closes.length < period) return closes.reduce((a, b) => a + b, 0) / closes.length;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function interpretClimate(rsi, emaShort, emaLong, price) {
  const bullish = emaShort > emaLong && rsi > 50;
  const bearish = emaShort < emaLong && rsi < 50;
  const overbought = rsi > 70;
  const oversold = rsi < 30;
  
  if (overbought) return { climate: '🔥 SOBRECOMPRA', signal: 'Venda parcial', strength: 'Forte' };
  if (oversold) return { climate: '💎 SOBREVENDA', signal: 'Compra oportunista', strength: 'Forte' };
  if (bullish) return { climate: '🚀 ALTA', signal: 'Compra', strength: rsi > 60 ? 'Moderada' : 'Fraca' };
  if (bearish) return { climate: '🌊 BAIXA', signal: 'Venda/Aguardar', strength: rsi < 40 ? 'Moderada' : 'Fraca' };
  return { climate: '🎯 NEUTRO', signal: 'Aguardar', strength: 'Neutra' };
}

async function getForecast() {
  const intervals = [
    { name: '15M', binance: '15m' },
    { name: '1H', binance: '1h' },
    { name: '4H', binance: '4h' },
    { name: '1D', binance: '1d' },
    { name: '3D', binance: '3d' },
    { name: '1W', binance: '1w' },
    { name: '1M', binance: '1M' },
  ];

  const results = {};
  for (const iv of intervals) {
    try {
      const klines = await getKlines('BTCUSDT', iv.binance, iv.binance === '1M' ? 30 : 50);
      if (klines.length < 20) continue;
      const closes = klines.map(k => k.close);
      const price = closes[closes.length - 1];
      const rsi = calcRSI(closes);
      const ema9 = calcEMA(closes, 9);
      const ema21 = calcEMA(closes, 21);
      const climate = interpretClimate(rsi, ema9, ema21, price);
      const sup = Math.min(...closes.slice(-5));
      const res = Math.max(...closes.slice(-5));
      results[iv.name] = { ...climate, price: Math.round(price * 100) / 100, support: Math.round(sup * 100) / 100, resistance: Math.round(res * 100) / 100, rsi };
    } catch {}
  }
  return results;
}

// ===== DAILY ANALYSIS =====

async function generateDailyAnalysis() {
  const price = await getBTCPrice();
  const fng = await getFearGreed();
  const dailyKlines = await getKlines('BTCUSDT', '1d', 30);
  const weeklyKlines = await getKlines('BTCUSDT', '1w', 20);
  const forecast = await getForecast();

  if (!price) return 'Indisponível no momento. Tente novamente mais tarde.';

  const dailyCloses = dailyKlines.map(k => k.close);
  const weeklyCloses = weeklyKlines.map(k => k.close);
  const rsiDiario = calcRSI(dailyCloses);
  const rsiSemanal = calcRSI(weeklyCloses, 14);
  const ema200 = calcSMA(dailyCloses, 200) || calcSMA(dailyCloses, dailyCloses.length);
  const priceAbove200 = price > ema200;
  const high24 = Math.max(...dailyCloses.slice(-2));
  const low24 = Math.min(...dailyCloses.slice(-2));
  const variation = dailyKlines.length >= 2 ? ((price - dailyKlines[dailyKlines.length - 2].close) / dailyKlines[dailyKlines.length - 2].close * 100).toFixed(2) : 0;
  const volume = dailyKlines.length > 0 ? dailyKlines[dailyKlines.length - 1].volume : 0;

  // Overall climate from 1D forecast
  const climaGeral = forecast['1D']?.climate || '🎯 NEUTRO';

  const lines = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📊 <b>Análise Diária BTC</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`💎 <b>Preço:</b> $${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  lines.push(`📈 <b>Variação 24h:</b> ${variation > 0 ? '🚀 +' : '🌊 '}${variation}%`);
  lines.push(`🏔️ <b>Máxima 24h:</b> $${high24.toLocaleString('en-US')}`);
  lines.push(`🌋 <b>Mínima 24h:</b> $${low24.toLocaleString('en-US')}`);
  lines.push(`⚡ <b>Volume:</b> ${(volume / 1000000).toFixed(1)}M BTC`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>📈 Análise Técnica</b>');
  lines.push('');
  lines.push(`🎯 <b>RSI Diário (14):</b> ${rsiDiario} ${rsiDiario > 70 ? '🔥 Sobreextendido' : rsiDiario > 60 ? '⚡ Aquecido' : rsiDiario > 40 ? '💎 Neutro' : rsiDiario > 30 ? '🌊 Frio' : '💎 Oversold'}`);
  lines.push(`📅 <b>RSI Semanal (14):</b> ${rsiSemanal} ${rsiSemanal > 70 ? '🔥 Sobreextendido' : rsiSemanal > 50 ? '🚀 Alta' : '🌊 Baixa'}`);
  lines.push(`📏 <b>EMA 200:</b> $${ema200.toLocaleString('en-US')} — ${priceAbove200 ? '✅ Preço acima (altista)' : '❌ Preço abaixo (baixista)'}`);
  lines.push(`🧠 <b>Fear & Greed:</b> ${fng.value}/100 — ${fng.classification}`);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>🌦️ Previsão por Período</b>');
  lines.push('');

  for (const [period, data] of Object.entries(forecast)) {
    lines.push(`${period}: ${data.climate} (RSI ${data.rsi})`);
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>💡 Recomendação</b>');
  lines.push('');

  const climaCount = Object.values(forecast);
  const altaCount = climaCount.filter(c => c.climate?.includes('ALTA') || c.climate?.includes('SOBRECOMPRA')).length;
  const baixaCount = climaCount.filter(c => c.climate?.includes('BAIXA') || c.climate?.includes('SOBREVENDA')).length;

  let sugs;
  if (altaCount > baixaCount + 2) {
    lines.push('🚀 <b>Cenário altista</b> na maioria dos períodos.');
    sugs = sugestaoElegante('ALTISTA');
  } else if (baixaCount > altaCount + 2) {
    lines.push('🌊 <b>Cenário baixista</b> na maioria dos períodos.');
    sugs = sugestaoElegante('BAIXISTA');
  } else {
    lines.push('🎯 <b>Cenário misto/neutro</b> — indecisão no mercado.');
    sugs = sugestaoElegante('NEUTRO');
  }
  for (const s of sugs) lines.push(s);
  lines.push('⚠️ Fique atento aos níveis de suporte e resistência.');

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📊 <b>Visão geral:</b> ${climaGeral}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🦾 <b>Severino — BTC Weather Panel</b>');
  lines.push('https://btcweatherpanel.com/');

  return lines.join('\n');
}

// ===== CLIMATE MONITOR (7 CARDS) =====

function cleanClimateName(climate) {
  return (climate || '').replace(/[🚀🌊💎🔥🎯⚡]/g, '').trim();
}

function loadCardState() {
  try { return JSON.parse(fs.readFileSync(CARD_ALERTS_PATH, 'utf8')); }
  catch { return {}; }
}

function saveCardState(state) {
  try { fs.writeFileSync(CARD_ALERTS_PATH, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('Erro ao salvar card_alerts.json:', e.message); }
}

// Fase elegante do clima, no espírito de plantar/cultivar/colher
function faseDoClima(climate) {
  const c = (climate || '').toUpperCase();
  if (c.includes('SOBRECOMPRA')) {
    return {
      titulo: '🧺 <b>🌾 Tempo de COLHER</b>',
      acao: 'Realizar lucros parciais — colhendo seus frutos com gratidão.',
      detalhe: 'As frutas estão maduras e o pomar pede colheita. Bom momento de realizar, colhendo seus frutos e guardando boas sementes para o próximo ciclo.'
    };
  }
  if (c.includes('SOBREVENDA')) {
    return {
      titulo: '💧 <b>Tempo de PLANTIO em Solo Fértil</b>',
      acao: 'Acúmulo confiante — semear enquanto o mercado teme.',
      detalhe: 'Solo fértil e terra molhada. Enquanto o mercado teme, o agricultor sábio semeia com confiança e paciência.'
    };
  }
  if (c.includes('ALTA')) {
    return {
      titulo: '🌱 <b>Tempo de CULTIVAR</b>',
      acao: 'Manter posição e deixar os frutos crescerem.',
      detalhe: 'A planta está crescendo saudável. Tempo de cultivar: mantenha seu plantio, regue com paciência e evite colher antes da hora.'
    };
  }
  if (c.includes('BAIXA')) {
    return {
      titulo: '🌦️ <b>Tempo de PLANTAR e ACUMULAR (DCA)</b>',
      acao: 'Aportes graduais — semeando com parcimônia.',
      detalhe: 'Chuva boa para semear. Tempo de plantar e acumular (DCA): adicione sementes aos poucos, nos preços mais baixos do canteiro.'
    };
  }
  return {
    titulo: '🛤️ <b>Tempo de CUIDAR</b>',
    acao: 'Manter e observar — sem pressa.',
    detalhe: 'A horta está em equilíbrio. Tempo de cuidar: proteja o que já plantou e aguarde o ciclo amadurecer sem ansiedade.'
  };
}

function buildCardChangeMessage(period, fromName, data) {
  const clima = data.climate || '🎯 NEUTRO';
  const fase = faseDoClima(clima);
  const lines = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🌦️ <b>Alerta — Tempo BTC (' + period + ')</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(fase.titulo);
  lines.push('');
  lines.push(fase.detalhe);
  lines.push('');
  lines.push('📊 Período: <b>' + period + '</b>');
  lines.push('🔄 Clima: ' + fromName + ' → <b>' + clima + '</b>');
  if (data.price) lines.push('💰 Preço: $' + data.price.toLocaleString('en-US'));
  if (data.rsi) lines.push('📈 RSI: ' + data.rsi);
  if (data.support) lines.push('🛡️ Suporte: $' + data.support.toLocaleString('en-US'));
  if (data.resistance) lines.push('🧱 Resistência: $' + data.resistance.toLocaleString('en-US'));
  lines.push('');
  lines.push('📌 <b>Sugestão:</b> ' + fase.acao);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🦾 <b>Severino — BTC Weather Panel</b>');
  lines.push('https://btcweatherpanel.com/');
  return lines.join('\n');
}

// Sugestões elegantes de entrada / manter / realizar
function sugestaoElegante(tipo) {
  if (tipo === 'ALTISTA') {
    return [
      '🌱 <b>Tempo de CULTIVAR (alta)</b>',
      '🟢 <b>Entrada:</b> Semeie nos respiros — correções leves são convites ao plantio.',
      '🤲 <b>Manter:</b> Deixe a planta crescer; proteja o canteiro sem colher antes da hora.',
      '🧺 <b>Realizar:</b> Colha frutos maduros aos poucos e guarde boas sementes.'
    ];
  }
  if (tipo === 'BAIXISTA') {
    return [
      '🌦️ <b>Tempo de PLANTAR e ACUMULAR (DCA)</b>',
      '🟢 <b>Entrada:</b> Aguarde o solo firmar — os melhores preços chegam com paciência.',
      '🤲 <b>Manter:</b> Proteja sua horta: reduza riscos e evite ansiedade.',
      '🧺 <b>Realizar:</b> Colha cedo o que já amadureceu e guarde sementes para o próximo plantio.'
    ];
  }
  return [
    '🛤️ <b>Tempo de CUIDAR (neutro)</b>',
    '🟢 <b>Entrada:</b> Tempo de observar — não semeie na dúvida.',
    '🤲 <b>Manter:</b> Mantenha o plantio e seja paciente com o ciclo.',
    '🧺 <b>Realizar:</b> Sem pressa: espere a direção amadurecer.'
  ];
}

async function checkCardChanges() {
  const forecast = await getForecast();
  const state = loadCardState();
  const now = Date.now();
  const changes = [];
  const users = notif.getOptedInUsers('climateChange');

  for (const [period, data] of Object.entries(forecast)) {
    const prev = state[period];
    const curName = cleanClimateName(data.climate);
    if (!curName) continue;

    // Primeira execução: apenas registra o estado atual
    if (!prev) {
      state[period] = { name: curName, lastSentAt: 0 };
      continue;
    }

    if (prev.name === curName) continue;

    // Mudança detectada — respeita o cooldown de 15 min por card.
    // Durante o cooldown o nome antigo é mantido: se o preço continuar
    // oscilando, a notificação só sai de novo depois de 15 minutos.
    if (prev.lastSentAt && (now - prev.lastSentAt) < CARD_COOLDOWN_MS) {
      continue;
    }

    const msg = buildCardChangeMessage(period, prev.name, data);
    sendToAdmin(msg);
    for (const user of users) {
      if (!isVip(user.licenseCode)) continue;
      sendTelegram(user.telegramId, msg);
      if (user.email) sendEmail(user.email, 'BTC Weather — Mudança de Card', msg.replace(/<[^>]+>/g, ''));
    }
    changes.push(period);
    state[period] = { name: curName, lastSentAt: now };
  }

  saveCardState(state);
  return changes;
}

// ===== DAILY DISPATCH =====

async function sendDailyToAll() {
  const analysis = await generateDailyAnalysis();
  const users = notif.getOptedInUsers('dailyAnalysis');
  const today = new Date().toISOString().split('T')[0];

  let sent = 0;
  for (const user of users) {
    if (!isVip(user.licenseCode)) continue;
    const lastSent = notif.getUser(user.telegramId).lastDailySent;
    if (lastSent === today) continue;

    sendTelegram(user.telegramId, analysis);
    notif.updateUser(user.telegramId, { lastDailySent: today });
    if (user.email) sendEmail(user.email, 'BTC Weather — Análise Diária', analysis.replace(/<[^>]+>/g, ''));
    sent++;
  }

  // Mirror full analysis to admin
  sendToAdmin('📋 <b>[ADMIN] Cópia — Análise Diária</b>\n' + analysis);

  // Send to admin as confirmation
  if (ADMIN_CHAT) {
    const summary = `━━━━━━━━━━━━━━━━━━━━━━\n📊 <b>Relatório de Envio</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n👥 Usuários cadastrados: ${users.length}\n✅ Enviado para: ${sent}\n⏭️ Pulados (já receberam): ${users.length - sent}\n\n━━━━━━━━━━━━━━━━━━━━━━\n🦾 Severino — BTC Weather Panel`;
    sendTelegram(ADMIN_CHAT, summary);
  }

  return { total: users.length, sent, skipped: users.length - sent };
}

async function testAdmin() {
  const analysis = await generateDailyAnalysis();
  const msg = '━━━━━━━━━━━━━━━━━━━━━━\n🧪 <b>Teste de Notificação</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n' + analysis;
  sendTelegram(ADMIN_CHAT, msg);
  console.log('[TEST] Análise enviada para admin:', ADMIN_CHAT);
}

async function testCards() {
  const forecast = await getForecast();
  const demos = [
    { period: '15M', from: '🌊 BAIXA', to: '💎 SOBREVENDA' },
    { period: '1H', from: '🌊 BAIXA', to: '🎯 NEUTRO' },
    { period: '4H', from: '🎯 NEUTRO', to: '🚀 ALTA' },
    { period: '1D', from: '🚀 ALTA', to: '🔥 SOBRECOMPRA' }
  ];
  const parts = ['🧪 <b>TESTE — Notificações dos Cards (amostra)</b>\n\nSegue 4 exemplos das novas mensagens elegantes (uma para cada fase do clima):'];
  for (const demo of demos) {
    const real = forecast[demo.period] || {};
    const data = Object.assign({}, real, { climate: demo.to });
    parts.push('');
    parts.push(buildCardChangeMessage(demo.period, cleanClimateName(demo.from), data));
  }
  parts.push('');
  parts.push('📡 <b>[TESTE] Sinal Operacional (exemplo)</b>');
  parts.push('');
  parts.push(sugestaoElegante('ALTISTA').join('\n'));
  sendToAdmin(parts.join('\n'));
  console.log('[TEST] Mensagens de cards enviadas para admin:', ADMIN_CHAT);
}

// ===== MAIN =====


// ===== OPERATIONAL SIGNAL MONITOR =====

async function checkOperationalSignals() {
  const forecast = await getForecast();
  const users = notif.getOptedInUsers('operationalSignal');
  const changes = [];

  // Calculate overall signal
  var totalTf = Object.keys(forecast).length;
  var altaCount = 0, baixaCount = 0;
  var forcaAlta = 0, forcaBaixa = 0;
  var tfDetails = [];

  for (var period in forecast) {
    var data = forecast[period];
    if (!data || !data.climate) continue;
    var isAlta = data.climate.includes('ALTA') || data.climate.includes('SOBRECOMPRA');
    var isBaixa = data.climate.includes('BAIXA') || data.climate.includes('SOBREVENDA');
    var isForte = data.strength === 'Forte';
    if (isAlta) { altaCount++; if (isForte) forcaAlta++; }
    if (isBaixa) { baixaCount++; if (isForte) forcaBaixa++; }
    tfDetails.push({ period: period, climate: data.climate, signal: data.signal, strength: data.strength, rsi: data.rsi, price: data.price });
  }

  var signalEmoji, signalLabel;
  if (altaCount > baixaCount + 1) {
    signalEmoji = '🚀'; signalLabel = 'ALTISTA';
  } else if (baixaCount > altaCount + 1) {
    signalEmoji = '🌊'; signalLabel = 'BAIXISTA';
  } else {
    signalEmoji = '🎯'; signalLabel = 'MISTO/NEUTRO';
  }

  // Build the elegant operational message once (same for every user)
  var lines = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(signalEmoji + ' <b>Sinal Operacional BTC</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('📊 <b>Cenario Geral:</b> ' + signalLabel);
  lines.push('📈 Alta: ' + altaCount + ' periodos');
  lines.push('📉 Baixa: ' + baixaCount + ' periodos');
  if (forcaAlta > 0) lines.push('🔥 Forca compradora: ' + forcaAlta + ' timeframes');
  if (forcaBaixa > 0) lines.push('💨 Forca vendedora: ' + forcaBaixa + ' timeframes');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  var sugs = sugestaoElegante(signalLabel);
  for (var s of sugs) lines.push(s);
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('<b>⏱️ Alinhamento por Periodo</b>');
  lines.push('');
  for (const td of tfDetails) {
    var ic = td.climate.includes('ALTA') ? '🚀' : td.climate.includes('BAIXA') ? '🌊' : '🎯';
    lines.push(td.period + ': ' + ic + ' ' + td.climate + ' (RSI ' + td.rsi + ')');
  }
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🦾 <b>Severino — BTC Weather Panel</b>');
  lines.push('https://btcweatherpanel.com/');
  var msg = lines.join('\n');

  for (const user of users) {
    if (!isVip(user.licenseCode)) continue;
    var lastSignal = notif.getUser(user.telegramId).lastSignal || null;
    var currentSignalSummary = signalLabel + '|' + altaCount + 'A/' + baixaCount + 'B';

    // Only send if signal changed
    if (lastSignal !== currentSignalSummary) {
      sendTelegram(user.telegramId, msg);
      notif.updateUser(user.telegramId, { lastSignal: currentSignalSummary });
      changes.push({ user: user.telegramId, signal: signalLabel });
    }
  }

  // Mirror to admin once when the signal actually changes
  if (changes.length > 0) sendToAdmin('📡 <b>[ADMIN]</b>\n' + msg);

  return changes;
}

async function main() {
  const mode = process.argv[2] || 'both';

  console.log(`[Notifier] Mode: ${mode}, Time: ${new Date().toISOString()}`);

  if (mode === 'test') {
    await testAdmin();
    console.log('[Notifier] Teste concluído');
    return;
  }

  if (mode === 'test-cards') {
    await testCards();
    console.log('[Notifier] Teste de cards concluído');
    return;
  }

  if (mode === 'daily' || mode === 'both') {
    console.log('[Notifier] Enviando análise diária...');
    const result = await sendDailyToAll();
    console.log(`[Notifier] Daily: ${result.sent} enviados, ${result.skipped} pulados`);
  }

  if (mode === 'climate' || mode === 'both' || mode === 'climate-signal') {
    console.log('[Notifier] Verificando mudanças nos cards de clima...');
    const changes = await checkCardChanges();
    console.log(`[Notifier] Cards: ${changes.length} modificações notificadas`);
  }

  if (mode === 'signal' || mode === 'both' || mode === 'climate-signal') {
    console.log('[Notifier] Verificando sinais operacionais...');
    const sigChanges = await checkOperationalSignals();
    console.log(`[Notifier] Signals: ${sigChanges.length} usuários notificados`);
  }
}

main().catch(e => console.error('[Notifier] Error:', e.message));
