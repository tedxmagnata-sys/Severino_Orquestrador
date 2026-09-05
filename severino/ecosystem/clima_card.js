const fs = require('fs');

async function getBTCPrice() {
  try {
    const d = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const j = await d.json();
    return parseFloat(j.price);
  } catch { return 0; }
}

async function getFearGreed() {
  try {
    const d = await fetch('https://api.alternative.me/fng/?limit=1');
    const j = await d.json();
    if (j.data && j.data[0]) return { value: parseInt(j.data[0].value), classification: j.data[0].value_classification };
    return { value: 50, classification: 'Neutro' };
  } catch { return { value: 50, classification: 'Neutro' }; }
}

async function getKlines(interval, limit) {
  const d = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`);
  const j = await d.json();
  return j.map(k => ({ open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }));
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

function interpretClimate(rsi, emaShort, emaLong, price) {
  const bullish = emaShort > emaLong && rsi > 50;
  const bearish = emaShort < emaLong && rsi < 50;
  const overbought = rsi > 70;
  const oversold = rsi < 30;
  if (overbought) return { clima: 'SOBRECOMPRA', emoji: '🔥', sinal: 'Venda parcial', forca: 'Forte' };
  if (oversold) return { clima: 'SOBREVENDA', emoji: '💎', sinal: 'Compra oportunista', forca: 'Forte' };
  if (bullish) return { clima: 'ALTA', emoji: '🚀', sinal: 'Compra', forca: rsi > 60 ? 'Moderada' : 'Fraca' };
  if (bearish) return { clima: 'BAIXA', emoji: '🌊', sinal: 'Venda/Aguardar', forca: rsi < 40 ? 'Moderada' : 'Fraca' };
  return { clima: 'NEUTRO', emoji: '🎯', sinal: 'Aguardar', forca: 'Neutra' };
}

(async () => {
  const intervals = [
    { name: '15M', binance: '15m' }, { name: '1H', binance: '1h' }, { name: '4H', binance: '4h' },
    { name: '1D', binance: '1d' }, { name: '3D', binance: '3d' }, { name: '1W', binance: '1w' }, { name: '1M', binance: '1M' }
  ];
  const results = {};
  for (const iv of intervals) {
    try {
      const klines = await getKlines(iv.binance, iv.binance === '1M' ? 30 : 50);
      if (klines.length < 20) continue;
      const closes = klines.map(k => k.close);
      const price = closes[closes.length - 1];
      const rsi = calcRSI(closes);
      const ema9 = calcEMA(closes, 9);
      const ema21 = calcEMA(closes, 21);
      const clima = interpretClimate(rsi, ema9, ema21, price);
      const sup = Math.min(...closes.slice(-5));
      const res = Math.max(...closes.slice(-5));
      results[iv.name] = { ...clima, preco: Math.round(price * 100) / 100, suporte: Math.round(sup * 100) / 100, resistencia: Math.round(res * 100) / 100, rsi };
    } catch (e) { results[iv.name] = { erro: e.message }; }
  }
  const price = await getBTCPrice();
  const fng = await getFearGreed();
  const out = { geradoEm: new Date().toISOString(), precoBTC: price, medoGanancia: fng, periodos: results };
  fs.writeFileSync('/root/severino/ecosystem/data/clima_card.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
