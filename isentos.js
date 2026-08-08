/**
 * 🛡️ Isentos — usuários que NUNCA recebem cobrança/upsell/renovação.
 * Usado pelo Retentor e Cobrador para pular follow-ups comerciais.
 * Arthur: testador real de usabilidade, sem planos de cobrança (decisão 07/ago).
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'isentos.json');

function isentoPorTelegramId(telegramId) {
  if (!telegramId) return false;
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const id = String(telegramId);
    return (d.telegramIds || []).some(t => String(t) === id);
  } catch {
    return false;
  }
}

module.exports = { isentoPorTelegramId, FILE };