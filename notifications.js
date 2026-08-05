/**
 * 🤖 Sistema de Notificações VIP — BTC Weather Panel
 * 
 * Gerencia preferências de notificação por usuário:
 * - Daily analysis (9h) 
 * - Climate change alerts
 * 
 * Comandos Telegram:
 *   /vincular CODIGO — Vincula seu Telegram à licença VIP
 *   /notificacoes    — Mostra suas configurações
 *   /diaria on|off   — Ativa/desativa análise diária
 *   /clima on|off    — Ativa/desativa alertas de mudança de clima
 *   /email EMAIL     — Cadastra e-mail para notificações
 *   /status          — Status da sua assinatura VIP
 */

const fs = require('fs');
const path = require('path');

const NOTIF_PATH = path.join(__dirname, '..', 'data', 'notifications.json');

function load() {
  try { return JSON.parse(fs.readFileSync(NOTIF_PATH, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  try { fs.writeFileSync(NOTIF_PATH, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('Erro ao salvar notifications.json:', e.message); }
}

// Get or create user entry
function getUser(chatId) {
  const data = load();
  if (!data[chatId]) {
    data[chatId] = {
      licenseCode: '',
      telegramId: chatId,
      nome: '',
      email: '',
      createdAt: new Date().toISOString(),
      prefs: { dailyAnalysis: true, climateChange: true, operationalSignal: true },
      lastClimate: {},
      lastDailySent: ''
    };
    save(data);
  }
  return data[chatId];
}

function updateUser(chatId, updates) {
  const data = load();
  data[chatId] = { ...getUser(chatId), ...updates };
  save(data);
}

function getAllUsers() {
  return Object.values(load());
}

function getOptedInUsers(pref) {
  return getAllUsers().filter(u => u.prefs && u.prefs[pref] === true && u.licenseCode);
}

module.exports = { load, save, getUser, updateUser, getAllUsers, getOptedInUsers, NOTIF_PATH };
