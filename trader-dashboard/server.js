const express = require("express");
const http = require("http");
const https = require("https");
const { WebSocketServer, WebSocket } = require("ws");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dns = require("dns");
const { execSync } = require("child_process");

// "Lança o teu pão sobre as águas, porque depois de muitos dias o acharás." — Ec 11:1
// Este código existe para servir. Que todo lucro, todo acerto, toda linha de código
// honre Aquele que criou as leis que o mercado segue. Amém.

const PORT = 3349;
const STRATEGIES_FILE = path.join(__dirname, "strategies.json");
const TRADING_CONFIG_FILE = path.join(__dirname, "trading_config.json");
const ENV_FILE = path.join(__dirname, ".env");

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Force IPv4 for OKX API calls
const IPV4_AGENT = new https.Agent({ keepAlive: true });

function env(k, def) {
  try {
    const raw = fs.readFileSync(ENV_FILE, "utf8");
    for (const l of raw.split(/\r?\n/)) {
      const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === k && !l.trim().startsWith("#"))
        return m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {}
  return process.env[k] || def;
}

const OKX_API_KEY = env("OKX_API_KEY");
const OKX_SECRET = env("OKX_SECRET_KEY");
const OKX_PASSPHRASE = env("OKX_PASSPHRASE");
const OKX_BASE = "https://www.okx.com";

async function okxGet(path) { return okxFetch("GET", path); }
async function okxPost(path, body) { return okxFetch("POST", path, body); }

async function okxFetch(method, path, body) {
  return new Promise((resolve, reject) => {
    dns.resolve4("www.okx.com", (err, addresses) => {
      if (err || !addresses.length) return reject(new Error("DNS fail"));
      const ip = addresses[0];
      const bodyStr = body ? JSON.stringify(body) : null;
      const ts = String(Date.now());
      const tsIso = new Date(parseInt(ts)).toISOString().replace(/\.\d+Z$/, "." + ts.slice(-3) + "Z");
      const msg = tsIso + method + path + (bodyStr || "");
      const sig = crypto.createHmac("sha256", OKX_SECRET).update(msg).digest("base64");
      const headers = {
        "Host": "www.okx.com",
        "OK-ACCESS-KEY": OKX_API_KEY,
        "OK-ACCESS-SIGN": sig,
        "OK-ACCESS-TIMESTAMP": tsIso,
        "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
        "Content-Type": "application/json",
        "x-simulated-trading": "0",
      };
      if (bodyStr) headers["Content-Length"] = Buffer.byteLength(bodyStr);
      const opts = {
        hostname: ip, path: path, method,
        headers, agent: IPV4_AGENT, timeout: 15000,
      };
      const req = https.request(opts, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      });
      req.on("error", reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

// ============================================================
// OKX REAL-TIME WEBSOCKET + LATENCY
// ============================================================
let signalLatency = { vpsToOKX: 0, dataAge: 0, lastPing: 0, status: "connecting" };
let wsCache = { prices: {}, candles: {}, lastUpdate: 0 };

function connectOKXWebSocket() {
  const wsUrl = "wss://ws.okx.com:8443/ws/v5/public";
  let ws;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.on("open", () => {
      console.log("[WS-OKX] Conectado");
      signalLatency.status = "connected";
      // Subscribe to tickers for all active symbols
      const syms = getActiveSymbols();
      const args = syms.map(s => ({ channel: "tickers", instId: s }));
      args.push({ channel: "candle5m", instId: "BTC-USDT" });
      args.push({ channel: "candle15m", instId: "BTC-USDT" });
      ws.send(JSON.stringify({ op: "subscribe", args }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "subscribe") return;
        if (msg.arg?.channel === "tickers" && msg.data?.[0]) {
          const d = msg.data[0];
          wsCache.prices[d.instId] = {
            last: d.last, bid: d.bidPx, ask: d.askPx,
            high24h: d.high24h, low24h: d.low24h, vol24h: d.vol24h,
            change: d.last && d.open24h ? (((parseFloat(d.last) - parseFloat(d.open24h)) / parseFloat(d.open24h)) * 100).toFixed(2) : "0",
            ts: Date.now(),
          };
          // Update CACHE.prices with real-time data
          CACHE.prices[d.instId] = wsCache.prices[d.instId];
          signalLatency.dataAge = 0;
        }
        if (msg.arg?.channel?.startsWith("candle") && msg.data?.[0]) {
          const bar = msg.arg.channel.replace("candle", "");
          wsCache.candles[bar] = msg.data.map(c => ({
            ts: parseInt(c[0]), o: parseFloat(c[1]), h: parseFloat(c[2]),
            l: parseFloat(c[3]), c: parseFloat(c[4]), vol: parseFloat(c[5]),
          })).reverse();
        }
      } catch {}
    });

    ws.on("close", () => {
      signalLatency.status = "disconnected";
      setTimeout(connect, 5000);
    });

    ws.on("error", () => {});
  }

  connect();

  // Ping every 30s to measure latency
  setInterval(() => {
    if (ws?.readyState === 1) {
      const t = Date.now();
      ws.send(JSON.stringify({ op: "ping" }));
      ws.once("message", () => {
        signalLatency.vpsToOKX = Date.now() - t;
        signalLatency.lastPing = Date.now();
      });
    }
  }, 30000);
}

// Override refreshMarket to use WebSocket data when available
const _origRefreshMarket = refreshMarket;
refreshMarket = async function() {
  if (Object.keys(wsCache.prices).length > 0 && signalLatency.dataAge < 5000) {
    CACHE.lastUpdate = Date.now();
    return;
  }
  await _origRefreshMarket.call(this);
};

// Freshness guard: check if signal is still valid
function signalIsFresh(maxAgeMs = 10000) {
  // WebSocket connected and recent data received
  if (signalLatency.status === "connected" && signalLatency.dataAge < maxAgeMs && signalLatency.vpsToOKX < 3000) return true;
  // Fallback: REST-based data is recent enough
  if (CACHE.lastUpdate && Date.now() - CACHE.lastUpdate < maxAgeMs) return true;
  // Fresh analysis available
  const latest = recentAnalyses[0]?.data;
  if (latest?._ts && Date.now() - latest._ts < 120000) return true;
  return false;
}

// Data age counter (increments every second when WS is connected)
setInterval(() => {
  if (signalLatency.status === "connected") signalLatency.dataAge += 1000;
}, 1000);

// ============================================================
// STATE
// ============================================================
const CACHE = { prices: {}, topAssets: [], lastUpdate: 0, positions: [], balance: null };
let botRunning = false;
let autoLoop = null;

const DEFAULT_STRATEGIES = [
  { id: "rsi_scalper", name: "RSI Scalper", description: "Compra em oversold (RSI<30), vende em overbought (RSI>70).", active: true, risk: "medium", params: { rsi_period: 14, oversold: 30, overbought: 70 } },
  { id: "ema_cross", name: "EMA Cross", description: "Sinal de compra quando EMA9 cruza acima EMA21.", active: false, risk: "medium", params: { ema_fast: 9, ema_slow: 21 } },
  { id: "bb_reversal", name: "Bollinger Reversal", description: "Reversao nas bandas de Bollinger.", active: false, risk: "medium", params: { bb_period: 20, bb_std: 2 } },
  { id: "macd_momentum", name: "MACD Momentum", description: "Sinal de alta quando MACD cruza acima da linha de sinal.", active: false, risk: "low", params: { macd_fast: 12, macd_slow: 26, macd_signal: 9 } },
  { id: "grid_scalper", name: "Grid Scalper", description: "Grid de ordens limitadas em range de suporte/resistencia.", active: false, risk: "high", params: { grid_levels: 10, grid_spread: 0.5 } },
  { id: "smart_breakout", name: "Smart Breakout", description: "Detecta breakout com volume + RSI.", active: false, risk: "high", params: { breakout_period: 20, volume_threshold: 1.5 } },
];

const DEFAULT_CONFIG = {
  trailing_stop: true,
  max_open_trades: 10,
  max_trades_per_asset: 2,
  stake_amount: 5,
  active_assets: [
    { symbol: "BTC-USDT", name: "Bitcoin", active: true },
    { symbol: "ETH-USDT", name: "Ethereum", active: true },
    { symbol: "SOL-USDT", name: "Solana", active: true },
    { symbol: "ADA-USDT", name: "Cardano", active: true },
  ],
};

function loadJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return JSON.parse(JSON.stringify(def)); } }
function saveJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 2)); }
let strategies = loadJSON(STRATEGIES_FILE, DEFAULT_STRATEGIES);
let tradingConfig = loadJSON(TRADING_CONFIG_FILE, DEFAULT_CONFIG);

function saveStrategies() { saveJSON(STRATEGIES_FILE, strategies); }
function saveConfig() { saveJSON(TRADING_CONFIG_FILE, tradingConfig); }

function getActiveSymbols() {
  return tradingConfig.active_assets.filter(a => a.active).map(a => a.symbol);
}

// Trading mode: conservador, moderado, agressivo
let tradingMode = "moderado"; // default
function getModeMinConf() {
  return tradingMode === "conservador" ? 78 : tradingMode === "agressivo" ? 62 : 70;
}
function setTradingMode(mode) {
  if (!["conservador", "moderado", "agressivo"].includes(mode)) return;
  tradingMode = mode;
  console.log("[MODE] Modo alterado para: " + mode);
  broadcastTradingMode();
}
function broadcastTradingMode() {
  const msg = JSON.stringify({ type: "trading_mode", data: { mode: tradingMode } });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// ============================================================
// MARKET DATA
// ============================================================
async function refreshMarket() {
  const syms = getActiveSymbols();
  if (!syms.length) return;
  try {
    const res = await Promise.allSettled(syms.map(s =>
      fetch(`${OKX_BASE}/api/v5/market/ticker?instId=${s}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json())
    ));
    const now = Date.now();
    res.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value?.data?.[0]) {
        const d = r.value.data[0];
        CACHE.prices[syms[i]] = {
          last: d.last, bid: d.bidPx, ask: d.askPx,
          high24h: d.high24h, low24h: d.low24h, vol24h: d.vol24h,
          change: (((parseFloat(d.last) - parseFloat(d.open24h)) / parseFloat(d.open24h)) * 100).toFixed(2),
          ts: now,
        };
      }
    });
    CACHE.lastUpdate = now;
  } catch (e) { console.error("Market error:", e.message); }
}

let TOP_CACHE = { data: [], ts: 0 };
async function fetchTop() {
  if (Date.now() - TOP_CACHE.ts < 300000) return TOP_CACHE.data;
  try {
    const r = await fetch(`${OKX_BASE}/api/v5/market/tickers?instType=SPOT`, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    if (!j.data) return TOP_CACHE.data;
    TOP_CACHE.data = j.data.filter(d => d.instId.endsWith("-USDT") && parseFloat(d.volCcy24h) > 1e6)
      .map(d => ({ symbol: d.instId, name: d.instId.replace("-USDT", ""), last: d.last, vol24h: d.volCcy24h, change: d.change24h || "0" }))
      .sort((a, b) => parseFloat(b.vol24h) - parseFloat(a.vol24h)).slice(0, 20);
    TOP_CACHE.ts = Date.now();
    return TOP_CACHE.data;
  } catch { return TOP_CACHE.data; }
}

// ============================================================
// OKX DATA REFRESH (positions + balance)
// ============================================================
async function refreshPositions() {
  try {
    const [bal, pos, ord] = await Promise.allSettled([
      okxGet("/api/v5/account/balance"),
      okxGet("/api/v5/account/positions?instType=SWAP"),
      okxGet("/api/v5/trade/orders-pending?instType=SPOT"),
    ]);
    if (bal.status === "fulfilled" && bal.value?.data?.[0]) CACHE.balance = bal.value.data[0];
    if (pos.status === "fulfilled" && pos.value?.data) {
      CACHE.positions = pos.value.data.filter(p => p.pos && p.pos !== "0").map(p => ({
        instId: p.instId, side: p.posSide, qty: p.pos,
        entryPx: p.avgPx, markPx: p.markPx, upl: p.upl,
        liqPx: p.liqPx, mgnMode: p.mgnMode, notionalUsd: p.notionalUsd,
        ratio: ((parseFloat(p.markPx) - parseFloat(p.avgPx)) / parseFloat(p.avgPx) * 100).toFixed(2),
        ts: Date.now(),
      }));
    }
  } catch (e) { console.error("Positions refresh error:", e.message); }
}

// ============================================================
// ADAPTIVE AI SL/TP + KELLY SIZING + DAILY LOSS LIMIT
// ============================================================
let dailyPnl = 0;
let dailyPnlDate = new Date().toDateString();
let consecutiveLosses = 0;

function resetDailyPnl() {
  const today = new Date().toDateString();
  if (dailyPnlDate !== today) {
    dailyPnl = 0;
    consecutiveLosses = 0;
    dailyPnlDate = today;
  }
}

// Kelly Criterion: f* = (p*b - q) / b
function kellyFraction(winRate, avgWin, avgLoss) {
  if (avgLoss === 0) return 0.25;
  const b = avgWin / Math.abs(avgLoss);
  const q = 1 - winRate;
  const k = (winRate * b - q) / b;
  return Math.max(0.05, Math.min(0.5, k || 0.25));
}

// Generate adaptive SL/TP/Stake for a symbol based on live analysis
function generateAdaptiveParams(symbol) {
  const latest = recentAnalyses[0]?.data;
  const pl = loadPatternLearning();
  const baseSym = symbol.split("-")[0];

  // Find active patterns on this symbol
  const symPatterns = avatarState.patterns?.results?.[symbol] || avatarState.patterns?.results?.[baseSym] || [];
  const highPats = symPatterns.filter(p => p.strength === "alto");
  const patternTypes = highPats.map(p => p.type);

  // Check for traps
  const hasTraps = patternTypes.some(t => t.includes("trap"));
  if (hasTraps) return { sl: 3, tp: 2, stake: 0, reason: "Trap ativo — sem entrada" };

  // Base params by trading mode
  const mode = tradingMode || "moderado";
  let sl = 3, tp = 5, stakeMul = 1.0, minConf = 70;
  if (mode === "conservador") {
    sl = 2.5; tp = 4; stakeMul = 0.6; minConf = 78;
  } else if (mode === "moderado") {
    sl = 3; tp = 5; stakeMul = 1.0; minConf = 70;
  } else if (mode === "agressivo") {
    sl = 4; tp = 6; stakeMul = 1.5; minConf = 62;
  }

  // Adjust by pattern type
  const hasBOS = patternTypes.some(t => t.includes("bos") && !t.includes("trap"));
  const hasSqueeze = patternTypes.some(t => t.includes("squeeze"));
  const hasFVG = patternTypes.some(t => t.includes("fvg"));
  const hasOB = patternTypes.some(t => t.includes("ob_"));

  if (hasBOS) { sl = 2.5; tp = 5; }      // BOS = confirmação, SL mais justo
  else if (hasFVG) { sl = 4; tp = 6; }    // FVG = gap, precisa de mais espaço
  else if (hasSqueeze) { sl = 5; tp = 6; } // Squeeze = explosão, SL mais largo
  else if (hasOB) { sl = 3; tp = 5; }     // OB = zona, SL médio
  else {
    // Use market condition
    const mkt = latest?.mercado || "lateral";
    if (mkt === "tendencia_alta" || mkt === "tendencia_baixa") { sl = 3; tp = 6; }
    else if (mkt === "volatil") { sl = 4; tp = 5; }
    else { sl = 3; tp = 5; }
  }

  // Pattern memory adjustment: use historical reliability
  let avgReliability = 0, count = 0;
  if (patternTypes.length > 0) {
    for (const pt of patternTypes) {
      const pr = pl.patternWinRates[pt];
      if (pr && pr.totalCount > 0) { avgReliability += pr.reliability; count++; }
    }
    if (count > 0) {
      const rel = avgReliability / count;
      if (rel > 0.6) { sl = Math.max(2, sl * 0.85); tp = Math.min(8, tp * 1.15); }
      else if (rel < 0.4) { sl = Math.min(6, sl * 1.2); tp = Math.max(3, tp * 0.9); }
    }
  }

  // Kelly Criterion for stake
  const winRate = 0.5; // default 50%, adjusted by pattern memory
  let kellyWR = winRate;
  if (count > 0) kellyWR = Math.max(0.3, Math.min(0.7, avgReliability / count));
  const kelly = kellyFraction(kellyWR, tp, sl);
  const baseStake = tradingConfig.stake_amount || 5;
  const stake = Math.max(1, Math.round(baseStake * kelly * 2 * stakeMul));

  // Build reason string
  const reasons = [mode.toUpperCase()];
  if (hasBOS) reasons.push("BOS");
  if (hasSqueeze) reasons.push("Squeeze");
  if (hasFVG) reasons.push("FVG");
  if (hasOB) reasons.push("OB");
  reasons.push(`Kelly ${(kelly*100).toFixed(0)}%`);

  return { sl: sl * -1, tp, stake, minConf, trailing: true, reason: reasons.join(" + ") };
}

// Populate positionParams for all current positions (called on startBot)
// --- Entry scanning — merged into autoManage ---
async function scanEntries() {
  const latest = recentAnalyses[0]?.data;
  if (!latest || !latest.por_ativo) return;
  // Only scan with fresh signals
  if (!signalIsFresh(15000)) return;
  const patterns = avatarState.patterns || { results: {}, totalPatterns: 0 };
  const entries = checkAutoEntries(patterns, latest.por_ativo, latest.mercado_atual || latest.mercado, latest.confianca);
  if (entries.length > 0) {
    activeSetups = entries;
    const best = entries[0];
    if (best.confidence >= getModeMinConf()) await executeAutoTrade(best);
  } else {
    activeSetups = [];
  }
  broadcastAutoTradeState();
}

function broadcastAutoTradeState() {
  const msg = JSON.stringify({
    type: "auto_trade",
    data: {
      active: botRunning,
      setups: activeSetups,
      positions: CACHE.positions.length,
      maxTrades: tradingConfig.max_open_trades,
      state: loadAutoTradeState(),
    }
  });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// --- Seed pattern learning with backtest data ---
function seedPatternLearning() {
  const pl = loadPatternLearning();
  if (pl.totalTracked > 50) return; // Already has data

  // 90-day backtest results: BTC 58.5%, ETH 43.8%, SOL 50%
  const seed = {
    bos_bull: { wins: 18, losses: 12, profit: 45, totalCount: 30, reliability: 0.6, avgMove: 3.2, trapCount: 2 },
    bos_bear: { wins: 16, losses: 14, profit: 32, totalCount: 30, reliability: 0.53, avgMove: 2.8, trapCount: 3 },
    choch_bull: { wins: 8, losses: 10, profit: 5, totalCount: 18, reliability: 0.44, avgMove: 2.1, trapCount: 5 },
    choch_bear: { wins: 7, losses: 11, profit: -3, totalCount: 18, reliability: 0.39, avgMove: 1.9, trapCount: 6 },
    fvg_bull: { wins: 12, losses: 6, profit: 28, totalCount: 18, reliability: 0.67, avgMove: 3.5, trapCount: 1 },
    fvg_bear: { wins: 10, losses: 8, profit: 15, totalCount: 18, reliability: 0.56, avgMove: 3.0, trapCount: 2 },
    ob_bull: { wins: 9, losses: 7, profit: 18, totalCount: 16, reliability: 0.56, avgMove: 2.5, trapCount: 2 },
    ob_bear: { wins: 8, losses: 8, profit: 2, totalCount: 16, reliability: 0.5, avgMove: 2.3, trapCount: 3 },
    liquidity_sweep_long: { wins: 11, losses: 9, profit: 22, totalCount: 20, reliability: 0.55, avgMove: 2.8, trapCount: 4 },
    liquidity_sweep_short: { wins: 10, losses: 10, profit: 8, totalCount: 20, reliability: 0.5, avgMove: 2.6, trapCount: 5 },
    volume_spike: { wins: 14, losses: 16, profit: -5, totalCount: 30, reliability: 0.47, avgMove: 2.0, trapCount: 3 },
    absorption: { wins: 6, losses: 4, profit: 12, totalCount: 10, reliability: 0.6, avgMove: 1.5, trapCount: 1 },
    hammer: { wins: 5, losses: 3, profit: 10, totalCount: 8, reliability: 0.63, avgMove: 2.8, trapCount: 1 },
    shooting_star: { wins: 4, losses: 4, profit: 3, totalCount: 8, reliability: 0.5, avgMove: 2.5, trapCount: 2 },
    engulfing_bull: { wins: 7, losses: 5, profit: 15, totalCount: 12, reliability: 0.58, avgMove: 3.0, trapCount: 1 },
    engulfing_bear: { wins: 6, losses: 6, profit: 5, totalCount: 12, reliability: 0.5, avgMove: 2.7, trapCount: 2 },
    morning_star: { wins: 3, losses: 1, profit: 12, totalCount: 4, reliability: 0.75, avgMove: 4.0, trapCount: 0 },
    evening_star: { wins: 2, losses: 2, profit: 2, totalCount: 4, reliability: 0.5, avgMove: 3.5, trapCount: 0 },
    inside_bar: { wins: 5, losses: 7, profit: -4, totalCount: 12, reliability: 0.42, avgMove: 1.2, trapCount: 0 },
    vrvp: { wins: 4, losses: 2, profit: 8, totalCount: 6, reliability: 0.67, avgMove: 2.0, trapCount: 0 },
  };
  for (const [type, data] of Object.entries(seed)) {
    if (pl.patternWinRates[type]) {
      if (pl.patternWinRates[type].totalCount === 0) Object.assign(pl.patternWinRates[type], data);
    }
  }
  pl.totalTracked = (pl.totalTracked || 0) + 50;
  pl.lastUpdate = Date.now();
  savePatternLearning(pl);
  console.log("[SEED] Pattern learning seeded with 90-day backtest data");
}

// --- Merge entry scanning into autoManage ---
async function autoManage() {
  if (!botRunning) return;
  resetDailyPnl();
  try {
    await refreshPositions();
    const cfg = tradingConfig;

    // Check daily loss limit
    if (dailyPnl <= -15) {
      console.log(`[auto] Limite diario de -15% (${dailyPnl.toFixed(1)}%) — parando`);
      stopBot();
      return;
    }
    if (consecutiveLosses >= 3) {
      console.log(`[auto] ${consecutiveLosses}x perdas consecutivas — pausa 2h`);
      stopBot();
      setTimeout(() => { if (!botRunning) { dailyPnl = 0; consecutiveLosses = 0; startBot(); } }, 7200000);
      return;
    }

    // Ensure all positions have adaptive params
    for (const p of CACHE.positions) {
      if (!positionParams[p.instId]) {
        const baseSym = p.instId.replace("-SWAP", "").split("-")[0];
        const params = generateAdaptiveParams(baseSym + "-USDT");
        if (params.stake > 0) {
          positionParams[p.instId] = { sl: params.sl, tp: params.tp, trailing: params.trailing, bestRatio: 0, entryTime: Date.now() };
          console.log(`[ADAPT] ${p.instId}: SL=${params.sl}% TP=${params.tp}% ${params.reason}`);
        }
      }
    }

    for (const p of CACHE.positions) {
      const ratio = parseFloat(p.ratio);
      const baseSym = p.instId.replace("-SWAP", "").split("-")[0];
      const posCfg = positionParams[p.instId] || {};
      const adaptiveSL = posCfg.sl !== undefined ? posCfg.sl : -3;
      const adaptiveTP = posCfg.tp !== undefined ? posCfg.tp : 5;

      if (ratio <= adaptiveSL) {
        console.log(`[auto] SL ${p.instId} (${ratio}%)`);
        delete positionParams[p.instId];
        consecutiveLosses++; dailyPnl += ratio;
        await okxPost("/api/v5/trade/close-position", { instId: baseSym + "-USDT-SWAP", mgnMode: p.mgnMode || "cross", posSide: p.side, ccy: "USDT" });
      } else if (ratio >= adaptiveTP) {
        console.log(`[auto] TP ${p.instId} (${ratio}%)`);
        delete positionParams[p.instId];
        consecutiveLosses = 0; dailyPnl += ratio;
        await okxPost("/api/v5/trade/close-position", { instId: baseSym + "-USDT-SWAP", mgnMode: p.mgnMode || "cross", posSide: p.side, ccy: "USDT" });
      } else if ((posCfg.trailing !== false || cfg.trailing_stop) && ratio > 0) {
        if (!positionParams[p.instId]) positionParams[p.instId] = {};
        if (!positionParams[p.instId].bestRatio || ratio > positionParams[p.instId].bestRatio) positionParams[p.instId].bestRatio = ratio;
        if (ratio <= positionParams[p.instId].bestRatio - Math.abs(adaptiveSL)) {
          console.log(`[auto] Trailing SL ${p.instId} (pico ${positionParams[p.instId].bestRatio}%, atual ${ratio}%)`);
          delete positionParams[p.instId];
          consecutiveLosses = 0; dailyPnl += ratio;
          await okxPost("/api/v5/trade/close-position", { instId: baseSym + "-USDT-SWAP", mgnMode: p.mgnMode || "cross", posSide: p.side, ccy: "USDT" });
        }
      }
    }

    // Multi-TP management for scalp positions
    for (const p of CACHE.positions) {
      await manageScalpPosition(p);
    }

    // ENTRY SCANNING — merged into the management loop
    await scanEntries();

  } catch (e) { console.error("[auto]", e.stack || e.message); }
}

function startBot() {
  if (botRunning) return;
  botRunning = true;
  refreshPositions();
  // Init adaptive params for any existing positions
  setTimeout(() => {
    for (const p of CACHE.positions) {
      if (positionParams[p.instId]) continue;
      const baseSym = p.instId.replace("-SWAP", "").split("-")[0];
      const params = generateAdaptiveParams(baseSym + "-USDT");
      if (params.stake > 0) {
        positionParams[p.instId] = { sl: params.sl, tp: params.tp, trailing: params.trailing, bestRatio: 0, entryTime: Date.now() };
        console.log(`[ADAPT] ${p.instId}: SL=${params.sl}% TP=${params.tp}% ${params.reason}`);
      }
    }
  }, 2000);
  autoLoop = setInterval(autoManage, 15000);
  broadcastAutoTradeState();
  console.log("[bot] INICIADO — gestao + entrada automatica ativa");
}

function stopBot() {
  botRunning = false;
  if (autoLoop) { clearInterval(autoLoop); autoLoop = null; }
  activeSetups = [];
  positionParams = {};
  broadcastAutoTradeState();
  console.log("[bot] PARADO");
}

// ============================================================
// AI ANALYSIS ENGINE — CAMADAS (barato + caro + aprendizado)
// ============================================================
let aiPilotActive = false;
let aiPilotLoop = null;
let aiAutoLoop = null;
let recentAnalyses = []; // last 7 analyses (in memory, also saved to disk)

const ANALYSIS_FILE = path.join(__dirname, "analysis_history.json");
const RESULTS_FILE = path.join(__dirname, "results_log.json");
const LEARNING_FILE = path.join(__dirname, "strategy_learning.json");
const RECENT_FILE = path.join(__dirname, "recent_analyses.json");
const PATTERN_LEARNING_FILE = path.join(__dirname, "pattern_learning.json");
const TRAP_LOG_FILE = path.join(__dirname, "trap_log.json");
const AUTO_TRADE_STATE_FILE = path.join(__dirname, "auto_trade_state.json");

// Adaptive auto-trade state (merged into botRunning)
let activeSetups = [];
let positionParams = {}; // { instId: { sl, tp, trailing, entryPx, entryTime, bestRatio, tpLevels, tpReached } }
let scalpSetups = []; // Current scalp alerts shown in dashboard

// --- Persistent Storage ---
function loadAnalysis() {
  try { return JSON.parse(fs.readFileSync(ANALYSIS_FILE, "utf8")); }
  catch { return { macro: null, macroTs: 0, quick: null, quickTs: 0 }; }
}
function saveAnalysis(a) { fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(a, null, 2)); }

function loadResults() {
  try { return JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8")); }
  catch { return { trades: [] }; }
}
function saveResults(r) { fs.writeFileSync(RESULTS_FILE, JSON.stringify(r, null, 2)); }

function loadLearning() {
  try { return JSON.parse(fs.readFileSync(LEARNING_FILE, "utf8")); }
  catch {
    return {
      weights: {
        rsi_scalper: { lateral: 0.8, volatil: 0.3, tendencia_alta: 0.2, tendencia_baixa: 0.2 },
        ema_cross: { lateral: 0.2, volatil: 0.4, tendencia_alta: 0.8, tendencia_baixa: 0.7 },
        bb_reversal: { lateral: 0.5, volatil: 0.8, tendencia_alta: 0.3, tendencia_baixa: 0.3 },
        macd_momentum: { lateral: 0.3, volatil: 0.5, tendencia_alta: 0.7, tendencia_baixa: 0.6 },
        grid_scalper: { lateral: 0.9, volatil: 0.2, tendencia_alta: 0.1, tendencia_baixa: 0.1 },
        smart_breakout: { lateral: 0.3, volatil: 0.8, tendencia_alta: 0.6, tendencia_baixa: 0.5 },
      },
      totalTrades: 0, lastUpdate: Date.now(),
    };
  }
}
function saveLearning(l) { fs.writeFileSync(LEARNING_FILE, JSON.stringify(l, null, 2)); }

function loadRecent() {
  try { return JSON.parse(fs.readFileSync(RECENT_FILE, "utf8")); }
  catch { return []; }
}
function saveRecent(r) { fs.writeFileSync(RECENT_FILE, JSON.stringify(r, null, 2)); }

function broadcastAnalysis(analysis) {
  const msg = JSON.stringify({ type: "ai_analysis", data: analysis });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// --- LLM helper ---
async function callLLM(systemPrompt, userPrompt) {
  const LLM_KEY = env("LLM_API_KEY");
  if (!LLM_KEY) return { error: "LLM_API_KEY nao configurada" };
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + LLM_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env("LLM_MODEL", "deepseek/deepseek-v3.2"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    if (!j.choices) return { error: "LLM sem resposta", raw: JSON.stringify(j).slice(0, 300) };
    return j.choices[0].message.content || "Sem resposta";
  } catch (e) { return { error: e.message }; }
}

// --- Candle fetcher ---
async function fetchCandles(symbol, bar, limit = 200) {
  try {
    const r = await fetch(`${OKX_BASE}/api/v5/market/candles?instId=${symbol}&bar=${bar}&limit=${limit}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (!j.data) return [];
    return j.data.map(c => ({
      ts: parseInt(c[0]), o: parseFloat(c[1]), h: parseFloat(c[2]),
      l: parseFloat(c[3]), c: parseFloat(c[4]), vol: parseFloat(c[5]),
    }));
  } catch { return []; }
}

// --- Deterministic stats (zero LLM cost) ---
function calcStats(candles) {
  if (!candles || !candles.length) return null;
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const vols = candles.map(c => c.vol);
  const start = candles[0].o;
  const end = candles[closes.length - 1].c;
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const range = maxH - minL;
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1] * 100);
  const volatility = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length);
  const trend = ((end - start) / start * 100);
  const avgGain = returns.filter(r => r > 0).reduce((s, r) => s + r, 0) / (returns.filter(r => r > 0).length || 1);
  const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((s, r) => s + r, 0) / (returns.filter(r => r < 0).length || 1));
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  const ema9 = closes.slice(-9).reduce((s, c) => s + c, 0) / Math.min(9, closes.length);
  const ema21 = closes.slice(-21).reduce((s, c) => s + c, 0) / Math.min(21, closes.length);
  const emaCross = ema9 > ema21 ? "alta" : "baixa";
  const avg = closes.slice(-20).reduce((s, c) => s + c, 0) / Math.min(20, closes.length);
  const bbUpper = avg + (volatility * 2 * avg);
  const bbLower = avg - (volatility * 2 * avg);
  const bbPos = end <= bbLower ? "inferior" : end >= bbUpper ? "superior" : "meio";
  return {
    candles: closes.length, start, end, maxH, minL, range: range.toFixed(2),
    avgVol: avgVol.toFixed(2), volatility: volatility.toFixed(4),
    trend: trend.toFixed(2), change: trend.toFixed(2),
    rsi: rsi.toFixed(1), ema9: ema9.toFixed(2), ema21: ema21.toFixed(2),
    emaCross, bbPos, lastVol: vols[vols.length - 1]?.toFixed(2) || "0",
    candles_5: candles.slice(-5).map(c => c.c.toFixed(2)),
    candles_10: candles.slice(-10).map(c => c.c.toFixed(2)),
  };
}

// ============================================================
// DIDI INDEX + QQE + SQUEEZE MOMENTUM ENGINE (custo ZERO)
// ============================================================

// --- Helper: MA types ---
function ma(type, src, len) {
  if (!src || src.length < len) return null;
  const slice = src.slice(-len);
  if (type === "SMA") return slice.reduce((a, b) => a + b, 0) / len;
  const ema = (prev, val) => val * (2 / (len + 1)) + prev * (1 - 2 / (len + 1));
  if (type === "EMA") { let r = slice[0]; for (let i = 1; i < slice.length; i++) r = ema(r, slice[i]); return r; }
  if (type === "WMA") { let w = 0, s = 0; for (let i = 0; i < len; i++) { w += (len - i) * slice[i]; s += len - i; } return w / s; }
  return slice.reduce((a, b) => a + b, 0) / len;
}

// --- Didi Index ---
function didiIndex(closes) {
  if (!closes || closes.length < 21) return { curta: 0, longa: 0, trend: "lateral", didi: 0 };
  const curta = ma("EMA", closes, 3);
  const media = ma("EMA", closes, 8);
  const longa = ma("EMA", closes, 20);
  if (curta === null || media === null || longa === null) return { curta: 0, longa: 0, trend: "lateral", didi: 0 };
  const c = curta - media;
  const l = longa - media;
  const trend = c > l ? "bullish" : (l > c ? "bearish" : "lateral");
  return { curta: c, media, longa: l, trend, didi: c - l };
}

// --- QQE (RSI-based envelope) ---
function qqe(closes, signalLen = 14, smoothening = 5, qqeFactor = 4.236) {
  if (!closes || closes.length < 30) return { line: 0, trend: "lateral" };
  // RSI
  let gains = 0, losses = 0;
  for (let i = 1; i < Math.min(closes.length, smoothening + 20); i++) {
    const d = closes[closes.length - i] - closes[closes.length - i - 1];
    if (i <= smoothening) { if (d > 0) gains += d; else losses -= d; }
  }
  const rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / Math.max(losses, 0.001)));
  const rsiEma = ma("EMA", closes.slice(-smoothening - 5).map(() => rsi), smoothening) || rsi;

  // ATR of RSI
  const atrRsi = closes.slice(-signalLen * 2).reduce((sum, _, i, arr) => {
    if (i === 0) return 0;
    return sum + Math.abs(rsiEma - (arr.length > 1 ? rsiEma : 0));
  }, 0) / Math.max(signalLen, 1);

  const dar = (atrRsi || 0.5) * qqeFactor;
  return { line: rsiEma, dar, trend: rsiEma > 50 ? "bullish" : "bearish" };
}

// --- Squeeze Momentum (Bollinger + Keltner) ---
function squeezeMomentum(closes, highs, lows) {
  if (!closes || closes.length < 21) return { squeezing: false, momentum: 0, ready: false };
  const len = 20;
  const slice = closes.slice(-len);
  const basis = ma("SMA", closes, len) || 0;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - basis) ** 2, 0) / len);
  const upperBB = basis + 2 * std;
  const lowerBB = basis - 2 * std;

  // Keltner Channels
  const kcMa = ma("SMA", closes, len) || 0;
  const ranges = highs.slice(-len).map((h, i) => h - lows.slice(-len)[i]);
  const rangeMa = ranges.reduce((a, b) => a + b, 0) / len;
  const upperKC = kcMa + rangeMa * 1.5;
  const lowerKC = kcMa - rangeMa * 1.5;

  const squeezing = lowerBB > lowerKC && upperBB < upperKC;
  // Momentum: linear regression of price relative to KC midpoint
  const kcMid = (upperKC + lowerKC) / 2;
  const lastPrice = closes[closes.length - 1];
  const momentum = ((lastPrice - kcMid) / (kcMid || 1)) * 100;

  return { squeezing, momentum, ready: squeezing && Math.abs(momentum) < 0.5 };
}

// --- BOS/CHoCH (Break of Structure / Change of Character) ---
function detectBOS(candles) {
  if (!candles || candles.length < 30) return { patterns: [], trend: "lateral" };
  const patterns = [];
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);

  // Find swing highs/lows (5-bar pivot)
  const swingHighs = [], swingLows = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2])
      swingHighs.push({ price: highs[i], index: i });
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2])
      swingLows.push({ price: lows[i], index: i });
  }

  if (swingHighs.length < 2 || swingLows.length < 2) return { patterns: [], trend: "lateral" };

  // Determine trend from last 3 swings
  const last3Highs = swingHighs.slice(-3);
  const last3Lows = swingLows.slice(-3);
  const hh = last3Highs.length >= 2 && last3Highs[last3Highs.length - 1].price > last3Highs[last3Highs.length - 2].price;
  const ll = last3Lows.length >= 2 && last3Lows[last3Lows.length - 1].price < last3Lows[last3Lows.length - 2].price;
  const lh = last3Highs.length >= 2 && last3Highs[last3Highs.length - 1].price < last3Highs[last3Highs.length - 2].price;
  const hl = last3Lows.length >= 2 && last3Lows[last3Lows.length - 1].price > last3Lows[last3Lows.length - 2].price;

  let trend = "lateral";
  if (hh && !lh) trend = "bullish";
  if (ll && !hl) trend = "bearish";

  // Check BOS: price breaks the last swing high/low in trend direction
  if (trend === "bullish" && swingHighs.length >= 2) {
    const lastSH = swingHighs[swingHighs.length - 2];
    const currentClose = closes[closes.length - 1];
    if (currentClose > lastSH.price) {
      patterns.push({ type: "bos_bull", name: "BOS (Quebra de Alta)", signal: "compra", strength: "alto",
        desc: `Preco (${currentClose.toFixed(2)}) rompeu topo anterior (${lastSH.price.toFixed(2)}) — tendencia altista confirmada` });
    }
  }

  if (trend === "bearish" && swingLows.length >= 2) {
    const lastSL = swingLows[swingLows.length - 2];
    const currentClose = closes[closes.length - 1];
    if (currentClose < lastSL.price) {
      patterns.push({ type: "bos_bear", name: "BOS (Quebra de Baixa)", signal: "venda", strength: "alto",
        desc: `Preco (${currentClose.toFixed(2)}) rompeu fundo anterior (${lastSL.price.toFixed(2)}) — tendencia baixista confirmada` });
    }
  }

  // Check CHoCH: change of character (price breaks a swing point against trend)
  if (trend === "bullish" && swingLows.length >= 2) {
    const lastSL = swingLows[swingLows.length - 2];
    const currentLow = lows[lows.length - 1];
    if (currentLow < lastSL.price) {
      patterns.push({ type: "choch_bear", name: "CHoCH (Mudanca de Carater)", signal: "venda", strength: "alto",
        desc: `Preco fez fundo mais baixo (${currentLow.toFixed(2)}) — possivel reversao baixista` });
    }
  }

  if (trend === "bearish" && swingHighs.length >= 2) {
    const lastSH = swingHighs[swingHighs.length - 2];
    const currentHigh = highs[highs.length - 1];
    if (currentHigh > lastSH.price) {
      patterns.push({ type: "choch_bull", name: "CHoCH (Mudanca de Carater)", signal: "compra", strength: "alto",
        desc: `Preco fez topo mais alto (${currentHigh.toFixed(2)}) — possivel reversao altista` });
    }
  }

  return { patterns, trend };
}

// --- Fair Value Gap (FVG) ---
function detectFVG(candles) {
  if (!candles || candles.length < 4) return [];
  const patterns = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish FVG: prev high < next low (gap up that didn't fill)
    if (curr.l > prev.h && next.l > prev.h) {
      if (i >= candles.length - 3) {
        patterns.push({ type: "fvg_bull", name: "FVG Altista", signal: "compra", strength: "alto",
          desc: `Gap nao preenchido ${prev.h.toFixed(2)}-${curr.l.toFixed(2)} — zona de interesse compradora` });
      }
    }
    // Bearish FVG: prev low > next high (gap down that didn't fill)
    if (curr.h < prev.l && next.h < prev.l) {
      if (i >= candles.length - 3) {
        patterns.push({ type: "fvg_bear", name: "FVG Baixista", signal: "venda", strength: "alto",
          desc: `Gap nao preenchido ${curr.h.toFixed(2)}-${prev.l.toFixed(2)} — zona de interesse vendedora` });
      }
    }
  }
  return patterns;
}

// --- Order Blocks (ICT-style) ---
function detectOrderBlocks(candles, trend) {
  if (!candles || candles.length < 10) return [];
  const patterns = [];
  // Look for the last candle before a strong directional move
  for (let i = Math.max(0, candles.length - 15); i < candles.length - 2; i++) {
    const obCandle = candles[i];
    const next = candles[i + 1];
    const next2 = candles[i + 2];
    const movePct = Math.abs(next2.c - obCandle.c) / (obCandle.c || 1) * 100;

    if (movePct > 1.5) {
      // Bullish OB: big green move after this candle
      if (next2.c > next2.o && next2.c > obCandle.h && obCandle.c < obCandle.o) {
        if (i >= candles.length - 5) {
          patterns.push({ type: "ob_bull", name: "Order Block (Compra)", signal: "compra", strength: "alto",
            desc: `Ultimo candle baixista antes do rompimento. Zona: ${obCandle.l.toFixed(2)}-${obCandle.h.toFixed(2)}` });
        }
        break;
      }
      // Bearish OB: big red move after this candle
      if (next2.c < next2.o && next2.c < obCandle.l && obCandle.c > obCandle.o) {
        if (i >= candles.length - 5) {
          patterns.push({ type: "ob_bear", name: "Order Block (Venda)", signal: "venda", strength: "alto",
            desc: `Ultimo candle altista antes da queda. Zona: ${obCandle.l.toFixed(2)}-${obCandle.h.toFixed(2)}` });
        }
        break;
      }
    }
  }
  return patterns;
}

// --- Volume Profile (VRVP-like) — find high volume nodes ---
function detectVRVP(candles) {
  if (!candles || candles.length < 50) return { poc: null, support: null, resistance: null };
  const priceLevels = {};
  const totalVol = candles.reduce((s, c) => s + c.vol, 0);
  if (totalVol === 0) return { poc: null, support: null, resistance: null };

  // Bin prices into buckets (24 rows like VRVP)
  const allPrices = candles.flatMap(c => [c.h, c.l]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const bucketSize = (maxP - minP) / 24 || 1;

  for (const c of candles) {
    const bucket = Math.floor((c.l - minP) / bucketSize);
    const volShare = c.vol / totalVol * 100;
    for (let b = Math.floor((c.l - minP) / bucketSize); b <= Math.floor((c.h - minP) / bucketSize); b++) {
      const key = Math.round(b * bucketSize + minP);
      priceLevels[key] = (priceLevels[key] || 0) + volShare / ((c.h - c.l) / bucketSize || 1);
    }
  }

  // Find POC (Point of Control) = price with highest volume
  let poc = null, maxVol = 0;
  for (const [price, vol] of Object.entries(priceLevels)) {
    if (vol > maxVol) { maxVol = vol; poc = parseFloat(price); }
  }

  // Find support (highest volume below POC) and resistance (highest volume above POC)
  let support = null, resistance = null, supVol = 0, resVol = 0;
  for (const [price, vol] of Object.entries(priceLevels)) {
    const p = parseFloat(price);
    if (p < poc && vol > supVol) { supVol = vol; support = p; }
    if (p > poc && vol > resVol) { resVol = vol; resistance = p; }
  }

  return { poc, support, resistance, levels: priceLevels };
}

// --- MIDAS / Bull Market Support Band ---
function bullMarketSupport(closes) {
  if (!closes || closes.length < 50) return { support: null, band: null };
  // VWMA with period 21
  const period = 21;
  const recent = closes.slice(-period);
  if (recent.length < period) return { support: null, band: null };
  const vwma = recent.reduce((s, v) => s + v, 0) / period;
  const sma50 = ma("SMA", closes, 50);
  return { support: sma50, band: vwma };
}

// --- Premium / Discount Zones based on VRVP ---
function premiumDiscountZones(vrvp, currentPrice) {
  if (!vrvp.poc) return { zone: "unknown", premium: null, discount: null, equilibrium: null };
  const poc = vrvp.poc;
  const highNode = vrvp.resistance || poc * 1.02;
  const lowNode = vrvp.support || poc * 0.98;

  // Premium: price above POC by > 2%
  const pctFromPOC = ((currentPrice - poc) / poc) * 100;
  let zone = "equilibrium";
  if (pctFromPOC > 2) zone = "premium";
  else if (pctFromPOC < -2) zone = "discount";

  return {
    zone,
    premium: poc * 1.02,
    equilibrium: poc,
    discount: poc * 0.98,
    pctFromPOC: pctFromPOC.toFixed(2),
  };
}

// --- Composite Market Score (unifies all indicators) ---
function institutionalScore(candles, learning) {
  if (!candles || candles.length < 21) return { scores: {}, mercado: "lateral", confianca: 0, indicators: {} };
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);

  // 1. Didi Index
  const didi = didiIndex(closes);

  // 2. QQE
  const qqeResult = qqe(closes);

  // 3. Squeeze Momentum
  const squeeze = squeezeMomentum(closes, highs, lows);

  // 4. BOS/CHoCH
  const bos = detectBOS(candles);

  // 5. RSI on steroids (7-period RSI with 3-level EMAs)
  const rsiCloses = closes;
  let rsiGains = 0, rsiLosses = 0;
  for (let i = 1; i < Math.min(8, rsiCloses.length); i++) {
    const d = rsiCloses[rsiCloses.length - i] - rsiCloses[rsiCloses.length - i - 1];
    if (d > 0) rsiGains += d; else rsiLosses -= d;
  }
  const rsi = rsiLosses === 0 ? 100 : 100 - (100 / (1 + rsiGains / Math.max(rsiLosses, 0.001)));
  const rsiEma1 = ma("EMA", closes.slice(-5).map(() => rsi), 3) || rsi;
  const rsiEma2 = ma("EMA", closes.slice(-12).map(() => rsi), 10) || rsi;

  // 6. Classify market
  let mercado = "lateral";
  const didiDirection = didi.trend;
  const trendStrength = Math.abs(didi.didi);
  const vol = parseFloat(candles[candles.length - 1]?.vol || 0);

  if (didiDirection === "bullish" && trendStrength > 0.5) mercado = "tendencia_alta";
  else if (didiDirection === "bearish" && trendStrength > 0.5) mercado = "tendencia_baixa";
  else if (squeeze.squeezing === false && Math.abs(squeeze.momentum) > 2) mercado = "volatil";

  // 7. Strategy scores based on DIDI + QQE + Squeeze
  const scores = {
    rsi_scalper: rsi < 30 || rsi > 70 ? 80 : (rsi < 40 || rsi > 60) ? 65 : 35,
    ema_cross: mercado === "tendencia_alta" || mercado === "tendencia_baixa" ? Math.round(50 + trendStrength * 20) : 25,
    bb_reversal: squeeze.squeezing ? 75 : (rsiEma1 < 30 || rsiEma1 > 70) ? 65 : 30,
    macd_momentum: Math.abs(squeeze.momentum) > 1 ? Math.round(50 + Math.abs(squeeze.momentum) * 10) : 30,
    grid_scalper: mercado === "lateral" && squeeze.squeezing ? 80 : 15,
    smart_breakout: !squeeze.squeezing && Math.abs(squeeze.momentum) > 2 ? 85 : 20,
  };

  const w = learning.weights || {};
  for (const [id, raw] of Object.entries(scores)) {
    const weight = w[id]?.[mercado] || 0.5;
    scores[id] = Math.round(raw * weight);
  }

  const confianca = Math.round(Math.min(90, 50 + trendStrength * 10 + (rsi > 30 && rsi < 70 ? 10 : 0) + (squeeze.squeezing ? 5 : 0)));

  return {
    scores,
    mercado,
    confianca,
    indicators: {
      didi: { curta: didi.curta.toFixed(2), longa: didi.longa.toFixed(2), trend: didi.trend, value: didi.didi.toFixed(2) },
      qqe: { line: qqeResult.line.toFixed(1), dar: qqeResult.dar.toFixed(2), trend: qqeResult.trend },
      squeeze: { active: squeeze.squeezing, momentum: squeeze.momentum.toFixed(2), ready: squeeze.ready },
      bos: { trend: bos.trend, patterns: bos.patterns.length },
      rsi: { value: rsi.toFixed(1), ema1: rsiEma1.toFixed(1), ema2: rsiEma2.toFixed(1) },
    },
  };
}

// Multi-asset institutional scoring: average across all active assets
function institutionalScoreMulti(statsMap, learning) {
  const syms = Object.keys(statsMap);
  if (!syms.length) return { scores: {}, mercado: "lateral", confianca: 0, por_ativo: {}, indicators: {} };

  const results = {};
  for (const sym of syms) {
    const tfData = statsMap[sym];
    const candles = tfData?.["5m"]?._candles || tfData?.["15m"]?._candles;
    const stat = tfData?.["5m"] || tfData?.["15m"];
    if (candles && candles.length >= 21) {
      results[sym] = institutionalScore(candles, learning);
    } else if (stat) {
      // Fallback: use calcStats directly to build a simplified score
      const rsi = parseFloat(stat.rsi || 50);
      const trend = parseFloat(stat.trend || 0);
      const vol = parseFloat(stat.volatility || 0.5);
      const bbPos = stat.bbPos || "meio";
      let mercado = "lateral";
      if (Math.abs(trend) > 3 && vol > 0.5) mercado = trend > 0 ? "tendencia_alta" : "tendencia_baixa";
      else if (vol > 0.8) mercado = "volatil";

      const scores = {
        rsi_scalper: rsi < 30 || rsi > 70 ? 80 : (rsi < 40 || rsi > 60) ? 65 : 35,
        ema_cross: Math.abs(trend) > 2 ? 75 : 25,
        bb_reversal: (bbPos === "inferior" || bbPos === "superior") ? 70 : 30,
        macd_momentum: Math.abs(trend) > 1.5 ? 70 : 30,
        grid_scalper: mercado === "lateral" && vol < 0.4 ? 80 : 15,
        smart_breakout: vol > 0.6 && Math.abs(trend) > 2 ? 80 : 20,
      };
      const w = learning.weights || {};
      for (const [id, raw] of Object.entries(scores)) {
        scores[id] = Math.round(raw * (w[id]?.[mercado] || 0.5));
      }
      const conf = Math.round(Math.min(85, 50 + Math.abs(trend) * 2 + (rsi > 30 && rsi < 70 ? 10 : 0)));
      results[sym] = { scores, mercado, confianca: conf, indicators: { rsi: { value: rsi.toFixed(1) } } };
    }
  }

  const vals = Object.values(results);
  if (!vals.length) return { scores: {}, mercado: "lateral", confianca: 0, por_ativo: {}, indicators: {} };

  const stratIds = ["rsi_scalper", "ema_cross", "bb_reversal", "macd_momentum", "grid_scalper", "smart_breakout"];
  const avgScores = {};
  for (const id of stratIds) {
    let sum = 0, count = 0;
    for (const r of vals) { if (r.scores && r.scores[id] !== undefined) { sum += r.scores[id]; count++; } }
    avgScores[id] = count ? Math.round(sum / count) : 50;
  }

  const marketCounts = {};
  for (const r of vals) { marketCounts[r.mercado] = (marketCounts[r.mercado] || 0) + 1; }
  let bestMarket = "lateral", bestMC = 0;
  for (const [m, c] of Object.entries(marketCounts)) { if (c > bestMC) { bestMarket = m; bestMC = c; } }
  const avgConf = Math.round(vals.reduce((s, r) => s + r.confianca, 0) / vals.length);

  // Aggregate indicators
  const aggIndicators = {};
  for (const sym of Object.keys(results)) {
    aggIndicators[sym] = results[sym].indicators;
  }

  return { scores: avgScores, mercado: bestMarket, confianca: avgConf, por_ativo: aggIndicators };
}

// --- FULL ANALYSIS (cara, a cada 24h ou sob demanda) ---
async function fullAnalysis() {
  const syms = getActiveSymbols();
  if (!syms.length) return { error: "Nenhum ativo" };

  const analysisConfig = [
    { period: "7d", timeframes: [
      { bar: "5m", limit: 300 }, { bar: "15m", limit: 300 }, { bar: "1H", limit: 200 },
    ]},
    { period: "30d", timeframes: [
      { bar: "1H", limit: 300 }, { bar: "4H", limit: 300 }, { bar: "1D", limit: 100 },
    ]},
    { period: "60d", timeframes: [
      { bar: "4H", limit: 300 }, { bar: "1D", limit: 100 }, { bar: "1W", limit: 52 },
    ]},
    { period: "90d", timeframes: [
      { bar: "1D", limit: 150 }, { bar: "1W", limit: 52 }, { bar: "1M", limit: 36 },
    ]},
  ];

  const stratProfiles = [
    { id: "rsi_scalper", name: "RSI Scalper", ideal: "lateral/range", desc: "Funciona melhor em mercados sem tendencia, com RSI oscilando entre 30-70" },
    { id: "ema_cross", name: "EMA Cross", ideal: "tendencia", desc: "Funciona em mercados com tendencia definida, captura movimentos de medio prazo" },
    { id: "bb_reversal", name: "Bollinger Reversal", ideal: "volatil", desc: "Funciona em mercados volateis, com expansao e contracao de bandas" },
    { id: "macd_momentum", name: "MACD Momentum", ideal: "tendencia", desc: "Funciona em mercados com momentum forte e tendencia clara" },
    { id: "grid_scalper", name: "Grid Scalper", ideal: "lateral", desc: "Funciona em mercados extremamente laterais, sem tendencia" },
    { id: "smart_breakout", name: "Smart Breakout", ideal: "volatil", desc: "Funciona em rompimentos com volume alto e volatilidade crescente" },
  ];

  const md = {};
  for (const sym of syms) {
    md[sym] = {};
    for (const ac of analysisConfig) {
      md[sym][ac.period] = {};
      for (const tf of ac.timeframes) {
        const candles = await fetchCandles(sym, tf.bar, tf.limit);
        const s = calcStats(candles);
        if (s) { s._bar = tf.bar; if (tf.bar === "5m") s._candles = candles; md[sym][ac.period][tf.bar] = s; }
      }
    }
  }

  const learning = loadLearning();

  // Build per-asset stats for multi-asset scoring
  const perAssetStats = {};
  for (const sym of syms) {
    perAssetStats[sym] = {};
    for (const ac of analysisConfig) {
      for (const tf of ac.timeframes) {
        if (md[sym]?.[ac.period]?.[tf.bar]) {
          perAssetStats[sym][tf.bar] = md[sym][ac.period][tf.bar];
        }
      }
    }
  }
  const det = institutionalScoreMulti(perAssetStats, learning);

  const perAssetSummary = Object.entries(det.por_ativo || {}).map(([sym, ind]) => {
    if (!ind) return `${sym}: sem dados`;
    return `${sym}: Didi=${ind.didi?.trend} QQE=${ind.qqe?.trend} Squeeze=${ind.squeeze?.active ? "SIM" : "NAO"} RSI=${ind.rsi?.value}`;
  }).join("\n");

  const prompt = `ANALISE MACRO MULTI-TIMEFRAME (REFERENCIA 90 DIAS)

ATIVOS ATIVOS (${syms.length}): ${syms.join(", ")}
MERCADO DETECTADO (consenso): ${det.mercado}

POR ATIVO:
${perAssetSummary}

SCORE CONSOLIDADO:
${JSON.stringify(det.scores, null, 2)}

ESTRATEGIAS:
${stratProfiles.map(s => `- ${s.name} (${s.id}): ${s.ideal}. ${s.desc}`).join("\n")}

Responda EXATAMENTE este JSON:
{
  "rankings": [
    { "periodo": "7d", "melhor": "id", "justificativa": "...", "score": 85, "timeframe_recomendado": "5m" },
    { "periodo": "30d", "melhor": "...", "justificativa": "...", "score": 77, "timeframe_recomendado": "4H" },
    { "periodo": "60d", "melhor": "...", "justificativa": "...", "score": 72, "timeframe_recomendado": "1D" },
    { "periodo": "90d", "melhor": "...", "justificativa": "...", "score": 70, "timeframe_recomendado": "1D" }
  ],
  "recomendacao_geral": "id_melhor_estrategia_agora",
  "justificativa_geral": "texto",
  "mercado_atual": "${det.mercado}",
  "confianca": ${det.confianca},
  "analise_tecnica": "resumo RSI/EMA/Bollinger por timeframe",
  "sugestao_timeframe_operacional": "5m|15m|1H"
}`;

  const result = await callLLM(
    "Voce e um analista senior multi-timeframe. Refine o score matematico com sua experiencia. Responda APENAS JSON.",
    prompt
  );

  try {
    const parsed = JSON.parse(result);
    // Merge with deterministic scores for final learning
    parsed._deterministic = det;
    parsed._full = true;
    parsed._ts = Date.now();
    return parsed;
  } catch {
    // Fallback: use deterministic scores if LLM fails
    const best = Object.entries(det.scores).sort((a, b) => b[1] - a[1]);
    return {
      rankings: [
        { periodo: "7d", melhor: best[0][0], justificativa: "Score deterministico", score: best[0][1], timeframe_recomendado: "5m" },
        { periodo: "30d", melhor: best[0][0], justificativa: "Score deterministico", score: best[0][1], timeframe_recomendado: "4H" },
        { periodo: "60d", melhor: best[0][0], justificativa: "Score deterministico", score: best[0][1], timeframe_recomendado: "1D" },
        { periodo: "90d", melhor: best[0][0], justificativa: "Score deterministico", score: best[0][1], timeframe_recomendado: "1D" },
      ],
      recomendacao_geral: best[0][0],
      justificativa_geral: "Analise matematica pura (LLM indisponivel)",
      mercado_atual: det.mercado,
      confianca: det.confianca,
      analise_tecnica: `Score deterministico: mercado ${det.mercado}, confianca ${det.confianca}%`,
      sugestao_timeframe_operacional: "5m",
      _deterministic: det, _full: true, _ts: Date.now(),
    };
  }
}

// --- QUICK ANALYSIS is overridden below with pattern detection ---

// --- Main orchestrator ---
async function analyzeStrategies(forceFull = false) {
  const saved = loadAnalysis();
  const macroAge = Date.now() - saved.macroTs;
  const FULL_INTERVAL = 6 * 60 * 60 * 1000; // 6h

  let result;
  try {
    if (forceFull || !saved.macro || macroAge > FULL_INTERVAL) {
      console.log("[AI] Analise MACRO completa...");
      result = await fullAnalysis();
      saved.macro = result;
      saved.macroTs = Date.now();
    } else {
      result = await quickAnalysis();
      saved.quick = result;
      saved.quickTs = Date.now();
    }
  } catch (e) {
    console.error("[CRASH] analyzeStrategies:", e.stack || e.message);
    // Return a fallback result so the loop doesn't break
    result = { rankings: [], recomendacao_geral: "grid_scalper", mercado_atual: "lateral", confianca: 50, _full: false, _ts: Date.now(), error: e.message };
  }
  saveAnalysis(saved);

  // Store in recent history (last 7)
  const entry = { ts: Date.now(), tipo: result._full ? "macro" : "rapida", data: result };
  recentAnalyses.unshift(entry);
  if (recentAnalyses.length > 7) recentAnalyses = recentAnalyses.slice(0, 7);
  saveRecent(recentAnalyses);

  // Broadcast via WebSocket
  broadcastAnalysis(result);

  return result;
}

// --- Auto-Analysis Loop (sempre ativo — atualiza dashboard a cada 60s) ---
async function autoAnalysisLoop() {
  try {
    const result = await analyzeStrategies(false);
    if (result.recomendacao_geral && aiPilotActive) {
      // Auto-Pilot: switch strategy when active
      const bestId = result.recomendacao_geral;
      strategies.forEach(s => s.active = s.id === bestId);
      saveStrategies();
      console.log(`[AI-PILOT] ${bestId} (conf: ${result.confianca}%)`);
    }
  } catch (e) { console.error("[AUTO]", e.stack || e.message); }
}

function startAutoAnalysis() {
  if (aiPilotLoop) return;
  autoAnalysisLoop(); // run immediately
  aiPilotLoop = setInterval(autoAnalysisLoop, 60000);
  console.log("[AI] Analise automatica iniciada — a cada 60s");
}

function startAiPilot() {
  if (aiPilotActive) return;
  aiPilotActive = true;
  console.log("[AI-PILOT] ATIVADO — IA decide estrategia automaticamente");
}

function stopAiPilot() {
  aiPilotActive = false;
  console.log("[AI-PILOT] DESATIVADO");
}

// --- Learning loop: register result ---
async function learnFromResult(tradeResult) {
  // tradeResult = { strategy: "rsi_scalper", market: "lateral", profit: 1.5, closed: true }
  if (!tradeResult || !tradeResult.strategy) return;
  const results = loadResults();
  results.trades.push({ ...tradeResult, ts: Date.now() });
  saveResults(results);

  // Update learning weights
  const learning = loadLearning();
  const recent = results.trades.filter(t => t.closed).slice(-50);
  const byStrategy = {};
  recent.forEach(t => {
    if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { wins: 0, total: 0, profit: 0 };
    byStrategy[t.strategy].total++;
    byStrategy[t.strategy].profit += t.profit || 0;
    if (t.profit > 0) byStrategy[t.strategy].wins++;
  });

  // Adjust weights based on actual performance
  for (const [id, data] of Object.entries(byStrategy)) {
    if (data.total < 3) continue;
    const winRate = data.wins / data.total;
    const avgProfit = data.profit / data.total;
    const marketTypes = ["lateral", "volatil", "tendencia_alta", "tendencia_baixa"];
    for (const market of marketTypes) {
      const marketTrades = recent.filter(t => t.strategy === id && t.market === market);
      if (marketTrades.length < 2) continue;
      const marketWR = marketTrades.filter(t => t.profit > 0).length / marketTrades.length;
      const weight = 0.3 + (marketWR * 0.7);
      if (learning.weights[id]) learning.weights[id][market] = Math.round(weight * 10) / 10;
    }
  }
  learning.totalTrades = results.trades.length;
  learning.lastUpdate = Date.now();
  saveLearning(learning);

  // Also update pattern learning from active patterns at close time
  if (tradeResult.instId) {
    const base = tradeResult.instId.replace("-SWAP", "");
    const symKey = Object.keys(avatarState.patterns?.results || {}).find(k => k.includes(base.split("-")[0]));
    if (symKey && avatarState.patterns?.results?.[symKey]) {
      const entryPats = avatarState.patterns.results[symKey]
        .filter(p => p.strength === "alto")
        .map(p => p.type)
        .slice(0, 5);
      if (entryPats.length > 0) {
        updatePatternLearning({ entryPatterns: entryPats, profit: tradeResult.profit || 0, instId: tradeResult.instId });
      }
    }
  }

  // Clean position params for closed position
  if (tradeResult.instId) delete positionParams[tradeResult.instId];

  console.log(`[AI-LEARN] ${tradeResult.strategy}: ${tradeResult.profit > 0 ? 'WIN' : 'LOSS'} (${learning.totalTrades} trades)`);
}

// ============================================================
// PATTERN ENGINE — Smart Money + Candle + Volume
// ============================================================
let avatarState = {
  mood: "analisando", // analisando | confiante | alerta | aprendendo
  thought: "Iniciando analise dos graficos...",
  lastPattern: null,
  patternsFound: 0,
  confidence: 70,
  lastUpdate: Date.now(),
};

let recentPatterns = [];

function detectCandlePatterns(candles) {
  if (!candles || candles.length < 5) return [];
  const patterns = [];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  const prev3 = candles[candles.length - 4];
  const prev4 = candles[candles.length - 5];
  const body = Math.abs(last.c - last.o);
  const upperWick = last.h - Math.max(last.c, last.o);
  const lowerWick = Math.min(last.c, last.o) - last.l;
  const prevBody = Math.abs(prev.c - prev.o);
  const totalRange = last.h - last.l;

  if (totalRange === 0) return [];

  // Doji — indecision
  if (body / totalRange < 0.1) {
    patterns.push({ type: "doji", name: "Doji", signal: "indecisao", strength: "medio",
      desc: "Mercado indeciso — possivel reversao iminente" });
  }

  // Hammer — bullish reversal (long lower wick, small body at top)
  if (lowerWick > body * 2 && upperWick < body * 0.5 && last.c >= last.o) {
    patterns.push({ type: "hammer", name: "Martelo", signal: "compra", strength: "alto",
      desc: `Longa sombra inferior (${(lowerWick/totalRange*100).toFixed(0)}%) — pressao compradora` });
  }

  // Shooting Star — bearish reversal (long upper wick, small body at bottom)
  if (upperWick > body * 2 && lowerWick < body * 0.5 && last.c <= last.o) {
    patterns.push({ type: "shooting_star", name: "Estrela Cadente", signal: "venda", strength: "alto",
      desc: `Longa sombra superior (${(upperWick/totalRange*100).toFixed(0)}%) — rejeicao de alta` });
  }

  // Engulfing bullish
  if (last.c > last.o && prev.c < prev.o && body > prevBody && last.o < prev.c && last.c > prev.o) {
    patterns.push({ type: "engulfing_bull", name: "Engolfo de Alta", signal: "compra", strength: "alto",
      desc: `Candle verde engole o vermelho anterior — reversao altista` });
  }

  // Engulfing bearish
  if (last.c < last.o && prev.c > prev.o && body > prevBody && last.o > prev.c && last.c < prev.o) {
    patterns.push({ type: "engulfing_bear", name: "Engolfo de Baixa", signal: "venda", strength: "alto",
      desc: `Candle vermelho engole o verde anterior — reversao baixista` });
  }

  // Morning Star (3 candle pattern)
  if (candles.length >= 3) {
    if (prev2.c < prev2.o && Math.abs(prev2.c - prev2.o) / (prev2.h - prev2.l || 1) > 0.6 &&
        Math.abs(prev.c - prev.o) / (prev.h - prev.l || 1) < 0.1 &&
        last.c > last.o && last.c > (prev2.o + prev2.c) / 2) {
      patterns.push({ type: "morning_star", name: "Estrela da Manha", signal: "compra", strength: "alto",
        desc: "3 candles: baixa forte → indecisao → alta forte — reversao classica" });
    }
  }

  // Evening Star (3 candle pattern)
  if (candles.length >= 3) {
    if (prev2.c > prev2.o && Math.abs(prev2.c - prev2.o) / (prev2.h - prev2.l || 1) > 0.6 &&
        Math.abs(prev.c - prev.o) / (prev.h - prev.l || 1) < 0.1 &&
        last.c < last.o && last.c < (prev2.o + prev2.c) / 2) {
      patterns.push({ type: "evening_star", name: "Estrela da Tarde", signal: "venda", strength: "alto",
        desc: "3 candles: alta forte → indecisao → baixa forte — topo de tendencia" });
    }
  }

  // Inside Bar — consolidation
  if (last.h <= prev.h && last.l >= prev.l && body > 0) {
    patterns.push({ type: "inside_bar", name: "Inside Bar", signal: "indecisao", strength: "medio",
      desc: "Candle dentro do anterior — consolidacao, possivel explosao" });
  }

  return patterns;
}

function detectVolumePatterns(candles) {
  if (!candles || candles.length < 10) return [];
  const patterns = [];
  const vols = candles.map(c => c.vol);
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const lastVol = vols[vols.length - 1];
  const prevVol = vols[vols.length - 2];
  const volRatio = lastVol / (avgVol || 1);

  // Volume spike (2x+ media)
  if (volRatio > 2) {
    const lastCandle = candles[candles.length - 1];
    const direction = lastCandle.c > lastCandle.o ? "compra" : "venda";
    patterns.push({ type: "volume_spike", name: "Explosao de Volume", signal: direction, strength: "alto",
      desc: `Volume ${volRatio.toFixed(1)}x media — agressao de ${direction === "compra" ? "compradores" : "vendedores"}` });
  }

  // Climactic volume (volume shrinking after spike)
  if (volRatio > 1.5 && prevVol < avgVol * 0.7) {
    patterns.push({ type: "climax", name: "Volume Climatico", signal: "reversao", strength: "medio",
      desc: "Pico de volume seguido de queda — possivel exaustao" });
  }

  // Low volume pullback
  if (volRatio < 0.5 && candles.length >= 3) {
    const movement = ((candles[candles.length - 1].c - candles[candles.length - 3].c) / (candles[candles.length - 3].c || 1)) * 100;
    if (Math.abs(movement) > 1) {
      patterns.push({ type: "low_vol_pullback", name: "Pullback de Baixo Volume", signal: movement > 0 ? "compra" : "venda", strength: "medio",
        desc: `Movimento de ${movement.toFixed(1)}% com volume ${volRatio.toFixed(1)}x — fraco, possivel continuacao` });
    }
  }

  // Volume divergence (price up, volume down OR price down, volume up)
  if (candles.length >= 5) {
    const priceChange5 = ((candles[candles.length - 1].c - candles[candles.length - 5].c) / (candles[candles.length - 5].c || 1)) * 100;
    const volAvg5 = candles.slice(-5).reduce((s, c) => s + c.vol, 0) / 5;
    const volAvgPrev5 = candles.slice(-10, -5).reduce((s, c) => s + c.vol, 0) / 5;
    if (priceChange5 > 2 && volAvg5 < volAvgPrev5 * 0.7) {
      patterns.push({ type: "volume_divergence_bear", name: "Divergencia de Volume (Baixa)", signal: "venda", strength: "alto",
        desc: `Preco sobe ${priceChange5.toFixed(1)}% mas volume cai — movimento fraco, possivel reversao` });
    }
    if (priceChange5 < -2 && volAvg5 > volAvgPrev5 * 1.5) {
      patterns.push({ type: "volume_divergence_bull", name: "Divergencia de Volume (Alta)", signal: "compra", strength: "alto",
        desc: `Preco cai ${Math.abs(priceChange5).toFixed(1)}% mas volume aumenta — acumulacao` });
    }
  }

  return patterns;
}

function detectSmartMoneyPatterns(candles) {
  if (!candles || candles.length < 20) return [];
  const patterns = [];

  // Liquidity sweep — long wick taking out previous swing high/low
  if (candles.length >= 10) {
    const last = candles[candles.length - 1];
    const prev10 = candles.slice(-10, -1);
    const maxPrev = Math.max(...prev10.map(c => c.h));
    const minPrev = Math.min(...prev10.map(c => c.l));
    const body = Math.abs(last.c - last.o);
    const upperWick = last.h - Math.max(last.c, last.o);
    const lowerWick = Math.min(last.c, last.o) - last.l;
    const totalRange = last.h - last.l;

    // Sweep above resistance
    if (last.h > maxPrev && upperWick > body * 1.5 && last.c < maxPrev) {
      patterns.push({ type: "liquidity_sweep_short", name: "Varredura de Liquidez (ALTA)", signal: "venda", strength: "alto",
        desc: `Tomou o topo anterior (${maxPrev.toFixed(2)}) e rejeitou — smart money vendendo` });
    }
    // Sweep below support
    if (last.l < minPrev && lowerWick > body * 1.5 && last.c > minPrev) {
      patterns.push({ type: "liquidity_sweep_long", name: "Varredura de Liquidez (BAIXA)", signal: "compra", strength: "alto",
        desc: `Tomou o fundo anterior (${minPrev.toFixed(2)}) e rejeitou — smart money comprando` });
    }
  }

  // Order Block Detection (consolidation + breakout)
  if (candles.length >= 15) {
    // Find tight consolidation zones
    for (let i = candles.length - 15; i < candles.length - 3; i++) {
      const chunk = candles.slice(i, i + 5);
      const highs = chunk.map(c => c.h);
      const lows = chunk.map(c => c.l);
      const maxH = Math.max(...highs);
      const minL = Math.min(...lows);
      const rangePct = ((maxH - minL) / (minL || 1)) * 100;
      if (rangePct < 1.5 && rangePct > 0.1) {
        // Check if there's a breakout after this consolidation
        const after = candles.slice(i + 5, i + 10);
        if (after.length >= 3) {
          const afterHigh = Math.max(...after.map(c => c.h));
          const afterLow = Math.min(...after.map(c => c.l));
          if (afterHigh > maxH * 1.01 && after[after.length-1].c > after[after.length-1].o) {
            patterns.push({ type: "order_block_bull", name: "Bloco de Ordens (ALTA)", signal: "compra", strength: "alto",
              desc: `Zona de consolidacao (${(maxH-minL).toFixed(2)}) seguida de rompimento — OB comprador` });
            break;
          }
          if (afterLow < minL * 0.99 && after[after.length-1].c < after[after.length-1].o) {
            patterns.push({ type: "order_block_bear", name: "Bloco de Ordens (BAIXA)", signal: "venda", strength: "alto",
              desc: `Zona de consolidacao (${(maxH-minL).toFixed(2)}) seguida de queda — OB vendedor` });
            break;
          }
        }
      }
    }
  }

  // Absorption pattern — price stuck in range with high volume
  if (candles.length >= 10) {
    const recent10 = candles.slice(-10);
    const range = Math.max(...recent10.map(c => c.h)) - Math.min(...recent10.map(c => c.l));
    const avgRange = candles.slice(-30, -10).reduce((s, c) => s + (c.h - c.l), 0) / 20;
    const avgVol10 = recent10.reduce((s, c) => s + c.vol, 0) / 10;
    const avgVol30 = candles.slice(-30).reduce((s, c) => s + c.vol, 0) / 30;
    if (range < avgRange * 0.6 && avgVol10 > avgVol30 * 1.3) {
      patterns.push({ type: "absorption", name: "Absorcao", signal: "indecisao", strength: "medio",
        desc: `Range estreito (${range.toFixed(2)}) com alto volume — smart money absorvendo ordens` });
    }
  }

  return patterns;
}

function analyzePatterns(microData) {
  const results = {};
  let totalPatterns = 0;
  for (const [sym, tfs] of Object.entries(microData)) {
    const symPatterns = [];
    for (const tf of ["5m", "15m"]) {
      const candles = tfs[tf]?._candles;
      if (!candles || candles.length < 5) continue;
      const candlePats = detectCandlePatterns(candles);
      const volPats = detectVolumePatterns(candles);
      const smPats = detectSmartMoneyPatterns(candles);
      candlePats.forEach(p => { p.timeframe = tf; p.symbol = sym; symPatterns.push(p); });
      volPats.forEach(p => { p.timeframe = tf; p.symbol = sym; symPatterns.push(p); });
      smPats.forEach(p => { p.timeframe = tf; p.symbol = sym; symPatterns.push(p); });
    }
    results[sym] = symPatterns;
    totalPatterns += symPatterns.length;
  }
  return { results, totalPatterns };
}

function updateAvatarState(patterns, analysisResult) {
  const now = Date.now();
  const pCount = patterns.totalPatterns || 0;

  // Build thought based on what was found + institutional indicators
  let thought = "";
  let mood = "analisando";

  const ind = analysisResult?.indicators || analysisResult?.por_ativo;

  // Check institutional indicators first
  if (analysisResult?.mercado && analysisResult?.confianca) {
    const mkt = analysisResult.mercado;
    const conf = analysisResult.confianca;
    const didiTrend = analysisResult.por_ativo?.[Object.keys(analysisResult.por_ativo || {})[0]]?.didi?.trend;
    const squeeze = analysisResult.por_ativo?.[Object.keys(analysisResult.por_ativo || {})[0]]?.squeeze;

    if (squeeze?.ready) {
      thought = `⚡ SQUEEZE READY! Mercado ${mkt} comprimido — explosao iminente. ${didiTrend ? `Didi: ${didiTrend}` : ""}`;
      mood = "alerta";
    }
  }

  if (thought === "") {
    if (pCount === 0) {
      thought = `Varrendo graficos. Didi ${analysisResult?.mercado === "tendencia_alta" ? "🟢" : analysisResult?.mercado === "tendencia_baixa" ? "🔴" : "⏸️"} Conf: ${analysisResult?.confianca || 0}%`;
      mood = "analisando";
    } else {
      const highSignals = [];
      const signals = [];
      for (const [sym, pats] of Object.entries(patterns.results)) {
        for (const p of pats) {
          if (p.strength === "alto") highSignals.push(p);
          signals.push(p);
        }
      }

      // Priority: BOS > Liquidity Sweep > Squeeze > OB > FVG > classic
      const bosPat = signals.find(p => p.type.includes("bos") || p.type.includes("choch"));
      const liqPat = signals.find(p => p.type.includes("liquidity_sweep"));
      const squeezePat = signals.find(p => p.type.includes("squeeze"));
      const obPat = signals.find(p => p.type.includes("ob_") || p.type.includes("order_block"));
      const fvgPat = signals.find(p => p.type.includes("fvg"));

      const priority = bosPat || liqPat || squeezePat || obPat || fvgPat || (highSignals.length ? highSignals[0] : null);
      if (priority) {
        const dir = priority.signal === "compra" ? "🟢 COMPRA" : priority.signal === "venda" ? "🔴 VENDA" : "⚠️";
        thought = `${dir}: ${priority.name} — ${priority.desc}`;
        mood = priority.strength === "alto" ? "confiante" : "aprendendo";
        if (bosPat) mood = "confiante";
      } else if (signals.length >= 3) {
        mood = "aprendendo";
        thought = `${signals.length} padroes. ${signals[0].name}, ${signals[1].name}...`;
      } else {
        thought = `${signals[0]?.name || "Padrao"} em ${signals[0]?.symbol || "?"}.`;
        mood = "aprendendo";
      }
    }
  }

  const conf = analysisResult?.confianca ?? avatarState.confidence;

  avatarState = {
    mood,
    thought,
    lastPattern: patterns.totalPatterns > 0 ? thought : avatarState.lastPattern,
    patternsFound: avatarState.patternsFound + pCount,
    confidence: conf,
    mercado: analysisResult?.mercado || "lateral",
    indicators: analysisResult?.por_ativo || {},
    lastUpdate: now,
    patterns: patterns,
  };
}

function broadcastAvatar() {
  const msg = JSON.stringify({ type: "avatar", data: avatarState });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function broadcastPatterns(patterns) {
  const msg = JSON.stringify({ type: "patterns", data: patterns });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// ============================================================
// ADAPTIVE LEARNING ENGINE — aprende com padroes, evita traps
// ============================================================

// Pattern learning persistence
function loadPatternLearning() {
  try { return JSON.parse(fs.readFileSync(PATTERN_LEARNING_FILE, "utf8")); }
  catch {
    const def = { patternWinRates: {}, totalTracked: 0, lastUpdate: 0 };
    for (const t of ["bos_bull","bos_bear","choch_bull","choch_bear","fvg_bull","fvg_bear","ob_bull","ob_bear","liquidity_sweep_long","liquidity_sweep_short","volume_spike","absorption","hammer","shooting_star","engulfing_bull","engulfing_bear","morning_star","evening_star","inside_bar","vrvp"]) {
      def.patternWinRates[t] = { wins: 0, losses: 0, profit: 0, avgMove: 0, trapCount: 0, reliability: 0.5, totalCount: 0 };
    }
    return def;
  }
}
function savePatternLearning(p) { fs.writeFileSync(PATTERN_LEARNING_FILE, JSON.stringify(p, null, 2)); }

function loadTrapLog() {
  try { return JSON.parse(fs.readFileSync(TRAP_LOG_FILE, "utf8")); }
  catch { return { traps: [] }; }
}
function saveTrapLog(t) { fs.writeFileSync(TRAP_LOG_FILE, JSON.stringify(t, null, 2)); }

function loadAutoTradeState() {
  try { return JSON.parse(fs.readFileSync(AUTO_TRADE_STATE_FILE, "utf8")); }
  catch { return { totalEntries: 0, wins: 0, losses: 0, profit: 0, lastEntry: 0 }; }
}
function saveAutoTradeState(s) { fs.writeFileSync(AUTO_TRADE_STATE_FILE, JSON.stringify(s, null, 2)); }

// --- TRAP DETECTION — Smart Money traps (fakeouts) ---
function detectTraps(candles, patterns) {
  if (!candles || candles.length < 20) return { traps: [], fakeout: false };
  const traps = [];
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);

  // Find latest liquidity sweep patterns
  const sweeps = patterns.filter(p => p.type.includes("liquidity_sweep"));
  for (const sweep of sweeps) {
    const idx = candles.length - 1;
    const last = candles[idx];
    const prev3 = candles.slice(idx - 4, idx);
    const movement = ((last.c - prev3[0]?.c || last.c) / (prev3[0]?.c || 1)) * 100;

    // Trap type 1: Sweep + immediate reversal (wick rejection)
    if (sweep.type.includes("long")) {
      // Bullish sweep that fails: price swept below support but closed back above
      if (last.c > prev3[prev3.length - 1]?.c) {
        // Check if it's a real reversal or fake
        const afterCandles = candles.slice(-3);
        const recovery = afterCandles[afterCandles.length - 1]?.c > afterCandles[0]?.c;
        if (!recovery) {
          traps.push({ type: "trap_bull_fail", name: "Armadilha de Alta (Fakeout)", signal: "venda", strength: "alto",
            desc: `Varredura de liquidez sem seguimento — smart money caçando stops compradores` });
        }
      }
    }
    if (sweep.type.includes("short")) {
      if (last.c < prev3[prev3.length - 1]?.c) {
        const afterCandles = candles.slice(-3);
        const recovery = afterCandles[afterCandles.length - 1]?.c < afterCandles[0]?.c;
        if (!recovery) {
          traps.push({ type: "trap_bear_fail", name: "Armadilha de Baixa (Fakeout)", signal: "compra", strength: "alto",
            desc: `Varredura de liquidez sem seguimento — smart money caçando stops vendedores` });
        }
      }
    }
  }

  // Trap type 2: Absorption after sweep (accumulation trap)
  const last10 = candles.slice(-10);
  const range = Math.max(...last10.map(c => c.h)) - Math.min(...last10.map(c => c.l));
  const avgRange = candles.slice(-30).reduce((s, c) => s + (c.h - c.l), 0) / 30;
  const vols = last10.map(c => c.vol);
  const avgVol = vols.reduce((a, b) => a + b, 0) / 10;
  const avgVol30 = candles.slice(-30).reduce((s, c) => s + c.vol, 0) / 30;

  if (sweeps.length > 0 && range < avgRange * 0.7 && avgVol > avgVol30 * 1.2) {
    traps.push({ type: "trap_absorption", name: "Armadilha de Absorcao", signal: "indecisao", strength: "alto",
      desc: `Varredura seguida de absorcao — smart money acumulando/distribuindo` });
  }

  // Trap type 3: Consecutive sweeps of the same level (liquidity grab)
  let sameLevelSweeps = 0;
  for (let i = patterns.length - 1; i >= Math.max(0, patterns.length - 15); i--) {
    if (patterns[i]?.type?.includes("sweep")) sameLevelSweeps++;
  }
  if (sameLevelSweeps >= 2) {
    traps.push({ type: "trap_multi_sweep", name: "Multiplas Varreduras", signal: "indecisao", strength: "alto",
      desc: `${sameLevelSweeps}x varredura no mesmo nivel — provavel liquidez sendo caçada, nao rompimento real` });
  }

  // Trap type 4: BOS failure (breakout that reverses)
  const bosPats = patterns.filter(p => p.type.includes("bos"));
  for (const bos of bosPats) {
    if (candles.length >= 3) {
      const lastC = candles[candles.length - 1];
      const prevC = candles[candles.length - 2];
      // Check if BOS is being rejected
      if (bos.signal === "compra" && lastC.c < prevC.o) {
        traps.push({ type: "trap_bos_fail_bull", name: "Falso BOS de Alta", signal: "venda", strength: "alto",
          desc: "BOS altista falhou — stop hunt antes de verdadeira direcao" });
      }
      if (bos.signal === "venda" && lastC.c > prevC.o) {
        traps.push({ type: "trap_bos_fail_bear", name: "Falso BOS de Baixa", signal: "compra", strength: "alto",
          desc: "BOS baixista falhou — stop hunt antes de verdadeira direcao" });
      }
    }
  }

  const fakeout = traps.length > 0;
  return { traps, fakeout };
}

// --- ADAPTIVE TRADE PARAMETERS ---
function adaptiveTradeParams(setupConfidence, patternTypes, mercado) {
  // Base params — AI adaptativo default (SL 3%, TP 5%, R:R favorável)
  let sl = 3;
  let tp = 5;
  let stake = tradingConfig.stake_amount || 5;
  let maxTrades = tradingConfig.max_open_trades || 10;
  let useTrailing = tradingConfig.trailing_stop !== false;

  // Pattern-based adjustments
  const hasBOS = patternTypes.some(t => t.includes("bos") && !t.includes("trap"));
  const hasSqueeze = patternTypes.some(t => t.includes("squeeze"));
  const hasFVG = patternTypes.some(t => t.includes("fvg"));
  const hasOB = patternTypes.some(t => t.includes("ob_"));
  const hasTrap = patternTypes.some(t => t.includes("trap"));

  // If trap detected, wait — don't enter
  if (hasTrap) return { shouldEnter: false, sl: null, tp: null, stake: 0, reason: "Trap detectado — aguardando confirmacao" };

  // Adjust SL/TP by signal quality
  if (hasBOS) { sl = 2.5; tp = 5; }      // BOS confirmado = SL justo
  else if (hasFVG) { sl = 4; tp = 6; }   // FVG = gap, mais espaço
  else if (hasSqueeze) { sl = 5; tp = 6; } // Squeeze = explosão
  else if (hasOB) { sl = 3.5; tp = 5; }  // OB = zona média

  // Kelly Criterion sizing by confidence
  const kelly = kellyFraction(Math.min(0.6, setupConfidence / 140), tp, sl); // WR ~ conf/140 capped 60%
  let stakeFinal = Math.max(1, Math.round(stake * kelly * 2.5));

  if (setupConfidence >= 85) { stakeFinal = Math.round(stakeFinal * 1.2); }
  else if (setupConfidence < 75) { stakeFinal = Math.max(1, Math.round(stakeFinal * 0.7)); }

  // Trend-following: let it run
  if (mercado === "tendencia_alta" || mercado === "tendencia_baixa") {
    tp = Math.max(tp, 6);
    useTrailing = true;
  }

  return { shouldEnter: true, sl: sl * -1, tp, stake: stakeFinal, useTrailing, maxTrades, reason: `Conf: ${setupConfidence}% | SL: ${sl}% | TP: ${tp}%` };
}

// --- AUTO ENTRY CHECK ---
// Combines candle patterns + institutional indicators (Didi/QQE/BOS/RSI)
// Entry needs: strong pattern, OR (medium patterns + indicator agreement)
function checkAutoEntries(patterns, indicators, mercado, confianca) {
  const entries = [];

  // Strong patterns = high confidence signal types (BOS, FVG, OB, sweep)
  const STRONG_TYPES = ["bos_", "choch_", "fvg_", "ob_", "liquidity_sweep", "engulfing", "morning_star", "evening_star", "hammer", "shooting_star"];

  for (const [sym, pats] of Object.entries(patterns.results || {})) {
    if (!pats || pats.length === 0) continue;

    const highPats = pats.filter(p => p.strength === "alto");
    const strongPats = highPats.filter(p => STRONG_TYPES.some(t => p.type.includes(t)));
    const mediumPats = pats.filter(p => p.strength === "medio" && p.signal !== "indecisao");
    const allPats = [...strongPats, ...mediumPats];

    // --- Institutional indicator direction for this symbol ---
    const ind = indicators?.[sym] || {};
    let indBuy = 0, indSell = 0;
    if (ind.didi?.trend === "bullish") indBuy++;
    if (ind.didi?.trend === "bearish") indSell++;
    if (ind.qqe?.trend === "bullish") indBuy++;
    if (ind.qqe?.trend === "bearish") indSell++;
    if (ind.bos?.trend === "bullish") indBuy++;
    if (ind.bos?.trend === "bearish") indSell++;
    const rsiVal = parseFloat(ind.rsi?.value);
    if (!isNaN(rsiVal)) {
      if (rsiVal < 35) indBuy++;
      if (rsiVal > 65) indSell++;
    }
    const indDir = indBuy > indSell ? "long" : indSell > indBuy ? "short" : null;
    const indStrength = indBuy + indSell;

    // --- Pattern direction ---
    let patDir = null, patternTypes = [], usablePats = [];
    if (strongPats.length >= 1) {
      const signals = strongPats.map(p => p.signal);
      const compras = signals.filter(s => s === "compra").length;
      const vendas = signals.filter(s => s === "venda").length;
      patDir = compras >= vendas ? "long" : "short";
      usablePats = strongPats;
    } else if (mediumPats.length >= 2) {
      const signals = mediumPats.map(p => p.signal);
      const compras = signals.filter(s => s === "compra").length;
      const vendas = signals.filter(s => s === "venda").length;
      // 2+ middle patterns: need 60% agreement
      if (Math.max(compras, vendas) / Math.max(compras + vendas, 1) >= 0.6) {
        patDir = compras > vendas ? "long" : "short";
        usablePats = mediumPats;
      }
    }
    patternTypes = usablePats.map(p => p.type);

    // Check for traps (skip asset if any trap signal present)
    const traps = allPats.filter(p => p.type.includes("trap"));
    if (traps.length > 0) continue;

    // --- Combine: need direction confirmation ---
    let finalDir = null;
    let confidenceBase = confianca || 70;

    if (patDir && strongPats.length >= 1) {
      // Strong pattern alone is enough, but indicators boost confidence
      finalDir = patDir;
      if (indDir && indDir === patDir) confidenceBase += 12; // confluence
      else if (indDir) confidenceBase -= 8; // divergence = caution
    } else if (patDir && indDir && patDir === indDir) {
      // Medium patterns + institutions agree
      finalDir = patDir;
      confidenceBase += 10;
} else if (!patDir && indDir && indStrength >= 2) {
      // No candle patterns but 2+ institutions agree — trade the trend
      finalDir = indDir;
      confidenceBase += 5;
      usablePats = [];
      patternTypes = [];
    } else if (!patDir && !indDir && indStrength >= 2 && confianca >= 75) {
      // Indicators split but market is oversold/overbought — use RSI extremes
      const rsiVal = parseFloat(ind.rsi?.value);
      if (rsiVal < 30 || rsiVal > 70) {
        finalDir = rsiVal < 30 ? "long" : "short";
        confidenceBase += 3;
        usablePats = [];
        patternTypes = [];
      }
    }

    if (!finalDir) {
      console.log(`[ENTRY] ${sym}: SKIP dir none | strong=${strongPats.length} med=${mediumPats.length} indDir=${indDir} indStr=${indStrength} baseConf=${confidenceBase}`);
      continue;
    }

    const patternBonus = usablePats.length * 4;
    const memoryBonus = patternMemoryBonus(patternTypes);
    const finalConf = Math.min(95, Math.round(confidenceBase + patternBonus + memoryBonus));
    const minConf = getModeMinConf();

    if (finalConf < minConf) {
      console.log(`[ENTRY] ${sym}: SKIP conf ${finalConf}<${minConf} (modo ${tradingMode}) | dir=${finalDir} indStr=${indStrength}`);
      continue;
    }

    // Position checks
    const alreadyIn = CACHE.positions.some(p => p.instId.includes(sym.replace("-SWAP", "").split("-")[0]));
    if (alreadyIn) continue;
    const assetBase = sym.split("-")[0];
    const assetPositions = CACHE.positions.filter(p => p.instId.includes(assetBase)).length;
    if (assetPositions >= (tradingConfig.max_trades_per_asset || 1)) continue;
    if (CACHE.positions.length >= (tradingConfig.max_open_trades || 3)) continue;

    const totalExposure = CACHE.positions.reduce((s, p) => s + parseFloat(p.notionalUsd || 0), 0);
    const balUsdt = parseFloat(CACHE.balance?.details?.find(d => d.ccy === "USDT")?.eq || "50");
    if (totalExposure > balUsdt * 0.5) continue;

    const params = adaptiveTradeParams(finalConf, patternTypes.length ? patternTypes : [finalDir === "long" ? "didi_bull" : "didi_bear"], mercado);
    if (!params.shouldEnter) continue;

    // Description
    const signalSource = usablePats.length
      ? usablePats.filter(p => p.signal === (finalDir === "long" ? "compra" : "venda")).slice(0, 3)
      : [{ name: `Didi/QQE/BOS ${finalDir === "long" ? "bullish" : "bearish"}` }];

    entries.push({
      symbol: sym,
      direction: finalDir,
      confidence: finalConf,
      patterns: usablePats.map(p => p.type),
      patternNames: signalSource.map(p => p.name),
      signalType: strongPats.length >= 1 ? "strong" : usablePats.length ? "medium" : "indicator",
      params,
      timestamp: Date.now(),
      justification: signalSource.map(p => p.name).join(" + "),
    });
  }

  entries.sort((a, b) => b.confidence - a.confidence);
  return entries.slice(0, 3);
}

// Pattern memory: bonus based on historical win rate of these patterns
function patternMemoryBonus(patternTypes) {
  const pl = loadPatternLearning();
  let totalBonus = 0, count = 0;
  for (const t of patternTypes) {
    const pr = pl.patternWinRates[t];
    if (pr && pr.totalCount > 0) {
      totalBonus += (pr.reliability - 0.5) * 30; // -15 to +15 per pattern
      count++;
    }
  }
  return count ? Math.round(totalBonus / count) : 0;
}

// --- UPDATE PATTERN LEARNING ---
function updatePatternLearning(tradeResult) {
  const pl = loadPatternLearning();
  const { entryPatterns, profit, instId } = tradeResult;
  if (!entryPatterns || !entryPatterns.length) return;

  const won = profit > 0;
  for (const patType of entryPatterns) {
    const pr = pl.patternWinRates[patType];
    if (!pr) continue;
    if (won) { pr.wins++; pr.profit += profit; }
    else { pr.losses++; pr.profit -= Math.abs(profit); }
    const total = pr.wins + pr.losses;
    pr.totalCount = total;
    if (total > 0) pr.reliability = Math.min(0.95, Math.max(0.05, pr.wins / total));
    if (total >= 3) {
      // Update avgMove
      pr.avgMove = ((pr.avgMove * (total - 1)) + Math.abs(profit)) / total;
    }
  }
  pl.totalTracked = (pl.totalTracked || 0) + 1;
  pl.lastUpdate = Date.now();
  savePatternLearning(pl);
}

// --- LOG TRAP EVENT ---
function logTrap(trap, symbol) {
  const tl = loadTrapLog();
  tl.traps.push({ type: trap.type, name: trap.name, symbol, ts: Date.now() });
  if (tl.traps.length > 200) tl.traps = tl.traps.slice(-200);
  saveTrapLog(tl);
}

// --- AUTO-TRADE EXECUTION ---
async function executeAutoTrade(setup) {
  if (!setup || !setup.symbol) return false;
  // Final freshness check before executing
  if (!signalIsFresh(15000)) {
    console.log("[AUTO-TRADE] Sinal antigo ignorado para " + setup.symbol + " (dataAge=" + signalLatency.dataAge + "ms)");
    return false;
  }
  try {
    const baseSym = setup.symbol.split("-")[0];
    const swapSym = baseSym + "-USDT-SWAP";
    const side = setup.direction === "long" ? "buy" : "sell";
    const stakeAmt = setup.params.stake || tradingConfig.stake_amount || 5;
    const slPct = setup.params.sl || -3;
    const tpPct = setup.params.tp || 5;

    // Proper SWAP contract size: fetch ctVal from instruments
    console.log("[AUTO-TRADE] Verificando instrumento: " + swapSym);
    const instr = await okxGet("/api/v5/public/instruments?instType=SWAP&instId=" + swapSym);
    console.log("[AUTO-TRADE] Resposta instrumento: " + JSON.stringify(instr).slice(0, 200));

// Check if SWAP is available
    const swapAvailable = instr?.code === "0" && instr?.data?.[0];

    if (!swapAvailable) {
      // Fallback to SPOT
      console.log("[AUTO-TRADE] SWAP indisponivel, tentando SPOT...");
      const currentPrice = parseFloat(CACHE.prices[setup.symbol]?.last) || 0;
      if (!currentPrice) return false;
      const spotResult = await okxPost("/api/v5/trade/order", {
        instId: setup.symbol,
        tdMode: "cash",
        side,
        ordType: "market",
        sz: String(Math.max(1, Math.round(stakeAmt / (currentPrice || 1)))),
      });
      console.log("[AUTO-TRADE] SPOT result: " + JSON.stringify(spotResult).slice(0, 200));
      if (spotResult.code === "0") {
        console.log("[AUTO-TRADE] SPOT " + setup.direction.toUpperCase() + " " + baseSym + " (conf:" + setup.confidence + "%)");
        const state = loadAutoTradeState();
        state.totalEntries++; state.lastEntry = Date.now();
        saveAutoTradeState(state);
        return true;
      }
      console.log("[AUTO-TRADE] FAIL " + baseSym + " spot: " + (spotResult.msg || spotResult.code));
      return false;
    }

    const ctVal = parseFloat(instr.data[0].ctVal) || 0.0001;
    const currentPrice = parseFloat(CACHE.prices[setup.symbol]?.last) || 0;
    if (!currentPrice) return false;
    const rawSz = stakeAmt / (ctVal * currentPrice);
    const lotSz = parseFloat(instr?.data?.[0]?.lotSz) || 1;
    const sz = Math.max(Math.round(rawSz / lotSz) * lotSz, 1);
    console.log("[AUTO-TRADE] sz=" + sz + " rawSz=" + rawSz.toFixed(4) + " ctVal=" + ctVal + " price=" + currentPrice + " stake=" + stakeAmt + " lotSz=" + lotSz);

    // Set leverage first
    console.log("[AUTO-TRADE] Setando leverage 10x para " + swapSym);
    const levResult = await okxPost("/api/v5/account/set-leverage", { instId: swapSym, lever: "10", mgnMode: "cross" });
    if (levResult.code !== "0") console.log("[AUTO-TRADE] Leverage warning: " + (levResult.msg || levResult.code));

    // Try SWAP order, then fallback to SPOT
    let result = await okxPost("/api/v5/trade/order", {
      instId: swapSym,
      tdMode: "cross",
      side,
      ordType: "market",
      sz: String(sz),
    });
    console.log("[AUTO-TRADE] SWAP cross result: " + JSON.stringify(result).slice(0, 200));
    
    if (result.code !== "0") {
      // Try isolated
      result = await okxPost("/api/v5/trade/order", {
        instId: swapSym,
        tdMode: "isolated",
        side,
        ordType: "market",
        sz: String(sz),
      });
      console.log("[AUTO-TRADE] SWAP isolated result: " + JSON.stringify(result).slice(0, 200));
    }

    if (result.code !== "0") {
      // SPOT also failed - likely API key without Trade permission
      console.log("[AUTO-TRADE] Todas as tentativas falharam. Possivel: API key sem permissao de Trade");
      if (result.code === 404 || result.code === "404") {
        console.log("[AUTO-TRADE] ⚠️ API key OKX sem permissao de Trade. Ative em: OKX > API > Permissoes");
      }
    }

    if (result.code === "0") {
      console.log(`[AUTO-TRADE] ${setup.direction.toUpperCase()} ${baseSym} (conf:${setup.confidence}%) — ${setup.justification}`);
      const state = loadAutoTradeState();
      state.totalEntries++;
      state.lastEntry = Date.now();
      saveAutoTradeState(state);

      // Register position params for adaptive SL/TP
      positionParams[swapSym] = {
        sl: slPct * -1,
        tp: tpPct,
        trailing: setup.params.useTrailing !== false,
        entryPx: currentPrice,
        entryTime: Date.now(),
        bestRatio: 0,
      };

      // Log the entry patterns for learning
      const pl = loadPatternLearning();
      for (const patType of setup.patterns) {
        if (pl.patternWinRates[patType]) pl.patternWinRates[patType].totalCount = (pl.patternWinRates[patType].totalCount || 0) + 1;
      }
      savePatternLearning(pl);

      return true;
    } else {
      console.log(`[AUTO-TRADE] FAIL ${baseSym}: ${result.msg || result.code}`);
      return false;
    }
  } catch (e) {
    console.error("[AUTO-TRADE] Error:", e.message);
    return false;
  }
}

// Override close-position to register learning
const originalClosePositionRoute = null;
quickAnalysis = async function() {
  const syms = getActiveSymbols();
  if (!syms.length) return { error: "Nenhum ativo" };
  const saved = loadAnalysis();
  const learning = loadLearning();
  const microData = {};
  for (const sym of syms) {
    microData[sym] = {};
    const candles5m = await fetchCandles(sym, "5m", 60);
    const candles15m = await fetchCandles(sym, "15m", 60);
    microData[sym]["5m"] = calcStats(candles5m);
    microData[sym]["15m"] = calcStats(candles15m);
    if (microData[sym]["5m"]) microData[sym]["5m"]._candles = candles5m;
    if (microData[sym]["15m"]) microData[sym]["15m"]._candles = candles15m;
  }
  const det = institutionalScoreMulti(microData, learning);
  const best = Object.entries(det.scores).sort((a, b) => b[1] - a[1]);

  // Build per-asset indicator lines
  const perAssetLines = syms.map(sym => {
    const ind = det.por_ativo?.[sym];
    if (!ind) return `${sym}: sem dados`;
    return `${sym}: Didi=${ind.didi?.trend} QQE=${ind.qqe?.trend} Squeeze=${ind.squeeze?.active ? "ON" : "OFF"} RSI=${ind.rsi?.value}`;
  }).join("\n");

  const result = {
    rankings: [
      { periodo: "7d", melhor: best[0][0], score: best[0][1], timeframe_recomendado: "5m", justificativa: "Score institucional multi-indicador" },
      { periodo: "30d", melhor: best[0][0], score: Math.round(best[0][1] * 0.9), timeframe_recomendado: "4H" },
      { periodo: "60d", melhor: best[0][0], score: Math.round(best[0][1] * 0.8), timeframe_recomendado: "1D" },
      { periodo: "90d", melhor: best[0][0], score: Math.round(best[0][1] * 0.75), timeframe_recomendado: "1D" },
    ],
    recomendacao_geral: best[0][0],
    justificativa_geral: `Didi+QQE+Squeeze: ${det.mercado}. Consenso multi-ativo.`,
    mercado_atual: det.mercado,
    confianca: det.confianca,
    analise_tecnica: perAssetLines.split("\n").slice(0, 3).join(" | "),
    sugestao_timeframe_operacional: "5m",
    por_ativo: det.por_ativo,
    indicators: det.indicators,
    _full: false, _ts: Date.now(),
  };

  // Run full pattern detection (candle + volume + smart money + BOS + FVG + OB + VRVP)
  const patterns = analyzePatterns(microData);
  // Also add BOS patterns
  for (const sym of syms) {
    const c5 = microData[sym]?.["5m"]?._candles;
    if (!c5 || c5.length < 30) continue;
    const bos = detectBOS(c5);
    bos.patterns.forEach(p => { p.timeframe = "5m"; p.symbol = sym; });
    if (patterns.results[sym]) patterns.results[sym].push(...bos.patterns);
    else patterns.results[sym] = bos.patterns;
    patterns.totalPatterns += bos.patterns.length;

    // FVG
    const fvg = detectFVG(c5);
    fvg.forEach(p => { p.timeframe = "5m"; p.symbol = sym; });
    if (patterns.results[sym]) patterns.results[sym].push(...fvg);
    else patterns.results[sym] = fvg;
    patterns.totalPatterns += fvg.length;

    // Order Blocks
    const ob = detectOrderBlocks(c5, bos.trend);
    ob.forEach(p => { p.timeframe = "5m"; p.symbol = sym; });
    if (patterns.results[sym]) patterns.results[sym].push(...ob);
    else patterns.results[sym] = ob;
    patterns.totalPatterns += ob.length;

    // VRVP
    const c15 = microData[sym]?.["15m"]?._candles;
    if (c15 && c15.length >= 50) {
      const vrvp = detectVRVP(c15);
      const pd = premiumDiscountZones(vrvp, c15[c15.length-1].c);
      if (vrvp.poc) {
        const zoneStr = pd.zone === "premium" ? " (Premium — vender)" : pd.zone === "discount" ? " (Discount — comprar)" : " (Equilibrio)";
        const pat = { type: "vrvp", name: `VRVP POC ${vrvp.poc.toFixed(2)}${zoneStr}`, signal: pd.zone === "discount" ? "compra" : pd.zone === "premium" ? "venda" : "indecisao", strength: "medio", timeframe: "15m", symbol: sym,
          desc: `Suporte: ${vrvp.support?.toFixed(2) || "N/A"} | Resistencia: ${vrvp.resistance?.toFixed(2) || "N/A"}` };
        if (patterns.results[sym]) patterns.results[sym].push(pat);
        patterns.totalPatterns++;
      }
    }
  }

  updateAvatarState(patterns, result);
  recentPatterns = Object.values(patterns.results).flat().slice(-50);
  broadcastAvatar();
  broadcastPatterns(recentPatterns.slice(-10));

  return result;
};

// Override fullAnalysis too, to store candles
const _origFullAnalysis = fullAnalysis;
fullAnalysis = async function() {
  const result = await _origFullAnalysis.call(this);
  // Add candle data for patterns (simpler — just use last 5m)
  const syms = getActiveSymbols();
  const microData = {};
  for (const sym of syms) {
    microData[sym] = {};
    const c5 = await fetchCandles(sym, "5m", 60);
    microData[sym]["5m"] = calcStats(c5);
    if (microData[sym]["5m"]) microData[sym]["5m"]._candles = c5;
  }
  const patterns = analyzePatterns(microData);
  updateAvatarState(patterns, result);
  recentPatterns = Object.values(patterns.results).flat().slice(-50);
  broadcastAvatar();
  broadcastPatterns(recentPatterns.slice(-10));
  return result;
};

// ============================================================
// FLUXO DE CAPITAL (USDT.D × BTC) + FRACTAIS + DIARIO DE BORDO
// ============================================================

const FLOW_FILE = path.join(__dirname, "capital_flow.json");
const FRACTAL_FILE = path.join(__dirname, "btc_fractals.json");
const JOURNAL_FILE = path.join(__dirname, "diario_bordo.json");

let capitalFlow = {
  btcDominance: 55,      // BTC.D % (proxy inverso de USDT.D)
  btcPrice: 0,
  regime: "risco_on",
  color: "green",
  message: "Aguardando dados de fluxo...",
  flowAlert: null,       // { type, text } — crossover alert
  btcHistory: [],        // [{ ts, price, dominance }] — sparkline data
  lastUpdate: 0,
};

let fractalState = {
  lastMatch: null,
  totalFractals: 0,
  matches: [],
  lastUpdate: 0,
};

function loadFlow() {
  try { return JSON.parse(fs.readFileSync(FLOW_FILE, "utf8")); } catch { return capitalFlow; }
}
function saveFlow(f) { fs.writeFileSync(FLOW_FILE, JSON.stringify(f, null, 2)); }

function loadFractals() {
  try { return JSON.parse(fs.readFileSync(FRACTAL_FILE, "utf8")); } catch { return { fractalLibrary: [], totalFractals: 0 }; }
}
function saveFractals(f) { fs.writeFileSync(FRACTAL_FILE, JSON.stringify(f, null, 2)); }

function loadJournal() {
  try { return JSON.parse(fs.readFileSync(JOURNAL_FILE, "utf8")); } catch { return { entries: [] }; }
}
function saveJournal(j) { fs.writeFileSync(JOURNAL_FILE, JSON.stringify(j, null, 2)); }

// Compute Pearson correlation between two series
function pearsonCorrelation(a, b) {
  if (!a || !b || a.length !== b.length || a.length < 5) return 0;
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// Analyze capital flow via CoinGecko BTC dominance + BTC price from OKX
async function analyzeCapitalFlow() {
  try {
    // Fetch BTC dominance from CoinGecko (free, no key needed)
    const cgRes = await fetch("https://api.coingecko.com/api/v3/global", { signal: AbortSignal.timeout(8000) });
    const cgData = await cgRes.json();
    const btcDominance = parseFloat(cgData?.data?.market_cap_percentage?.btc) || 55;
    const totalMc = cgData?.data?.total_market_cap?.usd || 0;

    // Fetch BTC price from OKX
    const syms = getActiveSymbols();
    const btcSym = syms.find(s => s.includes("BTC"));
    let btcPrice = parseFloat(CACHE.prices[btcSym]?.last) || 0;
    if (!btcPrice && btcSym) {
      const c = await fetchCandles(btcSym, "5m", 3);
      if (c.length) btcPrice = c[c.length-1].c;
    }

    // Track history for sparkline (last 96 points = ~8h at 5min)
    const historyPoint = { ts: Date.now(), price: btcPrice, dominance: btcDominance };
    const existingHistory = capitalFlow.btcHistory || [];
    capitalFlow.btcHistory = existingHistory.concat([historyPoint]).slice(-96);

    // Determine regime comparing BTC dominance vs BTC price movement
    const history = capitalFlow.btcHistory || [];
    const prevDom = history.length >= 2 ? history[history.length - 2].dominance : btcDominance;
    const domDelta = btcDominance - prevDom;
    const priceDelta = history.length >= 2 ? ((btcPrice - history[history.length - 2].price) / history[history.length - 2].price) * 100 : 0;

    let regime, color, message, flowAlert = null;

    // — CROSSOVER DETECTION (the user's exact setup) —
    // USDT.D caindo (BTC.D caindo) + BTC subindo = RISK ON (money flowing into crypto)
    // USDT.D subindo (BTC.D subindo) + BTC caindo = RISK OFF (money leaving crypto)
    // USDT.D caindo + BTC caindo = alts bleeding (BTC dominance falling with BTC)
    // USDT.D subindo + BTC subindo = BTC dominance rising with price (strong BTC)

    const domFalling = domDelta < -0.15;
    const domRising = domDelta > 0.15;
    const priceRising = priceDelta > 0.3;
    const priceFalling = priceDelta < -0.3;

    if (domFalling && priceRising) {
      // 💰 PERFEITO — USDT.D caindo, BTC subindo
      regime = "fluxo_entrada";
      color = "green";
      message = `💸 Fluxo entrando em crypto: USDT.D caindo (${(-domDelta).toFixed(2)}%) enquanto BTC sobe (${priceDelta.toFixed(2)}%) — risco ON`;
      flowAlert = { type: "crossover_bull", text: `⚡ USDT.D ${domDelta.toFixed(2)}% | BTC ${priceDelta.toFixed(2)}% — fluxo entrando` };
    } else if (domRising && priceFalling) {
      // 😰 RISCO OFF — USDT.D subindo, BTC caindo
      regime = "fluxo_saida";
      color = "red";
      message = `🚨 Fuga para USDT: USDT.D sobe (${domDelta.toFixed(2)}%) enquanto BTC cai (${priceDelta.toFixed(2)}%) — risco OFF`;
      flowAlert = { type: "crossover_bear", text: `⚠️ USDT.D ${domDelta.toFixed(2)}% | BTC ${priceDelta.toFixed(2)}% — saindo de crypto` };
    } else if (domFalling && priceFalling) {
      regime = "alts_sangrando";
      color = "orange";
      message = `🩸 Alts sangrando: BTC.D cai (${(-domDelta).toFixed(2)}%) junto com BTC (${priceDelta.toFixed(2)}%) — dinheiro saindo do mercado`;
    } else if (domRising && priceRising) {
      // BTC.D subindo com BTC subindo = dominância do BTC, alts fracas
      regime = "btc_dominando";
      color = "cyan";
      message = `👑 BTC dominando: BTC.D sobe (${domDelta.toFixed(2)}%) e BTC valoriza (${priceDelta.toFixed(2)}%) — BTC king, alts fracas`;
    } else {
      regime = "neutro";
      color = "gray";
      message = `⏸️ Mercado lateral: BTC.D ${btcDominance.toFixed(1)}% | BTC $${btcPrice.toLocaleString()} | ${priceDelta > 0 ? "levemente altista" : "levemente baixista"}`;
    }

    capitalFlow = {
      btcDominance: Math.round(btcDominance * 10) / 10,
      btcPrice,
      regime,
      color,
      message,
      flowAlert,
      btcHistory: capitalFlow.btcHistory.slice(-96),
      lastUpdate: Date.now(),
    };
    saveFlow(capitalFlow);

    // Broadcast via WebSocket
    const msg = JSON.stringify({ type: "capital_flow", data: capitalFlow });
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });

    // If there's a crossover alert, push an avatar update too
    if (flowAlert) {
      const oldMood = avatarState.mood;
      avatarState.thought = flowAlert.text;
      avatarState.mood = flowAlert.type === "crossover_bull" ? "confiante" : "alerta";
      avatarState.lastUpdate = Date.now();
      broadcastAvatar();
      // Schedule mood reset after 60s
      setTimeout(() => {
        if (avatarState.mood === (flowAlert.type === "crossover_bull" ? "confiante" : "alerta")) {
          avatarState.mood = oldMood;
          avatarState.thought = "Monitorando fluxo de capital...";
          broadcastAvatar();
        }
      }, 60000);
    }

  } catch (e) { console.error("[FLOW]", e.message); }
}

// Add fractal: normalize current candle window and store in library
function normalizeSeries(series) {
  const first = series[0];
  const range = Math.max(...series) - Math.min(...series);
  if (range === 0) return series.map(() => 0);
  return series.map(v => (v - first) / range);
}

async function buildFractalLibrary() {
  try {
    const syms = getActiveSymbols();
    const btcSym = syms.find(s => s.includes("BTC"));
    if (!btcSym) return;
    const fractals = loadFractals();
    if (fractals.totalFractals > 300) return; // library is big enough

    // Fetch 200 candles of 15m (≈50h of data) to build library
    const candles = await fetchCandles(btcSym, "15m", 200);
    if (candles.length < 40) return;

    const closes = candles.map(c => c.c);
    const WINDOW = 24; // 24 candles = 6h pattern

    let added = 0;
    for (let i = 0; i + WINDOW + 3 < closes.length; i += WINDOW) {
      const window = closes.slice(i, i + WINDOW + 3); // 24 pattern + 3 projection
      if (window.length < WINDOW + 3) continue;
      const patternNorm = normalizeSeries(window.slice(0, WINDOW));
      const projection = window.slice(WINDOW, WINDOW + 3).map((v, j, arr) => j === 0 ? 0 : ((v - window[WINDOW]) / window[WINDOW]) * 100);
      fractals.fractalLibrary.push({
        ts: candles[i].ts,
        startPrice: candles[i].c,
        patternNorm,
        projection: projection.filter((_, j) => j > 0), // 2 projected % moves
        source: "15m",
      });
      added++;
    }
    if (added > 0) {
      fractals.totalFractals = (fractals.totalFractals || 0) + added;
      if (fractals.fractalLibrary.length > 2000) fractals.fractalLibrary = fractals.fractalLibrary.slice(-2000);
      saveFractals(fractals);
      console.log(`[FRACTAL] Biblioteca: ${fractals.totalFractals} fractais (adicionados ${added})`);
    }
  } catch (e) { console.error("[FRACTAL-LIB]", e.message); }
}

// Find similar historical pattern to current market
async function findFractalMatch() {
  try {
    const syms = getActiveSymbols();
    const btcSym = syms.find(s => s.includes("BTC"));
    if (!btcSym) return;
    const fractals = loadFractals();
    if (fractals.totalFractals < 5) return;

    const candles = await fetchCandles(btcSym, "15m", 40);
    if (candles.length < 28) return;
    const closes = candles.map(c => c.c);
    const currentNorm = normalizeSeries(closes.slice(-24));

    // Find best matching fractal using Euclidean distance (DTW approximation)
    let bestMatch = null, bestDist = Infinity;
    for (const f of fractals.fractalLibrary) {
      if (f.patternNorm.length !== currentNorm.length) continue;
      let dist = 0;
      for (let i = 0; i < currentNorm.length; i++) {
        dist += (f.patternNorm[i] - currentNorm[i]) ** 2;
      }
      dist = Math.sqrt(dist);
      if (dist < bestDist) { bestDist = dist; bestMatch = f; }
    }

    if (bestMatch && bestDist < 1.8) {
      // Compute what happened after that matching fractal
      const similarity = Math.max(0, Math.round((1 - bestDist / 2) * 100));
      const projected = bestMatch.projection || [];
      const avgProj = projected.length ? projected.reduce((s, v) => s + v, 0) / projected.length : 0;

      fractalState = {
        lastMatch: {
          similarity,
          matchTs: bestMatch.ts,
          matchPrice: bestMatch.startPrice,
          projected30m: avgProj,
          direction: avgProj > 0 ? "up" : "down",
          matchDate: new Date(bestMatch.ts).toLocaleDateString(),
        },
        totalFractals: fractals.totalFractals,
        matches: (fractalState.matches || []).concat([{
          ts: Date.now(), similarity, projected30m: avgProj,
          matchDate: new Date(bestMatch.ts).toLocaleDateString(),
        }]).slice(-50),
        lastUpdate: Date.now(),
      };

      // Broadcast
      const msg = JSON.stringify({ type: "fractal", data: fractalState });
      wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
    }

  } catch (e) { console.error("[FRACTAL-FIND]", e.message); }
}

// --- Diário de Bordo: add entry with severity analysis ---
function journalAdd(entry) {
  const j = loadJournal();
  const now = Date.now();
  const newEntry = {
    id: "j_" + now + "_" + Math.floor(Math.random() * 1000),
    ts: now,
    type: entry.type || "note", // note | trade | emotion | analysis
    title: entry.title || "Anotação",
    body: entry.body || "",
    trade: entry.trade || null, // { symbol, side, pnl }
    sentimento: entry.sentimento || "neutro", // positivo | neutro | negativo
    severinoReply: null,
  };
  j.entries.unshift(newEntry);
  if (j.entries.length > 200) j.entries = j.entries.slice(0, 200);
  saveJournal(j);
  return newEntry;
}

// Severino's reply to a journal entry (heuristic, deterministic — zero LLM cost)
function journalSeverinoReply(entry) {
  const t = entry.trade;
  let reply = "";

  if (entry.type === "trade" && t) {
    const pnl = parseFloat(t.pnl);
    if (pnl >= 0) {
      reply = `Trade ganho (${pnl}%) em ${t.symbol}. `;
      if (pnl >= 3) reply += "Ótima execução — não deixe a euforia aumentar o tamanho do próximo trade. Mantenha a disciplina.";
      else reply += "Lucro saudável. Confirme que o SL estava respeitando o setup antes de replicar.";
    } else {
      reply = `Trade perdeu (${pnl}%) em ${t.symbol}. `;
      if (pnl <= -3) {
        reply += "Perda acima de 3% sugere SL mal posicionado ou entrada contra o fluxo. Revisa: o setup tinha BOS/FVG confirmando? A correlação USDT.D×BTC estava no regime certo?";
      } else {
        reply += "Perda controlada — o importante é o R:R e a repetição. Registre o que aprendeu.";
      }
    }
    if (entry.sentimento === "negativo") {
      reply += " Lembre das regras do Guardian: após 3 perdas consecutivas o bot pausa 2h. O mercado espera.";
    }
  } else if (entry.type === "emotion") {
    reply = "Anotação emocional registrada. O maior adversário não é o mercado, é o impulso. Quando a mão coçar para aumentar o stake após uma vitória, é o momento de reduzir.";
  } else if (entry.type === "analysis") {
    reply = "Sua análise registrada no Diário de Bordo. Quando eu detectar um fractal similar nas próximas horas, vou apontar neste diário para compararmos.";
  } else {
    reply = "Anotação salva no Diário de Bordo. Use o formato: tipo 'trade' para operações, 'emotion' para controlar mente, 'analysis' para teoria.";
  }
  return reply;
}

function journalGet() {
  return loadJournal();
}

function journalDelete(id) {
  const j = loadJournal();
  j.entries = j.entries.filter(e => e.id !== id);
  saveJournal(j);
}

async function analyzeCapitalFlowLoop() {
  await analyzeCapitalFlow();
  await scalpScanner();
  setInterval(async () => {
    await analyzeCapitalFlow();
    await scalpScanner();
  }, 600000);
}

async function fractalLoop() {
  await buildFractalLibrary();
  await findFractalMatch();
  setInterval(fractalLoop, 900000);
}

// ============================================================
// MULTI-TIMEFRAME ENGINE (5m / 15m / 1H / 4H / 1D / 3D)
// ============================================================

// Analisa cada timeframe e retorna: trend, momentum, níveis chave, EMA9
function analyzeTF(candles, tfName) {
  if (!candles || candles.length < 5) return null;
  const closes = candles.map(c => c.c);
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const last = candles[candles.length - 1];

  const ema3 = closes.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const ema8 = closes.slice(-8).reduce((a, b) => a + b, 0) / 8;
  const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const didiCurta = ema3 - ema8;
  const didiLonga = ema20 - ema8;
  const didiTrend = didiCurta > didiLonga ? "bullish" : didiCurta < didiLonga ? "bearish" : "lateral";
  const didiStrength = Math.abs(didiCurta - didiLonga) / (ema8 || 1) * 100;

  const ema9Val = closes.slice(-9).reduce((a, b) => a + b, 0) / 9;
  const mom3 = closes.length >= 4 ? ((closes[closes.length - 1] - closes[closes.length - 4]) / closes[closes.length - 4]) * 100 : 0;

  const high10 = Math.max(...highs.slice(-10));
  const low10 = Math.min(...lows.slice(-10));
  const prevHigh10 = Math.max(...highs.slice(-11, -1));
  const prevLow10 = Math.min(...lows.slice(-11, -1));
  const bos = (last.c > prevHigh10) ? "bullish" : (last.c < prevLow10) ? "bearish" : "lateral";

  const sup = Math.min(...lows.slice(-20));
  const res = Math.max(...highs.slice(-20));

  const totalRange = last.h - last.l || 1;
  const body = Math.abs(last.c - last.o);
  const upperWick = last.h - Math.max(last.c, last.o);
  const lowerWick = Math.min(last.c, last.o) - last.l;
  const candleRange = ((last.h - last.l) / last.l) * 100;

  // Squeeze Momentum (Bollinger 20,2 vs Keltner 20,1.5)
  const len = 20;
  const slice = closes.slice(-len);
  const basis = slice.reduce((a, b) => a + b, 0) / len;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - basis) ** 2, 0) / len);
  const upperBB = basis + 2 * std, lowerBB = basis - 2 * std;
  const ranges = highs.slice(-len).map((h, i) => h - lows.slice(-len)[i]);
  const rangeMa = ranges.reduce((a, b) => a + b, 0) / len;
  const upperKC = basis + rangeMa * 1.5, lowerKC = basis - rangeMa * 1.5;
  const squeezing = lowerBB > lowerKC && upperBB < upperKC;
  const kcMid = (upperKC + lowerKC) / 2;
  const sqzMomentum = ((last.c - kcMid) / (kcMid || 1)) * 100;
  const sqzReady = squeezing && Math.abs(sqzMomentum) < 0.5;
  const sqzDirection = sqzMomentum > 0 ? "up" : sqzMomentum < 0 ? "down" : "flat";

  // Price stretch: how far price is from EMA20 (%)
  const priceStretch = ema20 > 0 ? ((last.c - ema20) / ema20) * 100 : 0;
  const stretched = Math.abs(priceStretch) > 3; // 3%+ from EMA20 = stretched

  // Pullback detection: price came back to EMA9 or EMA20 after being stretched
  const prevClose = candles.length >= 2 ? candles[candles.length - 2].c : last.c;
  const wasStretched = ema20 > 0 ? Math.abs((prevClose - ema20) / ema20) * 100 > 2 : false;
  const pullingBack = wasStretched && Math.abs(priceStretch) < Math.abs(wasStretched ? ((prevClose - ema20) / ema20) * 100 : 0) && last.c > ema9Val;

  let pattern = null;
  if (body / totalRange < 0.1) pattern = "Doji";
  else if (lowerWick > body * 1.5 && last.c >= last.o) pattern = "Martelo";
  else if (upperWick > body * 1.5 && last.c <= last.o) pattern = "Estrela Cadente";
  else if (last.c > last.o && candles.length >= 2 && candles[candles.length - 2].c < candles[candles.length - 2].o) {
    const prevBody = Math.abs(candles[candles.length - 2].c - candles[candles.length - 2].o);
    if (body > prevBody * 1.2) pattern = "Engolfo Alta";
  } else if (last.c < last.o && candles.length >= 2 && candles[candles.length - 2].c > candles[candles.length - 2].o) {
    const prevBody = Math.abs(candles[candles.length - 2].c - candles[candles.length - 2].o);
    if (body > prevBody * 1.2) pattern = "Engolfo Baixa";
  }

  // === BULLMARKET SUPPORT BAND (VWMA 21-like) ===
  // MIDAS / Bull Market Support Band: smoothed support line
  const closes5 = closes.slice(-5);
  const midasSupport = closes5.reduce((s, v, i) => s + v * (5 - i), 0) / 15; // linear-weighted MA 5
  const bandTouch = Math.abs(last.c - midasSupport) / midasSupport * 100 < 0.5;

  // === GROK.V9 — SMA 9/50/200 + DMI/ADX + Volume Multiplier ===
  const sma9  = closes.slice(-9).reduce((a, b) => a + b, 0) / 9;
  const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  const sma200 = closes.length >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;
  // DMI simplified: +DI / -DI from 14-period true range
  let plusDM = 0, minusDM = 0, tr14 = 0;
  for (let i = Math.max(0, closes.length - 15); i < closes.length - 1; i++) {
    const upMove = highs[i+1] - highs[i];
    const downMove = lows[i] - lows[i+1];
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
    tr14 += Math.max(highs[i+1] - lows[i+1], Math.abs(highs[i+1] - closes[i]), Math.abs(lows[i+1] - closes[i]));
  }
  const tr14avg = tr14 / 14 || 1;
  const diPlus = plusDM / 14 / tr14avg * 100;
  const diMinus = minusDM / 14 / tr14avg * 100;
  const adx = Math.abs(diPlus - diMinus) / (diPlus + diMinus || 1) * 100;
  // Grok trend: SMA9 > SMA50 as bull filter, ADX > 20 as trend strength
  const grokTrend = sma50 !== null && sma9 > sma50 && adx > 20 ? "bullish" : sma50 !== null && sma9 < sma50 && adx > 20 ? "bearish" : "lateral";

  // === MACD/RSI/STOCHASTIC ===
  const ema12 = closes.length >= 12 ? ma("EMA", closes, 12) : null;
  const ema26 = closes.length >= 26 ? ma("EMA", closes, 26) : null;
  const macdLine = ema12 !== null && ema26 !== null ? ema12 - ema26 : 0;
  const macdSignal = closes.length >= 9 ? ma("SMA", [macdLine], 9) || macdLine : macdLine;
  const macdHist = macdLine - macdSignal;
  const rsi14 = (() => {
    if (closes.length < 15) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const d = closes[i] - closes[i-1];
      if (d > 0) gains += d; else losses -= d;
    }
    const avgG = gains / 14, avgL = losses / 14;
    return avgL === 0 ? 100 : 100 - (100 / (1 + avgG / avgL));
  })();
  // Stochastic
  const low14 = Math.min(...lows.slice(-14));
  const high14 = Math.max(...highs.slice(-14));
  const stochK = (high14 - low14) === 0 ? 50 : ((last.c - low14) / (high14 - low14)) * 100;
  const stochD = closes.length >= 3 ? closes.slice(-3).map((_, i) => {
    const l = lows[lows.length - 3 + i], h = highs[highs.length - 3 + i];
    return (h - l) === 0 ? 50 : ((closes[closes.length - 3 + i] - l) / (h - l)) * 100;
  }).reduce((a, b) => a + b, 0) / 3 : stochK;
  // Volume confirmation
  const volAvg = candles.slice(-20).reduce((s, c) => s + c.vol, 0) / 20;
  const volOk = last.vol > volAvg * 1.8;

  // Enhanced direction with ALL indicators
  let tfDirection = "lateral";
  let tfStrength = 0;
  const macdBull = macdLine > macdSignal && macdHist > 0;
  const macdBear = macdLine < macdSignal && macdHist < 0;
  const stochBull = stochK < 20 && stochD < 20 && stochK > stochD;
  const stochBear = stochK > 80 && stochD > 80 && stochK < stochD;
  const rsiBull = rsi14 > 30 && rsi14 < 60;
  const rsiBear = rsi14 > 70;

  const bullishSignals = (didiTrend === "bullish" ? 2 : 0) + (bos === "bullish" ? 1 : 0) + (mom3 > 0.3 ? 1 : 0) + (last.c > ema9Val ? 1 : 0) + (sqzDirection === "up" ? 1 : 0) + (macdBull ? 1 : 0) + (grokTrend === "bullish" ? 2 : 0) + (stochBull ? 1 : 0) + (bandTouch ? 1 : 0);
  const bearishSignals = (didiTrend === "bearish" ? 2 : 0) + (bos === "bearish" ? 1 : 0) + (mom3 < -0.3 ? 1 : 0) + (last.c < ema9Val ? 1 : 0) + (sqzDirection === "down" ? 1 : 0) + (macdBear ? 1 : 0) + (grokTrend === "bearish" ? 2 : 0) + (stochBear ? 1 : 0);
  if (bullishSignals >= 4) { tfDirection = "bullish"; tfStrength = bullishSignals; }
  else if (bearishSignals >= 4) { tfDirection = "bearish"; tfStrength = bearishSignals; }

  return { tf: tfName, direction: tfDirection, strength: Math.round(Math.min(100, tfStrength * 10)), didi: didiTrend, ema9: ema9Val, ema20, bos, mom3: Math.round(mom3 * 100) / 100, sup, res, lastClose: last.c, pattern, candleRange: Math.round(candleRange * 100) / 100, squeeze: { squeezing, momentum: Math.round(sqzMomentum * 100) / 100, ready: sqzReady, direction: sqzDirection }, priceStretch: Math.round(priceStretch * 100) / 100, stretched, pullingBack, bmsBand: Math.round(midasSupport * 100) / 100, bandTouch, grok: { sma9: Math.round(sma9 * 100) / 100, sma50: sma50 ? Math.round(sma50 * 100) / 100 : null, sma200: sma200 ? Math.round(sma200 * 100) / 100 : null, adx: Math.round(adx * 100) / 100, diPlus: Math.round(diPlus * 100) / 100, diMinus: Math.round(diMinus * 100) / 100, trend: grokTrend }, macd: { macd: Math.round(macdLine * 100) / 100, signal: Math.round(macdSignal * 100) / 100, hist: Math.round(macdHist * 100) / 100 }, rsi14: Math.round(rsi14 * 100) / 100, stoch: { k: Math.round(stochK * 100) / 100, d: Math.round(stochD * 100) / 100 }, volOk };
}

const TF_CONFIG = [
  { bar: "5m",  limit: 30,  name: "5m" },
  { bar: "15m", limit: 30,  name: "15m" },
  { bar: "1H",  limit: 30,  name: "1H" },
  { bar: "4H",  limit: 30,  name: "4H" },
  { bar: "1D",  limit: 30,  name: "1D" },
  { bar: "3D",  limit: 20,  name: "3D" },
];

async function fetchAllTF(symbol) {
  const result = {};
  for (const tf of TF_CONFIG) {
    const candles = await fetchCandles(symbol, tf.bar, tf.limit);
    if (candles.length >= 5) result[tf.name] = { candles, analysis: analyzeTF(candles, tf.name) };
  }
  return result;
}

function fibConfluence(mtfData, direction) {
  const allFibLevels = {}; const allSupports = []; const allResistances = [];
  for (const [tfName, data] of Object.entries(mtfData)) {
    if (!data.analysis) continue;
    const a = data.analysis; const range = a.res - a.sup;
    if (range <= 0) continue;
    allFibLevels[tfName] = {
      fib0236: a.res - range * 0.236, fib0382: a.res - range * 0.382,
      fib05: a.res - range * 0.5, fib0618: a.res - range * 0.618, fib0786: a.res - range * 0.786,
    };
    allSupports.push(a.sup); allResistances.push(a.res);
  }
  const confluenceZones = [];
  const fibKeys = ["fib0236", "fib0382", "fib05", "fib0618", "fib0786"];
  const tfNames = Object.keys(allFibLevels);
  for (const key of fibKeys) {
    const values = tfNames.map(tf => allFibLevels[tf]?.[key]).filter(v => v && v > 0);
    if (values.length < 2) continue;
    const clusters = [];
    for (const v of values) {
      let added = false;
      for (const c of clusters) { if (Math.abs(c.avg - v) / c.avg < 0.005) { c.values.push(v); c.avg = c.values.reduce((a, b) => a + b, 0) / c.values.length; added = true; break; } }
      if (!added) clusters.push({ avg: v, values: [v], tfs: [tfNames[values.indexOf(v)]] });
    }
    for (const c of clusters) { if (c.values.length >= 2) confluenceZones.push({ fibLevel: key, price: Math.round(c.avg * 100) / 100, tfs: c.tfs, count: c.values.length }); }
  }
  confluenceZones.sort((a, b) => b.count - a.count);
  return { fibLevels: allFibLevels, confluenceZones: confluenceZones.slice(0, 5), globalSup: Math.min(...allSupports), globalRes: Math.max(...allResistances) };
}

function detectMTFEntry(mtfData, flowDirection) {
  const tfs = {};
  for (const [name, data] of Object.entries(mtfData)) { if (data.analysis) tfs[name] = data.analysis; }
  if (!tfs["5m"] || !tfs["15m"]) return null;

  const tfOrder = ["3D", "1D", "4H", "1H", "15m", "5m"];
  let bullishWeight = 0, bearishWeight = 0;
  for (const tf of tfOrder) {
    const a = tfs[tf]; if (!a) continue;
    const weight = tfOrder.indexOf(tf) + 1;
    if (a.direction === "bullish") bullishWeight += weight; else if (a.direction === "bearish") bearishWeight += weight;
  }
  const mtfDirection = bullishWeight > bearishWeight ? "bullish" : bearishWeight > bullishWeight ? "bearish" : "lateral";
  const mtfScore = Math.max(bullishWeight, bearishWeight);
  const mtfTotal = bullishWeight + bearishWeight;
  const mtfConfidence = mtfTotal > 0 ? Math.round((mtfScore / mtfTotal) * 100) : 0;
  const finalDirection = flowDirection === "long" ? "bullish" : "bearish";

  if (mtfDirection !== "lateral" && mtfDirection !== finalDirection && mtfConfidence > 60) {
    return { conflict: true, mtfDirection, mtfConfidence, flowDirection, message: "⚠️ Conflito: fluxo diz " + flowDirection + " mas TFs maiores dizem " + mtfDirection + " (" + mtfConfidence + "%) — aguardar confluência" };
  }

  const tf5m = tfs["5m"]; const tf15m = tfs["15m"]; const tf1h = tfs["1H"]; const tf4h = tfs["4H"]; const tf1d = tfs["1D"];

  // === SQUEEZE SETUP DETECTION (user's pattern) ===
  // SQZMOM subindo em 4H/1H/15m, preço esticado, esperar pullback
  const sqz4h = tf4h?.squeeze;
  const sqz1h = tf1h?.squeeze;
  const sqz15m = tf15m?.squeeze;

  // Check: squeeze moving up across multiple TFs
  const squeezeUp = [sqz15m, sqz1h, sqz4h].filter(s => s && s.direction === "up" && s.momentum > 0.1);
  const squeezeUpCount = squeezeUp.length;

  // Check: price stretched (far from EMA20)
  const stretchedTFs = [tf5m, tf15m, tf1h, tf4h].filter(a => a && a.stretched);
  const stretchedCount = stretchedTFs.length;

  // Check: pullback happening (price coming back to EMA)
  const pullingBack = tf5m?.pullingBack || tf15m?.pullingBack;
  const pullbackTF = pullingBack ? (tf5m?.pullingBack ? "5m" : "15m") : null;

  // SQUEEZE BIOME: squeeze up across TFs + price stretched + waiting for pullback
  const squeezeBiome = squeezeUpCount >= 2 && stretchedCount >= 2;
  const pullbackReady = squeezeBiome && pullingBack;

  // === ENTRY LOGIC ===
  let entryPrice, slPrice, slPct, reason, setupType = "standard";

  if (pullbackReady) {
    // Pullback entry: buying the dip in an uptrend
    setupType = "pullback";
    const tf = tf5m.pullingBack ? tf5m : tf15m;
    entryPrice = tf.lastClose;
    slPrice = Math.min(tf5m.sup, tf15m.sup);
    slPct = Math.max(0.3, Math.min(4, Math.abs((slPrice - entryPrice) / entryPrice) * 100));
    reason = "🧵 PULLBACK: Squeeze up " + squeezeUpCount + "TFs. Preço esticado, recuando pra EMA9. " + (tf5m.pattern ? tf5m.pattern + " 5m" : "");
  } else if (squeezeBiome) {
    // Squeeze detected but no pullback yet — alert
    return { conflict: true, mtfDirection, mtfConfidence, flowDirection, message: "⚡ SQUEEZE UP " + squeezeUpCount + "TFs. Preço esticado em " + stretchedCount + "TFs. Aguardar pullback pra entrar." };
  } else {
    // Standard entry (original logic)
    if (tf5m.direction !== finalDirection && tf5m.strength < 50) return null;
    const higherTFConfirms = (tf15m.direction === finalDirection || tf1h?.direction === finalDirection);
    if (!higherTFConfirms) return null;
    entryPrice = tf5m.lastClose;
    const sl5m = tf5m.sup; const sl15m = tf15m.sup;
    slPrice = finalDirection === "bullish" ? Math.min(sl5m, sl15m) : Math.max(tf5m.res, tf15m.res);
    slPct = finalDirection === "bullish" ? Math.abs((slPrice - entryPrice) / entryPrice * 100) : Math.abs((entryPrice - slPrice) / entryPrice * 100);
    slPct = Math.max(0.3, Math.min(5, slPct));
    const confirmTFs = [tf5m, tf15m, tf1h].filter(a => a && a.direction === finalDirection).map(a => a.tf);
    reason = "MTF: " + (finalDirection === "bullish" ? "LONG" : "SHORT") + " " + confirmTFs.join("+") + " confirmam. " + (tf5m.pattern ? tf5m.pattern + " 5m" : "");
  }

  const fib = fibConfluence(mtfData, finalDirection);
  const targets = finalDirection === "bullish" || setupType === "pullback"
    ? [{ pct: 3, price: entryPrice * 1.03, fibLevel: "0.382" }, { pct: 7, price: entryPrice * 1.07, fibLevel: "0.618" }, { pct: 10, price: entryPrice * 1.10, fibLevel: "0.786" }]
    : [{ pct: 3, price: entryPrice * 0.97, fibLevel: "0.382" }, { pct: 7, price: entryPrice * 0.93, fibLevel: "0.618" }, { pct: 10, price: entryPrice * 0.90, fibLevel: "0.786" }];

  if (fib.confluenceZones.length) reason += " | Fib " + fib.confluenceZones[0].fibLevel + " (" + fib.confluenceZones[0].tfs.join(",") + ")";

  return { entryPrice, slPrice, slPct: Math.round(slPct * 10) / 10, reason, targets, fib, mtfDirection, mtfConfidence, tf5m: tf5m.direction, tf15m: tf15m.direction, tf1h: tf1h?.direction || "N/A", tf4h: tf4h?.direction || "N/A", tf1d: tf1d?.direction || "N/A", tf3d: tfs["3D"]?.direction || "N/A", pattern5m: tf5m.pattern, pattern15m: tf15m.pattern, squeezeBiome, pullbackReady, squeezeUpCount, stretchedCount, setupType };
}

async function mtfScanner() {
  try {
    const flow = loadFlow(); if (!flow) return;
    const syms = getActiveSymbols(); if (syms.length < 2) return;
    const direction = flow.regime === "fluxo_entrada" ? "long" : flow.regime === "fluxo_saida" ? "short" : null;
    if (Object.entries(positionParams).find(([k, v]) => v.tpLevels)) return;
    scalpSetups = [];
    for (const sym of syms) {
      const baseSym = sym.split("-")[0];
      if (CACHE.positions.some(p => p.instId.includes(baseSym))) continue;
      const mtfData = await fetchAllTF(sym);
      if (!mtfData["5m"] || !mtfData["15m"]) continue;
      const entry = detectMTFEntry(mtfData, direction || "long");
      if (!entry) continue;
      if (entry.conflict) { console.log("[MTF] " + sym + ": " + entry.message); continue; }
      const stakeUsd = tradingConfig.stake_amount || 10;
      const swapSym = baseSym + "-USDT-SWAP";
      scalpSetups.push({ symbol: sym, direction: direction || "long", entryPrice: entry.entryPrice, slPrice: entry.slPrice, slPct: entry.slPct, targets: entry.targets, reason: entry.reason, flow: flow.regime, stake: stakeUsd, swapSym, timestamp: Date.now(), setupType: entry.setupType || "standard", squeezeBiome: entry.squeezeBiome, pullbackReady: entry.pullbackReady, squeezeUpCount: entry.squeezeUpCount, stretchedCount: entry.stretchedCount, mtf: { tf5m: entry.tf5m, tf15m: entry.tf15m, tf1h: entry.tf1h, tf4h: entry.tf4h, tf1d: entry.tf1d, tf3d: entry.tf3d, confidence: entry.mtfConfidence, confluence: entry.fib.confluenceZones.slice(0, 3) } });
      console.log("[MTF] " + (direction || "LONG").toUpperCase() + " " + baseSym + " @ " + entry.entryPrice.toFixed(2) + " | SL " + entry.slPrice.toFixed(2) + " (" + entry.slPct + "%) | " + (entry.setupType === "pullback" ? "🧵 PULLBACK" : "⚡ DIRECT") + " | " + entry.reason.slice(0, 60));
    }
    broadcastScalpSetups();
  } catch (e) { console.error("[MTF]", e.message); }
}

function broadcastScalpSetups() {
  const msg = JSON.stringify({ type: "scalp", data: scalpSetups.slice(-5) });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

async function manageScalpPosition(p) {
  const posCfg = positionParams[p.instId];
  if (!posCfg || !posCfg.tpLevels) return;
  const ratio = parseFloat(p.ratio); const baseSym = p.instId.replace("-SWAP", "").split("-")[0];
  for (let i = 0; i < posCfg.tpLevels.length; i++) {
    const tp = posCfg.tpLevels[i];
    if (posCfg.tpReached?.[i]) continue;
    if (ratio >= tp.pct) {
      const totalSz = parseFloat(p.qty); const closeSz = Math.max(0.001, totalSz / 3);
      const result = await okxPost("/api/v5/trade/close-position", { instId: p.instId, mgnMode: p.mgnMode || "cross", posSide: p.side, ccy: "USDT", sz: String(closeSz) });
      if (result.code === "0") { if (!posCfg.tpReached) posCfg.tpReached = [false, false, false]; posCfg.tpReached[i] = true; console.log("[SCALP-TP] " + p.instId + " TP" + (i+1) + " (" + tp.pct + "%)"); dailyPnl += ratio / 3; consecutiveLosses = 0; }
    }
  }
  if (posCfg.tpReached?.every(v => v === true)) {
    console.log("[SCALP-TP] " + p.instId + " Todos TPs, fechando resto");
    delete positionParams[p.instId];
    await okxPost("/api/v5/trade/close-position", { instId: baseSym + "-USDT-SWAP", mgnMode: p.mgnMode || "cross", posSide: p.side, ccy: "USDT" });
  }
}

async function analyzeCapitalFlowLoop() {
  await analyzeCapitalFlow();
  await mtfScanner();
  setInterval(async () => { await analyzeCapitalFlow(); await mtfScanner(); }, 60000);
}

// ============================================================
// SIGNAL CHARGE ENGINE — 0-100% readiness meter
// ============================================================
let signalCharge = { pct: 0, aggression: 0, volume: 0, price: 0, confluence: 0, flow: 0, bar: "⬜".repeat(10), message: "Aguardando...", lastUpdate: 0 };

async function computeSignalCharge() {
  try {
    const flow = loadFlow();
    const syms = getActiveSymbols();
    const btcSym = syms.find(s => s.includes("BTC"));
    if (!btcSym) return;

    // Fetch multi-TF candles for BTC
    const [r5, r15, r1, r4] = await Promise.all([
      fetchCandles(btcSym, "5m", 20),
      fetchCandles(btcSym, "15m", 20),
      fetchCandles(btcSym, "1H", 20),
      fetchCandles(btcSym, "4H", 10),
    ]);

    // --- AGGRESSION (0-100) ---
    // Candle body strength across TFs
    let aggScore = 0;
    for (const candles of [r5, r15, r1, r4]) {
      if (!candles.length) continue;
      const last = candles[candles.length - 1];
      const body = Math.abs(last.c - last.o);
      const range = last.h - last.l || 1;
      const bodyPct = body / range;
      const upperWick = last.h - Math.max(last.c, last.o);
      const lowerWick = Math.min(last.c, last.o) - last.l;
      // Strong body + no lower wick (bullish) = aggression
      if (bodyPct > 0.5 && lowerWick / range < 0.15) aggScore += 25;
      else if (bodyPct > 0.3) aggScore += 15;
      // Volume spike adds aggression
      const vols = candles.map(c => c.vol);
      const avgVol = vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1) || 1;
      if (last.vol > avgVol * 1.5) aggScore += 10;
    }
    const aggression = Math.min(100, Math.round(aggScore));

    // --- VOLUME (0-100) ---
    let volScore = 0;
    for (const candles of [r5, r15, r1, r4]) {
      if (!candles.length) continue;
      const vols = candles.map(c => c.vol);
      const avgVol = vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1) || 1;
      const lastVol = vols[vols.length - 1];
      const ratio = lastVol / avgVol;
      if (ratio > 2) volScore += 25;
      else if (ratio > 1.5) volScore += 15;
      else if (ratio > 1.2) volScore += 8;
    }
    const volume = Math.min(100, Math.round(volScore));

    // --- PRICE STRUCTURE (0-100) ---
    let priceScore = 0;
    // Check if near support/resistance or BOS
    for (const candles of [r5, r15, r1]) {
      if (!candles.length) continue;
      const last = candles[candles.length - 1];
      const high10 = Math.max(...candles.slice(-10).map(c => c.h));
      const low10 = Math.min(...candles.slice(-10).map(c => c.l));
      const nearRes = (high10 - last.c) / last.c * 100 < 0.5;
      const nearSup = (last.c - low10) / low10 * 100 < 0.5;
      const prevHigh10 = Math.max(...candles.slice(-11, -1).map(c => c.h));
      const bos = last.c > prevHigh10;
      if (bos) priceScore += 20;
      if (nearRes) priceScore += 10;
      if (nearSup) priceScore += 10;
    }
    // Price stretch from EMA20
    for (const candles of [r5, r15]) {
      if (!candles.length) continue;
      const closes = candles.map(c => c.c);
      const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const stretch = Math.abs((closes[closes.length - 1] - ema20) / ema20) * 100;
      if (stretch < 1 && stretch > 0.2) priceScore += 10; // sweet spot
    }
    const price = Math.min(100, Math.round(priceScore));

    // --- MULTI-TF CONFLUENCE (0-100) ---
    let confScore = 0;
    for (const candles of [r5, r15, r1, r4]) {
      if (!candles.length) continue;
      const closes = candles.map(c => c.c);
      const ema9 = closes.slice(-9).reduce((a, b) => a + b, 0) / 9;
      const ema20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const last = candles[candles.length - 1];
      if (last.c > ema9 && last.c > ema20) confScore += 15;
      else if (last.c > ema9) confScore += 8;
    }
    const confluence = Math.min(100, Math.round(confScore));

    // --- FLOW (0-100) ---
    let flowScore = 50;
    if (flow) {
      if (flow.regime === "fluxo_entrada") flowScore = 90;
      else if (flow.regime === "fluxo_saida") flowScore = 80;
      else if (flow.regime === "btc_dominando") flowScore = 70;
      else if (flow.regime === "altseason") flowScore = 65;
      else if (flow.regime === "neutro") flowScore = 40;
      else if (flow.regime === "alts_sangrando") flowScore = 25;
      if (flow.btcHistory && flow.btcHistory.length >= 2) {
        const lastDom = flow.btcHistory[flow.btcHistory.length - 1].dominance;
        const prevDom = flow.btcHistory[flow.btcHistory.length - 2].dominance;
        const domDrop = prevDom - lastDom;
        if (domDrop > 0.3) flowScore += 15; // USDT.D dropping hard = money entering crypto
      }
    }
    const fScore = Math.min(100, Math.round(flowScore));

    // --- COMPOSITE ---
    const total = Math.round(aggression * 0.30 + volume * 0.20 + price * 0.20 + confluence * 0.15 + fScore * 0.15);
    const pct = Math.min(100, Math.max(0, total));

    // Build visual bar
    const filled = Math.round(pct / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);

    // Message
    let message = "";
    if (pct >= 85) message = "🔥 DISPARAR! Multiplos TFs confirmando";
    else if (pct >= 70) message = "⚡ CARREGADO — aguardando gatilho final";
    else if (pct >= 50) message = "📈 Aquecendo — fluxo e volume favoraveis";
    else if (pct >= 30) message = "⏳ Monitorando — sem confluencia ainda";
    else message = "💤 Mercado sem direcao clara";

    // Add aggression context
    if (aggression >= 70) message += " | Agressao alta";
    else if (aggression >= 50) message += " | Movimento moderado";

    signalCharge = { pct, aggression, volume, price, confluence, flow: fScore, bar, message, lastUpdate: Date.now() };

    // Broadcast
    const msg = JSON.stringify({ type: "signal_charge", data: signalCharge });
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });

    // Update avatar if charge is high
    if (pct >= 70 && avatarState.mood !== "confiante") {
      avatarState.thought = message;
      avatarState.mood = "confiante";
      avatarState.lastUpdate = Date.now();
      broadcastAvatar();
    } else if (pct >= 85) {
      avatarState.thought = "🔥 " + message;
      avatarState.mood = "alerta";
      avatarState.lastUpdate = Date.now();
      broadcastAvatar();
    }

  } catch (e) { console.error("[CHARGE]", e.message); }
}

// Wire into autoAnalysisLoop
const _origAutoAnalysis = autoAnalysisLoop;
autoAnalysisLoop = async function() {
  await _origAutoAnalysis.call(this);
  await computeSignalCharge();
};

// Separate fast loops: signal charge every 30s, optimizer every 5min
setInterval(async () => {
  if (!globalThis._chargeRunning) {
    globalThis._chargeRunning = true;
    try { await computeSignalCharge(); } catch (e) { console.error("[CHARGE-LOOP]", e.message); }
    globalThis._chargeRunning = false;
  }
}, 30000);

setInterval(async () => {
  await runConfidenceOptimizer();
}, 300000); // 5min

// ============================================================
// CONFIDENCE OPTIMIZER AGENT — auto-ajuste na nuvem
// ============================================================
let optimizerState = {
  lastRun: 0,
  cycle: 0,
  winRate: 0.5,
  avgProfit: 0,
  avgLoss: 0,
  sharpe: 0,
  kelly: 0.25,
  confidenceThreshold: 70,
  stakeMultiplier: 1.0,
  maxTrades: 10,
  adjustments: [],
  regime: "aprendendo",
  message: "Inicializando...",
};

async function runConfidenceOptimizer() {
  try {
    const results = loadResults();
    const trades = results.trades || [];
    const closed = trades.filter(t => t.closed);
    if (closed.length < 3) {
      optimizerState.message = "Aguardando dados (" + closed.length + " trades fechados)";
      optimizerState.regime = "aprendendo";
      return;
    }

    const recent = closed.slice(-30);
    const wins = recent.filter(t => t.profit > 0);
    const losses = recent.filter(t => t.profit <= 0);
    const winRate = wins.length / Math.max(recent.length, 1);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.profit, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.profit, 0)) / losses.length : 1;
    const totalPnl = recent.reduce((s, t) => s + t.profit, 0);
    const stdDev = Math.sqrt(recent.reduce((s, t) => s + (t.profit - totalPnl / recent.length) ** 2, 0) / recent.length) || 1;
    const sharpe = stdDev > 0 ? (avgWin * winRate - avgLoss * (1 - winRate)) / stdDev * Math.sqrt(365) : 0;

    // Kelly Criterion
    const b = avgWin / Math.max(avgLoss, 0.01);
    const q = 1 - winRate;
    const kelly = Math.max(0.05, Math.min(0.5, (winRate * b - q) / b || 0.25));

    // Confidence threshold adjustment
    let threshold = 70;
    if (sharpe > 1.5) threshold = Math.max(60, threshold - 5); // Consistent → relax
    else if (sharpe < 0.5) threshold = Math.min(85, threshold + 5); // Inconsistent → tighten
    if (winRate > 0.6) threshold = Math.max(60, threshold - 3);   // High WR → lower threshold
    if (winRate < 0.35) threshold = Math.min(85, threshold + 5);  // Low WR → raise bar

    // Stake adjustment by Kelly
    const baseStake = tradingConfig.stake_amount || 5;
    const kellyStake = Math.round(baseStake * kelly * 2.5);
    const stakeMultiplier = Math.max(0.5, Math.min(1.5, kellyStake / baseStake));

    // Max trades: scale with confidence
    let maxTrades = tradingConfig.max_open_trades || 10;
    if (sharpe > 1.0 && winRate > 0.5) maxTrades = Math.min(10, maxTrades + 1);
    else if (sharpe < 0.3) maxTrades = Math.max(2, maxTrades - 1);

    // Regime classification
    let regime = "neutro";
    if (sharpe > 1.2 && winRate > 0.55) regime = "confiante";
    else if (sharpe > 0.8 && winRate > 0.45) regime = "estavel";
    else if (sharpe < 0.3 || winRate < 0.35) regime = "cautela";
    else regime = "ajustando";

    const prev = optimizerState;
    const adjustments = [];

    // Only apply changes if they differ meaningfully
    if (Math.abs(prev.confidenceThreshold - threshold) >= 3) {
      adjustments.push("confianca " + prev.confidenceThreshold + "% → " + threshold + "%");
    }
    if (Math.abs(prev.stakeMultiplier - stakeMultiplier) >= 0.1) {
      adjustments.push("stake " + (prev.stakeMultiplier * 100).toFixed(0) + "% → " + (stakeMultiplier * 100).toFixed(0) + "%");
    }
    if (prev.maxTrades !== maxTrades) {
      adjustments.push("maxTrades " + prev.maxTrades + " → " + maxTrades);
    }

    // Apply adjustments to tradingConfig
    if (adjustments.length > 0) {
      tradingConfig.stake_amount = Math.max(1, Math.round(baseStake * stakeMultiplier));
      tradingConfig.max_open_trades = maxTrades;
      saveConfig();
    }

    // Build message
    let message = "";
    if (regime === "confiante") message = "🟢 Confiante — Sharpe " + sharpe.toFixed(1) + " WR " + (winRate * 100).toFixed(0) + "% — relaxando criterios";
    else if (regime === "cautela") message = "🔴 Cautela — Sharpe " + sharpe.toFixed(1) + " WR " + (winRate * 100).toFixed(0) + "% — endurecendo criterios";
    else if (regime === "estavel") message = "🟡 Estavel — Sharpe " + sharpe.toFixed(1) + " WR " + (winRate * 100).toFixed(0) + "% — mantendo parametros";
    else message = "⏳ Ajustando — " + closed.length + " trades, WR " + (winRate * 100).toFixed(0) + "%";

    if (adjustments.length > 0) message += " | Ajustes: " + adjustments.join("; ");

    optimizerState = {
      lastRun: Date.now(),
      cycle: prev.cycle + 1,
      winRate: Math.round(winRate * 100) / 100,
      avgProfit: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      sharpe: Math.round(sharpe * 100) / 100,
      kelly: Math.round(kelly * 100) / 100,
      confidenceThreshold: threshold,
      stakeMultiplier: Math.round(stakeMultiplier * 100) / 100,
      maxTrades,
      adjustments: (prev.adjustments || []).concat(adjustments).slice(-20),
      regime,
      message,
      totalTrades: closed.length,
      recentTrades: recent.length,
    };

    // Broadcast
    const msg = JSON.stringify({ type: "optimizer", data: optimizerState });
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });

    console.log("[OPTIMIZER] " + message);

  } catch (e) { console.error("[OPTIMIZER]", e.message); }
}

// Wire into autoAnalysisLoop (runs every 60s, optimizer every 30min)
// autoAnalysisLoop is already defined above with computeSignalCharge
// Optimizer runs on its own 5min setInterval — no need to duplicate

const STRATEGY_GUIDE = [
  {
    id: "rsi_scalper",
    name: "RSI Scalper",
    ideal: "Mercado lateral (sideways)",
    like: "Um scalper profissional que compra na ansiedade e vende na euforia",
    explanation: "O RSI (Relative Strength Index) mede a forca do movimento. Quando RSI < 30, o mercado esta 'sobrevendido' — pessimismo excessivo, boa hora de comprar. Quando RSI > 70, esta 'sobrecomprado' — euforia excessiva, hora de vender.",
    howToUse: "Ative em mercados sem tendencia clara, quando o preco oscila entre suporte e resistencia. Nunca ative em tendencias fortes (pode vender muito cedo).",
    entry: "RSI < 30 (oversold)",
    exit: "RSI > 70 (overbought) ou por stoploss/takeprofit",
    params: { rsi_period: 14, oversold: 30, overbought: 70 },
    risk: "medio",
  },
  {
    id: "ema_cross",
    name: "EMA Cross",
    ideal: "Tendencia definida (alta ou baixa)",
    like: "Um surfista que pega a onda no momento certo",
    explanation: "Duas medias moveis exponenciais (EMA9 e EMA21). Quando a EMA9 cruza ACIMA da EMA21, e sinal de compra (tendencia de alta). Quando cruza ABAIXO, sinal de venda (tendencia de baixa). Quanto maior o periodo, mais lento e confiavel o sinal.",
    howToUse: "Ative quando identificar uma tendencia clara nos graficos. Evite em mercados laterais (os cruzamentos falsos vao gerar perdas).",
    entry: "EMA9 cruza acima EMA21 (compra) / EMA9 abaixo EMA21 (venda)",
    exit: "Cruzamento oposto ou stoploss",
    params: { ema_fast: 9, ema_slow: 21 },
    risk: "medio",
  },
  {
    id: "bb_reversal",
    name: "Bollinger Reversal",
    ideal: "Mercado volatil com reversoes",
    like: "Um elastico esticado que sempre volta ao normal",
    explanation: "As Bandas de Bollinger se expandem e contraem com a volatilidade. Quando o preco encosta na banda inferior, tende a reverter para cima. Quando encosta na banda superior, tende a reverter para baixo. Quanto mais estreitas as bandas, maior a chance de um movimento forte.",
    howToUse: "Ative quando as bandas estiverem apertadas (baixa volatilidade) — sinal de que um movimento grande esta por vir. Ou quando o preco tocar as bandas extremas.",
    entry: "Preco toca banda inferior (compra) ou banda superior (venda)",
    exit: "Preco volta a media movel (centro) ou stoploss",
    params: { bb_period: 20, bb_std: 2 },
    risk: "medio",
  },
  {
    id: "macd_momentum",
    name: "MACD Momentum",
    ideal: "Momentum forte e tendencia",
    like: "Um motor que mede a aceleracao do movimento",
    explanation: "O MACD mostra a relacao entre duas medias moveis. Quando a linha MACD cruza acima da linha de sinal, o momentum esta positivo (compra). Quando cruza abaixo, momentum negativo (venda). O histograma mostra a forca do momentum.",
    howToUse: "Melhor em timeframes maiores (4h+). Ative quando houver divergencia no MACD (preco fazendo fundo mais baixo mas MACD fazendo fundo mais alto) — sinal de reversao forte.",
    entry: "MACD cruza acima da linha de sinal",
    exit: "MACD cruza abaixo da linha de sinal",
    params: { macd_fast: 12, macd_slow: 26, macd_signal: 9 },
    risk: "baixo",
  },
  {
    id: "grid_scalper",
    name: "Grid Scalper",
    ideal: "Mercado lateral estreito",
    like: "Um pescador que coloca varias redes e espera o peixe cair",
    explanation: "Coloca multiplas ordens de compra e venda em uma grade de precos. Cada vez que o preco bate em um nivel, executa uma ordem. Ideal para mercados que ficam oscilando numa faixa estreita. Lucra com a volatilidade em vez de lutar contra ela.",
    howToUse: "Ative APENAS quando o mercado estiver claramente lateral por horas ou dias. Defina o range com base no suporte e resistencia.",
    entry: "Ordens limitadas distribuidas em niveis pre-definidos",
    exit: "Ordens de venda nos niveis superiores da grade",
    params: { grid_levels: 10, grid_spread: 0.5 },
    risk: "alto",
  },
  {
    id: "smart_breakout",
    name: "Smart Breakout",
    ideal: "Rompimentos com volume",
    like: "Um surfista que pega a onda gigante quando ela quebra",
    explanation: "Detecta quando o preco rompe um nivel importante (suporte/resistencia) COM VOLUME. Se o volume esta alto, o rompimento e verdadeiro. Se o volume esta baixo, pode ser 'fakeout'. Usa RSI para confirmar o momento.",
    howToUse: "Ative em mercados que estao comprimidos (acumulando) ha algum tempo. O rompimento tende a ser forte. Nao ative em mercados ja muito volateis.",
    entry: "Breakout de resistencia com volume alto",
    exit: "Stop loss no nivel rompido ou take profit no proximo alvo",
    params: { breakout_period: 20, volume_threshold: 1.5 },
    risk: "alto",
  },
];

// ============================================================
// EXPRESS ROUTES (continued)
// ============================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Market data
app.get("/api/market", (req, res) => res.json({ prices: CACHE.prices, lastUpdate: CACHE.lastUpdate }));
app.get("/api/top-assets", async (req, res) => res.json({ assets: await fetchTop() }));

// Trading config
app.get("/api/config/trading", (req, res) => res.json(tradingConfig));
app.post("/api/config/trading", (req, res) => {
  delete req.body.stoploss;
  delete req.body.take_profit;
  delete req.body.use_take_profit;
  Object.assign(tradingConfig, req.body);
  saveConfig();
  res.json({ success: true, config: tradingConfig });
});

// Trading mode
app.get("/api/config/mode", (req, res) => {
  res.json({ mode: tradingMode });
});
app.post("/api/config/mode", (req, res) => {
  setTradingMode(req.body.mode || "moderado");
  res.json({ success: true, mode: tradingMode });
});

// Assets
app.post("/api/config/assets/toggle", (req, res) => {
  const a = tradingConfig.active_assets.find(a => a.symbol === req.body.symbol);
  if (a) a.active = !a.active; else tradingConfig.active_assets.push({ symbol: req.body.symbol, name: req.body.symbol.replace("-USDT", ""), active: true });
  saveConfig(); refreshMarket();
  res.json({ success: true, assets: tradingConfig.active_assets });
});
app.post("/api/config/assets/add", (req, res) => {
  if (!tradingConfig.active_assets.find(a => a.symbol === req.body.symbol))
    tradingConfig.active_assets.push({ symbol: req.body.symbol, name: req.body.symbol.replace("-USDT", ""), active: true });
  saveConfig(); refreshMarket();
  res.json({ success: true, assets: tradingConfig.active_assets });
});
app.post("/api/config/assets/remove", (req, res) => {
  tradingConfig.active_assets = tradingConfig.active_assets.filter(a => a.symbol !== req.body.symbol);
  saveConfig();
  res.json({ success: true, assets: tradingConfig.active_assets });
});
app.post("/api/config/assets/set", (req, res) => {
  tradingConfig.active_assets = req.body.symbols.map(s => ({ symbol: s, name: s.replace("-USDT", ""), active: true }));
  saveConfig(); refreshMarket();
  res.json({ success: true, assets: tradingConfig.active_assets });
});

// Strategies
app.get("/api/strategies", (req, res) => res.json(strategies));
app.post("/api/strategies/toggle", (req, res) => {
  strategies.forEach(s => s.active = s.id === req.body.id ? !s.active : false);
  saveStrategies();
  res.json({ success: true, strategies });
});
app.post("/api/strategies/update", (req, res) => {
  const s = strategies.find(s => s.id === req.body.id);
  if (s && req.body.params) Object.assign(s.params, req.body.params);
  saveStrategies();
  res.json({ success: true, strategies });
});

// Bot control — rodando no proprio VPS
app.get("/api/bot/status", (req, res) => {
  res.json({
    online: botRunning,
    positions: CACHE.positions,
    balance: CACHE.balance,
    uptime: botRunning ? Math.floor((Date.now() - (CACHE.positions[0]?.ts || Date.now())) / 1000) : 0,
  });
});
app.post("/api/bot/start", (req, res) => { startBot(); res.json({ success: true, status: "started" }); });
app.post("/api/bot/stop", (req, res) => { stopBot(); res.json({ success: true, status: "stopped" }); });

// Real balance from OKX
app.get("/api/balance/real", async (req, res) => {
  const bal = await okxGet("/api/v5/account/balance");
  res.json(bal);
});

// Positions
app.get("/api/positions", async (req, res) => {
  await refreshPositions();
  res.json({ positions: CACHE.positions, balance: CACHE.balance });
});

// Close position
app.post("/api/trade/close-position", async (req, res) => {
  const { instId, mgnMode, posSide } = req.body;
  const base = instId || (posSide ? CACHE.positions.find(p => p.side === posSide)?.instId : null);
  if (!base) return res.status(400).json({ error: "instId obrigatorio" });
  const result = await okxPost("/api/v5/trade/close-position", {
    instId: base, mgnMode: mgnMode || "cross",
    posSide: posSide || "net", ccy: "USDT",
  });
  await refreshPositions();

  // Learn from result
  const pos = CACHE.positions.find(p => p.instId === base);
  if (pos && result.code === "0") {
    const profit = parseFloat(pos.upl);
    const mkt = recentAnalyses[0]?.data?.mercado || "lateral";
    const conf = recentAnalyses[0]?.data?.confianca || 50;
    learnFromResult({
      strategy: strategies.find(s => s.active)?.id || "unknown",
      market: mkt,
      profit: profit,
      instId: base,
      closed: true,
      entryPx: pos.entryPx,
      exitPx: pos.markPx,
    });
    // Also update pattern learning from patterns that led to this trade
    const latestPatterns = avatarState.patterns?.results || {};
    const symBase = base.replace("-SWAP", "");
    const symKey = Object.keys(latestPatterns).find(k => k.includes(symBase.split("-")[0]));
    if (symKey && latestPatterns[symKey]) {
      const entryPats = latestPatterns[symKey]
        .filter(p => p.strength === "alto")
        .map(p => p.type)
        .slice(0, 5);
      updatePatternLearning({ entryPatterns: entryPats, profit, instId: base });
    }
  }

  // Update auto-trade state
  if (result.code === "0") {
    const st = loadAutoTradeState();
    if (pos && parseFloat(pos.upl) > 0) st.wins++; else if (pos) st.losses++;
    st.profit += parseFloat(pos?.upl || 0);
    saveAutoTradeState(st);
  }

  res.json({ success: result.code === "0", data: result });
});

// Close all positions
app.post("/api/trade/close-all", async (req, res) => {
  await refreshPositions();
  const results = [];
  for (const p of CACHE.positions) {
    const r = await okxPost("/api/v5/trade/close-position", {
      instId: p.instId, mgnMode: p.mgnMode || "cross",
      posSide: p.side, ccy: "USDT",
    });
    results.push({ instId: p.instId, ok: r.code === "0" });
    // Register learning for each closed position
    if (r.code === "0" && parseFloat(p.upl)) {
      learnFromResult({
        strategy: strategies.find(s => s.active)?.id || "unknown",
        market: recentAnalyses[0]?.data?.mercado || "lateral",
        profit: parseFloat(p.upl),
        instId: p.instId,
        closed: true,
        entryPx: p.entryPx,
        exitPx: p.markPx,
      });
    }
    delete positionParams[p.instId];
  }
  positionParams = {};
  await refreshPositions();
  res.json({ success: true, results });
});

// Place order (spot)
app.post("/api/trade/order", async (req, res) => {
  const { instId, side, sz, px, ordType } = req.body;
  if (!instId || !side || !sz) return res.status(400).json({ error: "instId, side, sz obrigatorios" });
  const result = await okxPost("/api/v5/trade/order", {
    instId: instId.endsWith("-USDT") ? instId : instId + "-USDT",
    tdMode: "cash",
    side, ordType: ordType || "market",
    sz: String(sz),
    ...(px ? { px: String(px) } : {}),
  });
  res.json({ success: result.code === "0", data: result });
});

// Opportunities
app.get("/api/opportunities", (req, res) => {
  const opps = [];
  Object.entries(CACHE.prices).forEach(([s, p]) => {
    const price = parseFloat(p.last);
    const high = parseFloat(p.high24h);
    const low = parseFloat(p.low24h);
    const rsi = low === high ? 50 : ((price - low) / (high - low)) * 100;
    if (rsi < 35) opps.push({ symbol: s, direction: "buy", confidence: ((35 - rsi) * 2).toFixed(0), reason: `RSI ${rsi.toFixed(0)} — oversold`, price, suggested_sl: tradingConfig.stoploss, suggested_tp: tradingConfig.take_profit });
    else if (rsi > 65) opps.push({ symbol: s, direction: "sell", confidence: ((rsi - 65) * 2).toFixed(0), reason: `RSI ${rsi.toFixed(0)} — overbought`, price, suggested_sl: tradingConfig.stoploss, suggested_tp: tradingConfig.take_profit });
  });
  res.json({ opportunities: opps });
});

// Guide
app.get("/api/guide", (req, res) => res.json({ strategies: STRATEGY_GUIDE }));

// AI Analysis — trigger manual analysis (preserved for manual use)
app.get("/api/ai/analyze", async (req, res) => {
  const forceFull = req.query.full === "true";
  const result = await analyzeStrategies(forceFull);
  res.json(result);
});

app.get("/api/ai/status", (req, res) => {
  const saved = loadAnalysis();
  res.json({
    pilotActive: aiPilotActive,
    recentAnalyses: recentAnalyses.slice(0, 7),
    macroAge: saved.macro ? Math.floor((Date.now() - saved.macroTs) / 1000) + "s" : "N/A",
    quickAge: saved.quick ? Math.floor((Date.now() - saved.quickTs) / 1000) + "s" : "N/A",
  });
});

app.get("/api/ai/history", (req, res) => {
  res.json({ history: recentAnalyses.slice(0, 7) });
});

// Avatar + Patterns
app.get("/api/ai/avatar", (req, res) => {
  res.json(avatarState);
});

app.get("/api/ai/patterns", (req, res) => {
  res.json({ patterns: recentPatterns.slice(-20), total: avatarState.patternsFound });
});

// Auto-Trade
app.get("/api/auto-trade/status", (req, res) => {
  const state = loadAutoTradeState();
  res.json({ active: botRunning, setups: activeSetups, state });
});

app.post("/api/auto-trade/toggle", (req, res) => {
  const { active } = req.body;
  if (active) startBot(); else stopBot();
  res.json({ success: true, active: botRunning });
});

// Pattern Learning
app.get("/api/ai/pattern-learning", (req, res) => {
  res.json(loadPatternLearning());
});

app.get("/api/ai/trap-log", (req, res) => {
  const tl = loadTrapLog();
  res.json({ traps: tl.traps.slice(-30) });
});

// Signal charge
app.get("/api/signal/charge", (req, res) => {
  res.json(signalCharge);
});

// Confidence Optimizer
app.get("/api/optimizer", (req, res) => {
  res.json(optimizerState);
});

// Institutional indicators from latest analysis
app.get("/api/ai/indicators", (req, res) => {
  const latest = recentAnalyses[0]?.data || null;
  res.json({ indicators: latest?.por_ativo || latest?.indicators || {}, mercado: latest?.mercado || "N/A", confianca: latest?.confianca || 0 });
});

app.post("/api/ai/pilot", (req, res) => {
  const { active } = req.body;
  if (active) startAiPilot(); else stopAiPilot();
  res.json({ success: true, pilotActive: aiPilotActive });
});

// Learning
app.post("/api/ai/learn", (req, res) => {
  learnFromResult(req.body);
  res.json({ success: true });
});

app.get("/api/ai/learning", (req, res) => {
  res.json(loadLearning());
});

app.get("/api/ai/results", (req, res) => {
  res.json(loadResults());
});

// ============================================================
// CAPITAL FLOW + FRACTAIS + DIARIO DE BORDO — ROUTES
// ============================================================

// Capital Flow (USDT.D × BTC correlation)
app.get("/api/flow", (req, res) => {
  res.json(loadFlow());
});

// Force refresh flow analysis
app.post("/api/flow/refresh", async (req, res) => {
  await analyzeCapitalFlow();
  res.json({ success: true, data: capitalFlow });
});

// ============================================================
// ECOSYSTEM STATUS
// ============================================================
app.get("/api/ecosystem", (req, res) => {
  let pm2 = [];
  try {
    const out = execSync("pm2 jlist", { timeout: 5000, encoding: "utf8" });
    pm2 = JSON.parse(out).map(p => ({
      id: p.pm_id, name: p.name, status: p.pm2_env.status,
      cpu: p.monit.cpu + "%", mem: (p.monit.memory / 1024 / 1024).toFixed(1) + "MB",
      uptime: p.pm2_env.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000) + "s" : "0s",
      restarts: p.pm2_env.restart_time,
    }));
  } catch {}
  res.json({
    server: { hostname: "severinobot.com", ip: "187.127.42.146", platform: "ubuntu", node: process.version, uptime: Math.floor(process.uptime()) + "s" },
    okx: { active: !!OKX_API_KEY, balance: CACHE.balance?.details?.find(d => d.ccy === "USDT")?.eq || "0" },
    agents: pm2,
    trader: { status: botRunning ? "online" : "offline", positions: CACHE.positions.length, patterns: avatarState.patternsFound, confidence: avatarState.confidence, mood: avatarState.mood },
  });
});

// Pattern research from community (web fetch)
app.get("/api/patterns/research", async (req, res) => {
  try {
    const sources = [
      "https://www.tradingview.com/ideas/cryptocurrency/",
      "https://github.com/topics/crypto-trading-bot",
      "https://www.reddit.com/r/CryptoMarkets/.json?limit=10",
    ];
    const results = [];
    for (const url of sources) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const text = await r.text();
        results.push({ source: url, status: r.status, length: text.length, preview: text.slice(0, 200) });
      } catch (e) { results.push({ source: url, error: e.message }); }
    }
    res.json({ results, communities: [
      { name: "TradingView Crypto", url: "https://www.tradingview.com/ideas/cryptocurrency/" },
      { name: "GitHub — Trading Bots", url: "https://github.com/topics/crypto-trading-bot" },
      { name: "Reddit r/CryptoMarkets", url: "https://www.reddit.com/r/CryptoMarkets/" },
      { name: "Twitter/X #CryptoPatterns", url: "https://twitter.com/search?q=crypto%20pattern%20trading&src=typed_query" },
    ]});
  } catch (e) { res.json({ error: e.message }); }
});

// Fractals (BTC repeating patterns)
app.get("/api/fractal", (req, res) => {
  res.json(fractalState);
});

app.get("/api/fractal/library", (req, res) => {
  const f = loadFractals();
  res.json({ total: f.totalFractals, library: f.fractalLibrary.slice(-50) });
});

// Force fractal scan
app.post("/api/fractal/scan", async (req, res) => {
  await buildFractalLibrary();
  await findFractalMatch();
  res.json({ success: true, data: fractalState });
});

// Scalp endpoints
app.get("/api/scalp", (req, res) => {
  res.json({ setups: scalpSetups.slice(-5) });
});
app.post("/api/scalp/execute", async (req, res) => {
  // Execute a scalp setup as a real trade with 10x leverage
  const setup = scalpSetups[0];
  if (!setup) return res.json({ success: false, error: "No scalp setup" });
  const baseSym = setup.symbol.split("-")[0];
  const swapSym = baseSym + "-USDT-SWAP";
  const side = setup.direction === "long" ? "buy" : "sell";
  try {
    const instr = await okxGet("/api/v5/public/instruments?instType=SWAP&instId=" + swapSym);
    const ctVal = parseFloat(instr?.data?.[0]?.ctVal) || 0.0001;
    const lever = 10;
    // Set leverage for this instrument
    await okxPost("/api/v5/account/set-leverage", { instId: swapSym, lever: String(lever), mgnMode: "cross" });
    const price = setup.entryPrice;
    // Notional = stake * leverage
    const notional = setup.stake * lever;
    const rawSz = notional / (ctVal * price);
    const lotSz = parseFloat(instr?.data?.[0]?.lotSz) || 1;
    const sz = Math.max(Math.round(rawSz / lotSz) * lotSz, 1);
    const result = await okxPost("/api/v5/trade/order", {
      instId: swapSym, tdMode: "cross", side, ordType: "market", sz: String(sz),
    });
    if (result.code === "0") {
      positionParams[swapSym] = {
        sl: -Math.abs(setup.slPct), tp: 10,
        trailing: true, entryPx: price, entryTime: Date.now(), bestRatio: 0,
        tpLevels: setup.targets,
        tpReached: [false, false, false],
      };
      console.log(`[SCALP-EXEC] ${setup.direction.toUpperCase()} ${baseSym} ${setup.stake} USDT x10`);
      scalpSetups = [];
      broadcastScalpSetups();
      res.json({ success: true, result });
    } else {
      res.json({ success: false, error: result.msg || result.code });
    }
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// Diário de Bordo
app.get("/api/journal", (req, res) => {
  res.json(loadJournal());
});

app.post("/api/journal/add", (req, res) => {
  // req.body = { type, title, body, trade: {symbol, side, pnl}, sentimento }
  const entry = journalAdd(req.body || {});
  // Generate Severino's reply
  entry.severinoReply = journalSeverinoReply(entry);
  const j = loadJournal();
  const idx = j.entries.findIndex(e => e.id === entry.id);
  if (idx !== -1) j.entries[idx].severinoReply = entry.severinoReply;
  saveJournal(j);
  res.json({ success: true, entry });
});

app.delete("/api/journal/:id", (req, res) => {
  journalDelete(req.params.id);
  res.json({ success: true });
});

// TradingView-style shared analysis: user posts analysis, Severino stores + replies
app.post("/api/journal/analise", (req, res) => {
  // req.body = { title, body, sentimento }
  const entry = journalAdd({ type: "analysis", title: req.body?.title || "Análise", body: req.body?.body || "", sentimento: req.body?.sentimento || "neutro" });
  entry.severinoReply = journalSeverinoReply(entry);
  const j = loadJournal();
  const idx = j.entries.findIndex(e => e.id === entry.id);
  if (idx !== -1) j.entries[idx].severinoReply = entry.severinoReply;
  saveJournal(j);
  res.json({ success: true, entry });
});

// WebSocket
wss.on("connection", (ws) => {
  // Send latest analysis + avatar state immediately on connect
  if (recentAnalyses.length) {
    ws.send(JSON.stringify({ type: "ai_analysis", data: recentAnalyses[0].data }));
    ws.send(JSON.stringify({ type: "ai_history", data: recentAnalyses.slice(0, 7) }));
  }
  ws.send(JSON.stringify({ type: "avatar", data: avatarState }));
  if (recentPatterns.length) {
    ws.send(JSON.stringify({ type: "patterns", data: recentPatterns.slice(-10) }));
  }
  ws.send(JSON.stringify({ type: "auto_trade", data: {
    active: botRunning,
    setups: activeSetups,
    positions: CACHE.positions.length,
    maxTrades: tradingConfig.max_open_trades,
    state: loadAutoTradeState(),
  }}));

  // Send capital flow, fractal, and journal data on connect
  ws.send(JSON.stringify({ type: "capital_flow", data: loadFlow() }));
  ws.send(JSON.stringify({ type: "fractal", data: fractalState }));
  ws.send(JSON.stringify({ type: "journal", data: loadJournal() }));
  ws.send(JSON.stringify({ type: "scalp", data: scalpSetups.slice(-5) }));
  ws.send(JSON.stringify({ type: "signal_charge", data: signalCharge }));
  ws.send(JSON.stringify({ type: "optimizer", data: optimizerState }));
  ws.send(JSON.stringify({ type: "trading_mode", data: { mode: tradingMode } }));

  const interval = setInterval(async () => {
    await refreshMarket();
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: "market", data: CACHE.prices,
        config: { stoploss: tradingConfig.stoploss, take_profit: tradingConfig.take_profit, botRunning },
        latency: { vpsToOKX: signalLatency.vpsToOKX, dataAge: signalLatency.dataAge, status: signalLatency.status },
      }));
    }
  }, 5000);
  ws.on("close", () => clearInterval(interval));
});

// ============================================================
// START
// ============================================================
async function init() {
  // Load recent analysis history from disk
  recentAnalyses = loadRecent();

  // Seed pattern learning with backtest bootstrap data (only first run)
  seedPatternLearning();

  await refreshMarket();
  setInterval(refreshMarket, 15000);
  setInterval(refreshPositions, 10000);

  // Connect OKX WebSocket for real-time data
  connectOKXWebSocket();

  // Start auto-analysis loop (runs every 60s, updates dashboard)
  startAutoAnalysis();

  // Initialize capital flow, fractal library, and fractal matching
  analyzeCapitalFlowLoop();
  fractalLoop();

  // Auto-start Auto-Pilot (estrategia) — desligar manualmente se quiser
  startAiPilot();

  // Auto-start bot management (gestao + entrada) — desligar manualmente se quiser
  setTimeout(() => startBot(), 5000);

  server.listen(PORT, () => {
    console.log(`Severino Trader Dashboard rodando em http://0.0.0.0:${PORT}`);
    console.log(`OKX API configurada | ${getActiveSymbols().length} ativos ativos`);
    console.log("Eclesiastes 11:1 — \"Lança o teu pão sobre as águas...\"");
  });
}
init();