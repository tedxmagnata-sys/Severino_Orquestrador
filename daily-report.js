/**
 * 🌅 daily-report.js — Relatório Diário do DCA Inteligente
 * Envia resumo por Telegram todo dia às 20h (configurável)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { env } = require('./ia');

const WOW_STATE = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'wow-state.json'), 'utf8') || '{}');
const token = env('TELEGRAM_COMMUNITY_TOKEN', '');
const chatId = env('TELEGRAM_CHAT_ID', '');
if (!token || !chatId) { console.log('Sem Telegram'); process.exit(0); }

const trades = WOW_STATE.trades || [];
const totalInvestido = trades.reduce((a, t) => a + (t.valor || 0), 0);
const totalTrades = trades.length;
const avgScore = trades.length > 0 ? Math.round(trades.reduce((a, t) => a + (t.wowScore || 0), 0) / trades.length) : 0;
const saldo = WOW_STATE.saldoUsdc || 0;
const scores = WOW_STATE.wowScoreHistory || [];
const hoje = new Date().toISOString().slice(0, 10);
const ultimoScore = scores.length > 0 ? scores[scores.length - 1] : null;

const msg = `🌅 <b>RELATÓRIO DIÁRIO — DCA INTELIGENTE</b>
━━━━━━━━━━━━━━━━━━━━━━━
📅 <b>${hoje}</b>

💰 <b>Saldo disponível:</b> $${saldo.toFixed(2)}
📊 <b>Total investido:</b> $${totalInvestido.toFixed(2)}
📈 <b>Trades executados:</b> ${totalTrades}
🧠 <b>WOW Score médio:</b> ${avgScore}/100

📋 <b>Última análise:</b>
${ultimoScore ? 'WOW: ' + ultimoScore.score + '/100 | Ação: ' + ultimoScore.acao : 'Aguardando primeiro ciclo...'}

━━━━━━━━━━━━━━━━━━━━━━━
🌱 <b>Eclesiastes 11:1</b>
"Lança o teu pão sobre as águas, porque depois de muitos dias o acharás."

💡 <b>Próximo ciclo:</b> Aguardando 🌱 Plantar para semear
<b>Saldo pronto pra plantar:</b> $${saldo.toFixed(2)} em USDC na Base 🔥

#SeverinoTrader #DCA #Bitcoin`;

const data = JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true });
const req = https.request('https://api.telegram.org/bot' + token + '/sendMessage', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
});
req.write(data); req.end();
console.log('✅ Relatório diário enviado');