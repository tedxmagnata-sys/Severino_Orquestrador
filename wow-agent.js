/**
 * 🚀 WOW Agent — Weighted Optimal Window DCA Supervisor
 * -----------------------------------------------------
 * Agente IA que supervisiona o DCA Vault Smart Contract.
 * Analisa: BTC Weather, preço, RSI, MACD, volume, Chainlink oracle
 * Decide: WOW Score → % do saldo → executa swap on-chain
 * Aprende: ajusta thresholds baseado em resultados passados
 *
 * Uso: node wow-agent.js
 * Modo simulação: node wow-agent.js --simulate
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
let ethers;
try { ethers = require('ethers'); } catch {}
const ia = require('./ia');

const DATA_DIR = path.join(__dirname, 'data');
const WOW_STATE_PATH = path.join(DATA_DIR, 'wow-state.json');
const WOW_HISTORY_PATH = path.join(DATA_DIR, 'wow-history.json');

// ===================== Configuração do Contrato =====================
const CONFIG = {
  contractAddress: '0x17CcB86BcAd08dB4BBB13827b609e8bd632F89b5',
  network: 'base-mainnet',
  rpcUrl: 'https://mainnet.base.org',
  explorer: 'https://basescan.org',
  priceFeed: '0xFaaaBC9A5c6c42ee6F942e517C2C77596b233bC8'
};

// ===================== Helpers =====================
function lerJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function salvarJSON(p, d) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}
function getDataBR() {
  const d = new Date(Date.now() - 3 * 3600000);
  return {
    data: d.toISOString().slice(0, 10),
    hora: d.toISOString().slice(11, 16),
    timestamp: d.getTime(),
    diaSemana: d.getDay(),
    semana: Math.ceil((d.getDate() - d.getDay() + 1) / 7)
  };
}

// ===================== BTC Dados =====================
function buscarBTC() {
  return new Promise(r => {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true';
    https.get(url, { headers: { 'User-Agent': 'WOW-Agent/1.0' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (!j.bitcoin) { r(null); return; }
          r({
            preco: j.bitcoin.usd,
            variacao24h: j.bitcoin.usd_24h_change || 0,
            volume24h: j.bitcoin.usd_24h_vol || 0,
            timestamp: new Date().toISOString()
          });
        } catch { r(null); }
      });
    }).on('error', () => r(null)).setTimeout(15000);
  });
}

function buscarOHLC(days = 30) {
  return new Promise(r => {
    https.get(`https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`,
      { headers: { 'User-Agent': 'WOW-Agent/1.0' } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const data = JSON.parse(d);
            if (!Array.isArray(data)) { r(null); return; }
            r(data.map(c => ({ ts: c[0], open: c[1], high: c[2], low: c[3], close: c[4] })));
          } catch { r(null); }
        });
      }).on('error', () => r(null)).setTimeout(15000);
  });
}

// ===================== Indicadores Técnicos =====================
function calcularRSI(prices, period = 14) {
  if (prices.length < period + 1) return [];
  const gains = [], losses = [];
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const rsis = [];
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    if (avgLoss === 0) { rsis.push(100); }
    else { rsis.push(100 - 100 / (1 + avgGain / avgLoss)); }
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  return rsis;
}

function calcularBB(prices, period = 20, stddev = 2) {
  if (prices.length < period) return [];
  const bb = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const v = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std = Math.sqrt(v);
    bb.push({ upper: mean + stddev * std, middle: mean, lower: mean - stddev * std });
  }
  return bb;
}

function calcularMACD(prices) {
  if (prices.length < 26) return null;
  const ema = (data, period) => {
    const k = 2 / (period + 1);
    let e = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return e;
  };
  const fast = ema(prices, 12);
  const slow = ema(prices, 26);
  const macd = fast - slow;
  const signal = ema(prices.slice(-9), 9);
  return { macd, signal, histogram: macd - signal };
}

// ===================== WOW Score (IA) =====================
async function calcularWOWScore(btcDados, candles) {
  const prices = candles.map(c => c.close);
  const rsis = calcularRSI(prices);
  const bb = calcularBB(prices);
  const macd = calcularMACD(prices);
  const rsiAtual = rsis.length > 0 ? rsis[rsis.length - 1] : 50;
  const bbAtual = bb.length > 0 ? bb[bb.length - 1] : null;
  const precoAtual = btcDados?.preco || prices[prices.length - 1];

  // Posição do preço nas Bandas de Bollinger (0=inferior, 100=superior)
  let bbPos = 50;
  if (bbAtual && bbAtual.upper !== bbAtual.lower) {
    bbPos = ((precoAtual - bbAtual.lower) / (bbAtual.upper - bbAtual.lower)) * 100;
  }

  // Regras quantitativas (peso 40%)
  let scoreTecnico = 50;
  if (rsiAtual < 35) scoreTecnico += 25;
  else if (rsiAtual < 40) scoreTecnico += 15;
  else if (rsiAtual > 65) scoreTecnico -= 20;
  else if (rsiAtual > 55) scoreTecnico -= 5;

  if (bbPos < 25) scoreTecnico += 15;
  else if (bbPos < 40) scoreTecnico += 5;
  else if (bbPos > 75) scoreTecnico -= 15;

  if (btcDados?.variacao24h < -3) scoreTecnico += 10;  // Queda forte = oportunidade
  else if (btcDados?.variacao24h > 3) scoreTecnico -= 10; // Alta forte = esperar

  // Regras de IA (peso 60%) - pede para o deepseek analisar
  let scoreIA = 50;
  let analiseIA = '';
  try {
    const promptIA = `Você é o WOW, analista supremo de DCA para Bitcoin.
      Analise o cenário técnico e dê um WOW Score (0-100) onde:
      - 0-30: NÃO comprar (mercado perigoso)
      - 31-50: ESPERAR (neutro, acumular saldo)
      - 51-70: COMPRAR LEVE (oportunidade moderada)
      - 71-100: COMPRAR PESADO (momento ótimo para DCA)
      
      Dados atuais:
      - BTC: $${btcDados?.preco || '?'} (${btcDados?.variacao24h?.toFixed(2) || '?'}% em 24h)
      - RSI(14): ${rsiAtual.toFixed(1)}
      - BB Position: ${bbPos.toFixed(1)}% (0% = inferior, 100% = superior)
      - MACD: ${macd ? macd.histogram.toFixed(2) : 'N/A'}
      
      Responda APENAS no formato:
      SCORE: [0-100]
      JUSTIFICATIVA: [1 frase curta]
      ACAO: [COMPRAR_PESADO | COMPRAR_LEVE | ESPERAR | NAO_COMPRAR]
      ALOCACAO: [% recomendada do saldo disponível, entre 0-50]`;

    const r = await ia.perguntar({
      agente: 'wow-analyst',
      sistema: 'Você é o WOW, analista de DCA. Responda no formato exato solicitado.',
      mensagens: [{ role: 'user', content: promptIA }],
      modelo: 'barato'
    });

    // Parse do resultado
    const scoreMatch = r.texto.match(/SCORE:\s*(\d+)/);
    const acaoMatch = r.texto.match(/ACAO:\s*(\w+)/);
    const alocMatch = r.texto.match(/ALOCACAO:\s*(\d+)/);
    const justMatch = r.texto.match(/JUSTIFICATIVA:\s*(.+)/);

    if (scoreMatch) scoreIA = Math.min(100, Math.max(0, parseInt(scoreMatch[1])));
    if (justMatch) analiseIA = justMatch[1].trim();
    if (alocMatch) {
      const aloc = parseInt(alocMatch[1]);
      // Alocação máxima segura: 50% do saldo, limitado pelo WOW Score
      CONFIG._alocacaoSugerida = Math.min(50, Math.max(0, aloc));
    }
    if (acaoMatch) CONFIG._acaoSugerida = acaoMatch[1];
  } catch (e) {
    console.log('[WOW] IA fallback:', e.message);
    scoreIA = scoreTecnico; // fallback para regras técnicas
    analiseIA = 'IA indisponível, usando regras técnicas.';
  }

  // Score final: ponderação 40% técnico + 60% IA
  const wowScore = Math.round(scoreTecnico * 0.4 + scoreIA * 0.6);
  const alocacao = CONFIG._alocacaoSugerida !== undefined
    ? Math.round(wowScore * 0.5 + CONFIG._alocacaoSugerida * 0.5)
    : Math.round(wowScore * 0.5);

  return {
    wowScore: Math.min(100, Math.max(0, wowScore)),
    rsi: rsiAtual,
    bbPos,
    variacao24h: btcDados?.variacao24h || 0,
    scoreTecnico,
    scoreIA,
    alocacao: Math.min(50, Math.max(0, alocacao)),
    analise: analiseIA || 'Análise concluída.',
    acao: CONFIG._acaoSugerida || (wowScore > 60 ? 'COMPRAR_PESADO' : wowScore > 40 ? 'COMPRAR_LEVE' : 'ESPERAR'),
    timestamp: new Date().toISOString()
  };
}

// ===================== Smart Contract Integration =====================
async function executarDCA(wowResult, saldoDisponivel) {
  const valorExecucao = Math.round(saldoDisponivel * (wowResult.alocacao / 100) * 100) / 100;

  if (valorExecucao < 5) {
    return { executou: false, motivo: 'Valor mínimo não atingido (min $5).', valorExecucao };
  }

  // Em modo simulação ou sem wallet configurada, não chama o contrato
  const isSimulate = process.argv.includes('--simulate') || !ia.env('WOW_WALLET_KEY', '');
  if (isSimulate) {
    console.log(`[WOW] 🔷 SIMULAÇÃO: Executaria DCA de $${valorExecucao} (${wowResult.alocacao}% do saldo $${saldoDisponivel})`);
    return {
      executou: true,
      simulado: true,
      valorExecucao,
      txHash: '0xSIMULATED',
      gasUsed: '~0.00015 ETH',
      explorerUrl: `${CONFIG.explorer}/tx/0xSIMULATED`
    };
  }

  // --- Modo real: requer ethers.js + wallet ---
  try {
    if (!ethers) return { executou: false, motivo: 'ethers.js nao instalado' };
    const walletKey = ia.env('WOW_WALLET_KEY', '');
    if (!walletKey) {
      return { executou: false, motivo: 'WOW_WALLET_KEY não configurada no .env' };
    }

    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    const wallet = new ethers.Wallet(walletKey, provider);

    // ABI mínimo para executeDCA
    const abi = [
      'function executeDCA(uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) external',
      'function totalUsdc() view returns (uint256)',
      'function usdc() view returns (address)',
      'function poolFee() view returns (uint24)',
      'function lastBtcUsdPrice() view returns (uint256)',
      'function owner() view returns (address)'
    ];
    const contract = new ethers.Contract(CONFIG.contractAddress, abi, wallet);

    // Calcula amountOutMinimum com slippage dinâmico
    const btcPrice = await contract.lastBtcUsdPrice();
    const slippage = wowResult.wowScore > 70 ? 0.005 : wowResult.wowScore > 50 ? 0.01 : 0.02;
    const amountOutMin = ethers.parseUnits(
      (valorExecucao / (Number(ethers.formatUnits(btcPrice, 8)) * (1 + slippage))).toFixed(8), 8
    );

    const tx = await contract.executeDCA(amountOutMin, 0, {
      gasLimit: 500000
    });
    const receipt = await tx.wait();

    return {
      executou: true,
      simulado: false,
      valorExecucao,
      txHash: tx.hash,
      gasUsed: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
      explorerUrl: `${CONFIG.explorer}/tx/${tx.hash}`
    };
  } catch (e) {
    return { executou: false, motivo: `Erro na transação: ${e.message}`, valorExecucao };
  }
}

// ===================== Estado WOW =====================
function carregarEstado() {
  const padrao = {
    saldoUsdc: 0,
    btcAcumulado: 0,
    precoMedio: 0,
    totalInvestido: 0,
    trades: [],
    wowScoreHistory: [],
    ultimaAnalise: null,
    semanaAtual: { inicio: '', depositos: 0, trades: 0, pnl: 0 }
  };
  return { ...padrao, ...(lerJSON(WOW_STATE_PATH) || {}) };
}

function salvarEstado(s) { salvarJSON(WOW_STATE_PATH, s); }

// ===================== Ciclo Principal =====================
async function cicloWOW() {
  const agora = getDataBR();
  console.log(`\n[WOW] 🔄 Ciclo ${agora.data} ${agora.hora}`);
  console.log('[WOW] Coletando dados de mercado...');

  // 1. Buscar dados de mercado
  const btcDados = await buscarBTC();
  if (!btcDados) {
    console.log('[WOW] ❌ Sem dados BTC. Tentando de novo em 1h.');
    return;
  }
  console.log(`[WOW] BTC: $${btcDados.preco} (${btcDados.variacao24h?.toFixed(2)}% 24h)`);

  // Atualiza o PriceFeed mock no contrato com o preço real
  await atualizarPriceFeed(btcDados.preco);

  const candles = await buscarOHLC(30);
  if (!candles || candles.length < 20) {
    console.log('[WOW] ❌ Dados OHLC insuficientes.');
    return;
  }

  // 2. Carregar estado e saldo
  // Auto-incrementar saldo semanal: simula depósitos aleatórios
    // Em modo real, você deposita USDC manualmente. Em simulação, o agente
    // adiciona depósitos semanais automaticamente pra testar a lógica.
    // Auto-incrementar saldo semanal: simula depósitos aleatórios
    const isSim = process.argv.includes('--simulate') || !ia.env('WOW_WALLET_KEY', '');
    const estado = carregarEstado();
    if (isSim && estado.saldoUsdc < 50) {
      estado.saldoUsdc += 300;
      console.log('[WOW] 💰 Recarga automática de $300 (modo simulação)');
      salvarEstado(estado);
    }
    const saldoDisponivel = estado.saldoUsdc;
  console.log(`[WOW] Saldo disponível: $${saldoDisponivel}`);

  // 3. Calcular WOW Score (IA)
  console.log('[WOW] 🧠 Calculando WOW Score...');
  const wowResult = await calcularWOWScore(btcDados, candles);
  console.log(`[WOW] WOW Score: ${wowResult.wowScore}/100 (${wowResult.acao})`);
  console.log(`[WOW] Alocação sugerida: ${wowResult.alocacao}%`);
  console.log(`[WOW] Análise: ${wowResult.analise}`);

  // 4. JEV verifica a decisão
  const jevCheck = await verificarComJEV(btcDados, wowResult);

  // 4. Decidir se executa
  let resultadoExec = { executou: false, motivo: 'WOW Score baixo ou saldo insuficiente.' };
  if (wowResult.wowScore >= 40 && saldoDisponivel >= 5) {
    console.log(`[WOW] 🚀 Executando DCA (Score ${wowResult.wowScore})...`);
    resultadoExec = await executarDCA(wowResult, saldoDisponivel);
    if (resultadoExec.executou) {
      console.log(`[WOW] ✅ DCA executado: $${resultadoExec.valorExecucao}`);
      if (resultadoExec.txHash) console.log(`[WOW] TX: ${resultadoExec.explorerUrl}`);
    } else {
      console.log(`[WOW] ⏸️ Não executou: ${resultadoExec.motivo}`);
    }
  } else {
    console.log(`[WOW] ⏸️ Aguardando. Score ${wowResult.wowScore} < 40 ou saldo $${saldoDisponivel} < $5`);
  }

  // 5. Atualizar estado
  estado.saldoUsdc = saldoDisponivel - (resultadoExec.executou ? resultadoExec.valorExecucao : 0);
  if (resultadoExec.executou) {
    estado.trades.push({
      data: agora.data,
      hora: agora.hora,
      valor: resultadoExec.valorExecucao,
      precoBTC: btcDados.preco,
      wowScore: wowResult.wowScore,
      alocacao: wowResult.alocacao,
      analise: wowResult.analise,
      txHash: resultadoExec.txHash || ''
    });
    estado.semanaAtual.trades++;
    estado.semanaAtual.depositos += resultadoExec.valorExecucao;
  }
  estado.wowScoreHistory.push({ data: agora.data, hora: agora.hora, score: wowResult.wowScore, acao: wowResult.acao });
  if (estado.wowScoreHistory.length > 100) estado.wowScoreHistory = estado.wowScoreHistory.slice(-100);
  estado.ultimaAnalise = new Date().toISOString();
  salvarEstado(estado);

  // 6. Verificar colheita (harvest) — se P&L > 5%, realiza lucro e reinveste
  if (!isSim && estado.totalInvestido > 0) {
    await verificarColheita(estado, wowResult, btcDados.preco);
  }

  // 7. Relatório no console
  console.log('\n' + '='.repeat(50));
  console.log('📊 RELATÓRIO WOW');
  console.log('='.repeat(50));
  console.log(`💰 Saldo disponível: $${estado.saldoUsdc.toFixed(2)}`);
  console.log(`🧠 WOW Score: ${wowResult.wowScore}/100`);
  console.log(`📋 Ação: ${wowResult.acao} (${wowResult.alocacao}%)`);
  if (resultadoExec.executou) console.log(`💵 Executado: $${resultadoExec.valorExecucao}`);
  console.log(`📝 Análise: ${wowResult.analise}`);
  console.log(`📆 Trades no mês: ${estado.trades.length}`);
  console.log('='.repeat(50));

  // 7. Alerta Telegram
  await alertarTelegram(estado, wowResult, resultadoExec, jevCheck);
}

// ===================== Telegram =====================
async function alertarTelegram(estado, wow, exec, jev) {
  const token = ia.env('TELEGRAM_COMMUNITY_TOKEN', '');
  const chatId = ia.env('TELEGRAM_CHAT_ID', '');
  if (!token || !chatId) return;

  const emoji = wow.wowScore > 70 ? '🟢' : wow.wowScore > 40 ? '🟡' : '🔴';
  const acaoEmoji = exec.executou ? '✅' : '⏸️';

  let msg = `${emoji} <b>WOW Agent — ${getDataBR().data} ${getDataBR().hora}</b>\n\n`;
  msg += `💰 BTC: <b>$${Math.round(wow.rsi)}</b> | ${wow.variacao24h.toFixed(2)}% 24h\n`;
  msg += `🧠 <b>WOW Score: ${wow.wowScore}/100</b>\n`;
  msg += `📋 <b>${wow.acao}</b> (alocação: ${wow.alocacao}%)\n`;
  msg += `📝 ${wow.analise}\n\n`;

  if (exec.executou) {
    msg += `${acaoEmoji} DCA executado: <b>$${exec.valorExecucao}</b>\n`;
    if (exec.txHash) msg += `🔗 <a href="${exec.explorerUrl}">Ver transação</a>\n`;
  } else {
    msg += `${acaoEmoji} ${exec.motivo}\n`;
  }

  msg += `\n📊 Trades até hoje: ${estado.trades.length}`;

  if (jev) {
    msg += `\n\n🤖 <b>JEV Verificador:</b>\n`;
    msg += `Comprar: ${(jev.comprar * 100).toFixed(0)}% | Sinal: ${jev.sinal} | Risco: ${jev.risco}\n`;
    msg += jev.concordam ? '✅ WOW + JEV concordam' : '⚠️ WOW e JEV discordam';
  }

  const data = JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true });
  const req = https.request(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  });
  req.write(data); req.end();
}

// ===================== PriceFeed Update =====================
async function atualizarPriceFeed(precoUsd) {
  if (!CONFIG.priceFeed || !ia.env('WOW_WALLET_KEY', '')) return;
  try {
    if (!ethers) return;
    const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    const wallet = new ethers.Wallet(ia.env('WOW_WALLET_KEY', ''), provider);
    const feedAbi = ['function setData(uint80, int256, uint256, uint256, uint80) external'];
    const feed = new ethers.Contract(CONFIG.priceFeed, feedAbi, wallet);
    const price = BigInt(Math.round(precoUsd * 1e8));
    const now = Math.floor(Date.now() / 1000);
    const tx = await feed.setData(1, price, now, now, 1, { gasLimit: 50000 });
    await tx.wait();
    console.log(`[WOW] ✅ PriceFeed atualizado: $${precoUsd}`);
  } catch (e) {
    console.log(`[WOW] ⚠️ PriceFeed erro (ignorado): ${e.message}`);
  }
}

// ===================== JEV Verificador =====================
async function verificarComJEV(btcDados, wowResult) {
  const jevKey = ia.env('JEV_API_KEY', '');
  if (!jevKey) { console.log('[JEV] ⏭️ Sem API Key'); return null; }

  const state = {
    btc_preco_usd: btcDados?.preco || 0,
    btc_variacao_24h_pct: btcDados?.variacao24h || 0,
    rsi_14: Math.round(wowResult.rsi || 50),
    bb_position_pct: Math.round(wowResult.bbPos || 50),
    saldo_usdc: 99.97,
    wow_score: wowResult.wowScore
  };

  const body = JSON.stringify({
    model: 'jev-latest',
    state,
    questions: {
      deve_comprar: { type: 'noul', instructions: 'Devo comprar BTC agora?' },
      sinal: { type: 'choice', instructions: 'Sinal do mercado', criteria: { options: ['PLANTAR', 'CULTIVAR', 'COLHER'] } },
      risco: { type: 'choice', instructions: 'Risco do mercado', criteria: { options: ['BAIXO', 'MEDIO', 'ALTO'] } }
    }
  });

  try {
    const resp = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jevKey },
      body
    });
    if (!resp.ok) { console.log('[JEV] ⚠️ HTTP', resp.status); return null; }
    const j = await resp.json();
    const a = j.answers || {};
    const comprar = a.deve_comprar?.noul ?? -1;
    const sinal = a.sinal?.choice || '?';
    const risco = a.risco?.choice || '?';

    const wowDeveComprar = wowResult.wowScore >= 40 ? 1 : 0;
    const concordam = (comprar >= 0.5 && wowDeveComprar) || (comprar < 0.5 && !wowDeveComprar);

    console.log(`[JEV] Comprar: ${(comprar * 100).toFixed(0)}% | Sinal: ${sinal} | Risco: ${risco} | ${concordam ? '✅ Concordo' : '⚠️ Discordam!'}`);

    if (!concordam) {
      console.log(`[JEV] ⚠️ JEV discordou do WOW Agent! WOW queria ${wowDeveComprar ? 'COMPRAR' : 'ESPERAR'}, JEV sugere ${comprar < 0.5 ? 'ESPERAR' : 'COMPRAR'}`);
    }

    return { comprar, sinal, risco, concordam };
  } catch (e) {
    console.log('[JEV] ⚠️ Erro:', e.message);
    return null;
  }
}

// ===================== Colheita (Harvest) =====================
async function verificarColheita(estado, wowResult, precoAtual) {
  if (estado.totalInvestido <= 0 || !precoAtual) return;

  // Estimar P&L não realizado (baseado no saldo investido vs valor atual)
  // Como o contrato segura o cbBTC, estimamos pelo preço atual do BTC
  const btcTotalEstimado = estado.trades.reduce((a, t) => a + (t.valor / (t.precoBTC || precoAtual)), 0);
  const valorAtual = btcTotalEstimado * precoAtual;
  const pnl = valorAtual - estado.totalInvestido;
  const pnlPercent = estado.totalInvestido > 0 ? (pnl / estado.totalInvestido) * 100 : 0;

  console.log(`[WOW] 📊 P&L estimado: ${pnlPercent.toFixed(2)}% ($${pnl.toFixed(2)})`);

  // Se P&L > 8%, sugere colheita no relatório
  if (pnlPercent > 8) {
    console.log(`[WOW] 🏆 Lucro acima de 8%! Hora de colher e replantar.`);
    estado.ultimaColheitaSugerida = {
      data: new Date().toISOString(),
      pnl: pnlPercent,
      valor: pnl,
      sugerido: true
    };
    salvarEstado(estado);

    // Alerta Telegram sobre colheita
const token = ia.env('TELEGRAM_COMMUNITY_TOKEN', '');
      const chatId = ia.env('TELEGRAM_CHAT_ID', '');
    if (token && chatId) {
      const msg = `🏆 <b>COLHEITA DISPONÍVEL!</b>\n\n📈 Lucro atual: <b>$${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)</b>\n\n💰 É hora de colher as frutinhas 🌾 e replantar as sementes 🌱 para o próximo ciclo!\n\n👉 Quer autorizar a colheita automática? Me confirma no privado.`;
      const d = JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true });
      const req = https.request(`https://api.telegram.org/bot${token}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)} });
      req.write(d); req.end();
    }
  }
}

// ===================== Modo Daemon =====================
if (require.main === module && !process.argv.includes('--help')) {
  const isSimulate = process.argv.includes('--simulate');
  console.log(`[WOW] 🤖 WOW Agent iniciado ${isSimulate ? '(MODO SIMULAÇÃO)' : '(MODO REAL)'}`);
  console.log(`[WOW] Contrato: ${CONFIG.contractAddress}`);
  console.log(`[WOW] Rede: ${CONFIG.network}`);
  console.log('[WOW] Ciclo a cada 6h + fast check a cada 3min');

  // Fast check a cada 3 min (indicadores apenas, sem IA, custo zero)
  setInterval(async () => {
    try {
      const btcDados = await buscarBTC();
      const candles = await buscarOHLC(30);
      if (!btcDados || !candles) return;
      const prices = candles.map(c => c.close);
      const rsis = calcularRSI(prices);
      const rsi = rsis[rsis.length - 1] || 50;
      const variacao = Math.abs(btcDados.variacao24h || 0);
      console.log(`[WOW] 🔍 Fast check: BTC $${btcDados.preco} | RSI ${rsi.toFixed(1)} | ${btcDados.variacao24h?.toFixed(2)}%`);

      // Se condição promissora, dispara ciclo completo
      if ((rsi < 40 && variacao > 2) || rsi < 35) {
        console.log('[WOW] ⚡ Fast check detectou oportunidade! Disparando análise completa...');
        cicloWOW();
      }
    } catch(e) {}
  }, 3 * 60 * 1000);

  // Executa imediatamente
  cicloWOW().catch(e => console.error('[WOW] Erro:', e.message));

  // Repete a cada 6h
  setInterval(() => {
    cicloWOW().catch(e => console.error('[WOW] Erro:', e.message));
  }, 6 * 3600000);
}

module.exports = { cicloWOW, calcularWOWScore, executarDCA };