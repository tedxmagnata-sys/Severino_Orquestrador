
const BACKTEST_DAYS = 90;
const TP_PCT = 3;   // take profit %
const SL_PCT = 5;   // stop loss %

const SYMBOLS = ["BTC-USDT","ETH-USDT","SOL-USDT","ADA-USDT","HYPE-USDT"];
const OKX_BASE = "https://www.okx.com";

async function fetchCandles(symbol, bar, limit) {
  try {
    const r = await fetch(`${OKX_BASE}/api/v5/market/candles?instId=${symbol}&bar=${bar}&limit=${limit}`);
    const j = await r.json();
    if (!j.data) return [];
    return j.data.map(c => ({
      ts: parseInt(c[0]), o: parseFloat(c[1]), h: parseFloat(c[2]),
      l: parseFloat(c[3]), c: parseFloat(c[4]), vol: parseFloat(c[5])
    }));
  } catch { return []; }
}

function didiIndex(closes) {
  if (closes.length < 21) return { trend: "lateral", didi: 0 };
  const slice = a => a.slice(-1 * Math.min(a.length, arguments[1] || 21));
  const ema = (src, len) => {
    if (!src || src.length < len) return 0;
    const s = src.slice(-len);
    let r = s[0];
    const m = 2 / (len + 1);
    for (let i = 1; i < s.length; i++) r = s[i] * m + r * (1 - m);
    return r;
  };
  const curta = ema(closes, 3);
  const media = ema(closes, 8);
  const longa = ema(closes, 20);
  if (!media) return { trend: "lateral", didi: 0 };
  const c = curta - media;
  const l = longa - media;
  return { trend: c > l ? "bullish" : (l > c ? "bearish" : "lateral"), didi: c - l };
}

function squeeze(closes, highs, lows) {
  if (closes.length < 21) return { squeezing: false, momentum: 0 };
  const len = 20;
  const slice = closes.slice(-len);
  const basis = slice.reduce((a,b) => a + b, 0) / len;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - basis) ** 2, 0) / len);
  const upperBB = basis + 2 * std, lowerBB = basis - 2 * std;
  const ranges = highs.slice(-len).map((h, i) => h - lows.slice(-len)[i]);
  const rangeMa = ranges.reduce((a,b) => a+b,0)/len;
  const upperKC = basis + rangeMa * 1.5, lowerKC = basis - rangeMa * 1.5;
  const squeezing = lowerBB > lowerKC && upperBB < upperKC;
  const kcMid = (upperKC + lowerKC) / 2;
  const momentum = ((closes[closes.length-1] - kcMid) / (kcMid || 1)) * 100;
  return { squeezing, momentum };
}

// Quick RSI
function computeRSI(closes, period = 7) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgG = gains / period, avgL = losses / period;
  return avgL === 0 ? 100 : 100 - (100 / (1 + avgG / avgL));
}

async function backtestSymbol(symbol) {
  console.log(`Backtesting ${symbol}...`);
  // Fetch 90 days of 1H candles (max limit = 300, so do multiple)
  const limit = 300;
  const needed = 24 * BACKTEST_DAYS;
  let allCandles = [];
  let after = null;
  while (allCandles.length < needed) {
    const url = `${OKX_BASE}/api/v5/market/candles?instId=${symbol}&bar=1H&limit=${limit}` + (after ? `&after=${after}` : "");
    const r = await fetch(url);
    const j = await r.json();
    if (!j.data || !j.data.length) break;
    const candles = j.data.map(c => ({ ts: parseInt(c[0]), o: parseFloat(c[1]), h: parseFloat(c[2]), l: parseFloat(c[3]), c: parseFloat(c[4]), vol: parseFloat(c[5]) }));
    allCandles.push(...candles);
    after = j.data[j.data.length-1][0];
    await new Promise(r => setTimeout(r, 200));
  }

  allCandles.sort((a, b) => a.ts - b.ts);
  // Trim to ~90 days
  const cutoff = Date.now() - BACKTEST_DAYS * 24 * 60 * 60 * 1000;
  allCandles = allCandles.filter(c => c.ts >= cutoff);
  if (allCandles.length < 50) { console.log(`  ${symbol}: insufficient data`); return null; }

  let trades = [];
  let inPosition = false;
  let entryPrice = 0, entrySide = "", entryBar = 0, entryHigh = 0, entryLow = 0;
  let closes = [], highs = [], lows = [];

  for (let i = 0; i < allCandles.length; i++) {
    const c = allCandles[i];
    closes.push(c.c);
    highs.push(c.h);
    lows.push(c.l);

    if (closes.length < 22) continue;

    const didi = didiIndex(closes);
    const sqz = squeeze(closes, highs, lows);
    const rsi = computeRSI(closes);

    if (!inPosition) {
      // Entry logic: Didi bullish + squeeze release + RSI not overbought
      const longEntry = didi.trend === "bullish" && Math.abs(sqz.momentum) > 0.3 && rsi < 65 && didi.didi > 0.3;
      const shortEntry = didi.trend === "bearish" && Math.abs(sqz.momentum) > 0.3 && rsi > 35 && didi.didi < -0.3;

      if (longEntry || shortEntry) {
        inPosition = true;
        entrySide = longEntry ? "long" : "short";
        entryPrice = c.c;
        entryBar = i;
        entryHigh = c.h;
        entryLow = c.l;
      }
    } else {
      // Check TP/SL
      let pnl = entrySide === "long" ? (c.c - entryPrice) / entryPrice * 100 : (entryPrice - c.c) / entryPrice * 100;
      // Also check intra-bar extremes for better accuracy
      let pnlHigh = entrySide === "long" ? (c.h - entryPrice) / entryPrice * 100 : (entryPrice - c.l) / entryPrice * 100;
      let pnlLow = entrySide === "long" ? (c.l - entryPrice) / entryPrice * 100 : (entryPrice - c.h) / entryPrice * 100;

      let exit = false;
      let exitPnl = pnl;
      let exitReason = "";

      if (pnlHigh >= TP_PCT) {
        exit = true;
        exitPnl = TP_PCT;
        exitReason = "TP";
      } else if (pnlLow <= -SL_PCT) {
        exit = true;
        exitPnl = -SL_PCT;
        exitReason = "SL";
      }

      // Also check for opposite signal (force close on trend change)
      if (!exit && i - entryBar >= 24) { // max 24h hold
        const newDidi = didiIndex(closes);
        if ((entrySide === "long" && newDidi.trend === "bearish") || (entrySide === "short" && newDidi.trend === "bullish")) {
          exit = true;
          exitPnl = pnl;
          exitReason = "Reversal";
        }
      }

      if (exit) {
        trades.push({
          symbol,
          side: entrySide,
          entry: entryPrice.toFixed(2),
          exit: (entrySide === "long" ? entryPrice * (1 + exitPnl/100) : entryPrice * (1 - exitPnl/100)).toFixed(2),
          pnl: exitPnl.toFixed(2),
          bars: i - entryBar,
          reason: exitReason,
          entryDidi: didi.didi.toFixed(2),
          entryRSI: computeRSI(closes.slice(-14)).toFixed(1),
        });
        inPosition = false;
      }
    }
  }

  // Close any open position at end
  if (inPosition) {
    const lastC = allCandles[allCandles.length-1];
    let pnl = entrySide === "long" ? (lastC.c - entryPrice) / entryPrice * 100 : (entryPrice - lastC.c) / entryPrice * 100;
    trades.push({
      symbol, side: entrySide,
      entry: entryPrice.toFixed(2),
      exit: lastC.c.toFixed(2),
      pnl: pnl.toFixed(2),
      bars: allCandles.length - 1 - entryBar,
      reason: "End",
      entryDidi: "N/A",
      entryRSI: "N/A",
    });
  }

  if (!trades.length) { console.log(`  ${symbol}: 0 trades`); return { symbol, trades: 0, wins: 0, losses: 0, winRate: 0, avgPnl: 0, profit: 0 }; }

  const wins = trades.filter(t => parseFloat(t.pnl) > 0).length;
  const losses = trades.filter(t => parseFloat(t.pnl) <= 0).length;
  const totalPnl = trades.reduce((s, t) => s + parseFloat(t.pnl), 0);
  const avgPnl = totalPnl / trades.length;

  return {
    symbol,
    trades: trades.length,
    wins,
    losses,
    winRate: trades.length ? (wins / trades.length * 100).toFixed(1) : 0,
    avgPnl: avgPnl.toFixed(2),
    profit: totalPnl.toFixed(2),
    details: trades.slice(-20), // last 20 trades
  };
}

(async () => {
  console.log("=== BACKTEST 90 DIAS — SPOT 3% TP / 5% SL ===");
  console.log(`Data: ${new Date().toLocaleDateString()}`);
  console.log("Estrategia: Didi Index + Squeeze + RSI\n");

  let allResults = [];
  for (const sym of SYMBOLS) {
    const r = await backtestSymbol(sym);
    if (r) allResults.push(r);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log("\n=== RESUMO POR ATIVO ===");
  let totalTrades = 0, totalWins = 0, totalLosses = 0, totalProfit = 0;
  for (const r of allResults) {
    totalTrades += r.trades;
    totalWins += r.wins;
    totalLosses += r.losses;
    totalProfit += parseFloat(r.profit);
    console.log(`${r.symbol}: ${r.trades} trades | ${r.winRate}% WR | P&L: ${r.profit}% | Avg: ${r.avgPnl}%`);
  }

  console.log(`\n=== TOTAL ===`);
  console.log(`Total trades: ${totalTrades}`);
  console.log(`Wins: ${totalWins} | Losses: ${totalLosses}`);
  console.log(`Win rate: ${totalTrades ? (totalWins/totalTrades*100).toFixed(1) : 0}%`);
  console.log(`Profit factor: ${totalLosses ? (totalWins / totalLosses).toFixed(2) : "N/A"}`);
  console.log(`Net P&L: ${totalProfit.toFixed(2)}%`);

  // Show last trades
  console.log(`\n=== ULTIMOS TRADES ===`);
  for (const r of allResults) {
    if (r.details) {
      console.log(`\n${r.symbol} (ultimos ${Math.min(r.details.length, 10)}):`);
      r.details.slice(-10).forEach((t, i) => {
        console.log(`  #${i+1} ${t.side.toUpperCase()} | Entry: ${t.entry} | Exit: ${t.exit} | PnL: ${t.pnl}% | ${t.reason} | RSI: ${t.entryRSI}`);
      });
    }
  }
})();
