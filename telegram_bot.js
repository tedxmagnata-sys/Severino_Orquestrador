const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const notif = require('./notifications');

const PENDING_REPLIES_PATH = path.join(__dirname, 'data', 'pending_replies.json');

function loadPendingReplies() {
  try { return JSON.parse(fs.readFileSync(PENDING_REPLIES_PATH, 'utf8')); } catch { return []; }
}
function savePendingReplies(arr) {
  try { fs.mkdirSync(path.dirname(PENDING_REPLIES_PATH), { recursive: true }); } catch {}
  fs.writeFileSync(PENDING_REPLIES_PATH, JSON.stringify(arr, null, 2));
}

function postarLeadNovo(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ tipo: 'lead.novo', origem: 'telegram', produto: process.env.ECOSYSTEM_PRODUTO_PADRAO || 'btcweather', payload });
    const opts = { hostname: '127.0.0.1', port: parseInt(process.env.ECOSISTEMA_PORT || '3335', 10), path: '/api/ecosystem/enviar', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': process.env.SECRET_KEY || '', 'Content-Length': Buffer.byteLength(data) } };
    const req = http.request(opts, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

function getLeadsPath() { return path.join(__dirname, '..', 'ecosystem', 'leads.json'); }
function getCodesPath() { return path.join(__dirname, '..', 'ecosystem', 'pending_codes.json'); }
const LICENSES_PATH = path.join(__dirname, '..', 'data', 'licenses.json');
const PURCHASES_PATH = path.join(__dirname, '..', 'data', 'purchases.json');

function loadJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } }
function saveJSON(p, d) { try { fs.writeFileSync(p, JSON.stringify(d, null, 2)); } catch {} }
function loadLeads() { return loadJSON(getLeadsPath()); }
function saveLeads(leads) { saveJSON(getLeadsPath(), leads); }

function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message?.chat?.id;
  const callbackId = callbackQuery.id;
  if (!chatId) return;

  if (data.startsWith('x_approve:') || data.startsWith('x_skip:')) {
    const pendingId = data.split(':')[1];
    const pending = loadPendingReplies();
    const idx = pending.findIndex(p => p.id === pendingId);
    if (idx < 0) { sendTelegram(chatId, 'Reply nao encontrado ou ja processado.', callbackQuery.from?.id); answerCallbackQuery(callbackId, 'Nao encontrado'); return; }
    const item = pending[idx];
    if (data.startsWith('x_skip:')) {
      pending.splice(idx, 1); savePendingReplies(pending);
      sendTelegram(chatId, 'Reply descartado: @' + item.username, callbackQuery.from?.id);
      answerCallbackQuery(callbackId, 'Descartado');
      return;
    }
    answerCallbackQuery(callbackId, 'Postando reply...');
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({ appKey: process.env.X_API_KEY, appSecret: process.env.X_API_SECRET, accessToken: process.env.X_ACCESS_TOKEN, accessSecret: process.env.X_ACCESS_SECRET });
    client.v2.reply(item.replyText, item.tweetId)
      .then(() => { pending.splice(idx, 1); savePendingReplies(pending); sendTelegram(chatId, 'Reply postado em @' + item.username + '!\n\n' + item.replyText.slice(0, 150), callbackQuery.from?.id); })
      .catch((e) => { const err = e.data?.detail || e.message || 'erro'; sendTelegram(chatId, 'Falha ao postar: ' + err.slice(0, 200) + '\n\nReply disponivel para copiar manualmente.', callbackQuery.from?.id); });
    return;
  }
}

function handleWebhook(req, res) {
  const token = process.env.TELEGRAM_TOKEN || '';
  if (!token) { res.writeHead(500); return res.end('TELEGRAM_TOKEN not configured'); }
  let body = '';
  req.on("data", c => body += c);
  req.on("end", () => {
    try {
      const update = JSON.parse(body);
      if (update.callback_query) { handleCallbackQuery(update.callback_query); res.writeHead(200); return res.end("ok"); }
      const msg = update.message || update.channel_post || {};
      const chat = msg.chat || {};
      const from = msg.from || {};
      const chatId = chat.id;
      const text = msg.text || "";
      if (!chatId) { res.writeHead(200); return res.end("ok"); }

      if (from.id && text) {
        const leads = loadLeads();
        const exists = leads.some(l => l.telegram_id == from.id);
        if (!exists) {
          leads.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome: from.first_name + (from.last_name ? " " + from.last_name : ""), telegram_id: from.id, telegram_username: from.username || "", fonte: "telegram", status: "novo", score: 1, createdAt: new Date().toISOString() });
          saveLeads(leads);
          try { postarLeadNovo({ leadId: 'tg-' + from.id, nome: from.first_name + (from.last_name ? " " + from.last_name : ""), telegramId: from.id, contexto: 'Novo contato no Telegram' + (text ? ': ' + String(text).slice(0, 120) : '') }); } catch {}
        } else {
          const idx = leads.findIndex(l => l.telegram_id == from.id);
          if (idx >= 0) { leads[idx].telegram_username = from.username || leads[idx].telegram_username; leads[idx].nome = from.first_name + (from.last_name ? " " + from.last_name : ""); if (leads[idx].status === "novo") leads[idx].score = Math.min((leads[idx].score || 0) + 1, 5); saveLeads(leads); }
        }
      }

      let responseText = "";
      if (text === "/start" || text === "/iniciar") { responseText = onboardingTexto(from); }
      else if (text.startsWith("/start ")) { const codigo = text.replace("/start ", "").trim().toUpperCase(); const lic = loadJSON(LICENSES_PATH); if (lic[codigo]) { notif.updateUser(chatId, { licenseCode: codigo, telegramId: from.id, nome: from.first_name + (from.last_name ? " " + from.last_name : "") }); responseText = "Conta Vinculada! Codigo " + codigo + " conectado."; } else { responseText = "Codigo " + codigo + " nao encontrado."; } }
      else if (text === "/ajuda" || text === "/help") { responseText = "Comandos: /codigo /resgatar /vincular /status /notificacoes /diaria on|off /clima on|off"; }
      else if (text === "/meucodigo") { const codes = loadJSON(getCodesPath()); const leadCodes = codes.filter(c => c.telegram_id == from.id); if (leadCodes.length > 0) { const last = leadCodes[leadCodes.length - 1]; responseText = "Seu codigo: " + last.codigo; } else { responseText = "Nenhum codigo encontrado. Use /codigo"; } }
      else if (text === "/notificacoes") { const user = notif.getUser(chatId); responseText = "Diaria: " + (user.prefs.dailyAnalysis ? "on" : "off") + " | Clima: " + (user.prefs.climateChange ? "on" : "off"); }
      else if (text === "/diaria on") { notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, dailyAnalysis: true } }); responseText = "Analise diaria ativada!"; }
      else if (text === "/diaria off") { notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, dailyAnalysis: false } }); responseText = "Analise diaria desativada."; }
      else if (text === "/clima on") { notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, climateChange: true } }); responseText = "Alertas de clima ativados!"; }
      else if (text === "/clima off") { notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, climateChange: false } }); responseText = "Alertas de clima desativados."; }
      else if (text === "/sinais on") { notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, operationalSignal: true } }); responseText = "Sinais operacionais ativados!"; }
      else if (text === "/sinais off") { notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, operationalSignal: false } }); responseText = "Sinais operacionais desativados."; }
      else if (text.startsWith("/email ")) { const email = text.replace("/email ", "").trim(); if (email.includes("@")) { notif.updateUser(chatId, { email }); responseText = "E-mail cadastrado: " + email; } else { responseText = "E-mail invalido."; } }
      else if (text === "/status") { const user = notif.getUser(chatId); if (!user.licenseCode) { responseText = "Nenhuma licenca vinculada. Use /codigo ou /vincular"; } else { responseText = "Licenca: " + user.licenseCode; } }

      if (responseText) sendTelegram(chatId, responseText, token);
      res.writeHead(200);
      res.end("ok");
    } catch (e) { console.error("Telegram webhook error:", e.message); res.writeHead(200); res.end("ok"); }
  });
}

function sendTelegram(chatId, text, token) {
  if (!token || !chatId) return;
  token = token || process.env.TELEGRAM_TOKEN || "";
  const payload = JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" });
  const opts = { hostname: "api.telegram.org", port: 443, path: "/bot" + token + "/sendMessage", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } };
  const req = https.request(opts); req.on("error", () => {}); req.write(payload); req.end();
}

function answerCallbackQuery(callbackQueryId, text) {
  const token = process.env.TELEGRAM_TOKEN || '';
  if (!token || !callbackQueryId) return;
  const payload = JSON.stringify({ callback_query_id: callbackQueryId, text: text || '', show_alert: false });
  const opts = { hostname: "api.telegram.org", port: 443, path: "/bot" + token + "/answerCallbackQuery", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } };
  const req = https.request(opts); req.on("error", () => {}); req.write(payload); req.end();
}

function onboardingTexto(from) {
  const nome = (from.first_name || '').split(' ')[0];
  return "Oi " + (nome || '') + "! Bem-vindo ao BTC Weather Panel.\n\nUse /codigo para gerar VIP gratis.\nUse /ajuda para ver comandos.";
}

module.exports = { handleWebhook, sendTelegram, loadPendingReplies, savePendingReplies };
