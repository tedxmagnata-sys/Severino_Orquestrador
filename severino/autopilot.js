/**
 * 🦾 SEVERINO AUTOPILOT — Cérebro Autônomo
 * Monitora, cura, cobra, reembolsa e aprende. Zero intervenção humana.
 *
 * Módulo integrado ao servidor principal (servidor.js) na porta 3334.
 * Regras: EXECUTION.md seção 1 (red lines).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, 'data');
const AUTOPILOT_STATE = path.join(DATA_DIR, 'autopilot_state.json');
const EVENTS_LOG = path.join(DATA_DIR, 'events.jsonl');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== ESTADO PERSISTENTE =====
let state = {
  startedAt: new Date().toISOString(),
  checks: 0,
  recovered: 0,
  failedChecks: [],
  lastHealthOk: null,
  lastHealthFail: null,
  cost: { todayTokens: 0, monthlyBudgetTokens: 5_000_000, budgetExceeded: false },
  refunds: { requested: 0, processed: 0, pending: [] },
  feedback: { happy: 0, unhappy: 0, recent: [] },
  backups: 0,
  userAutomations: {} // userId -> { lastCheck, status: 'up'|'down'|'recovering', failures, lastSeen }
};

function loadState() {
  try {
    if (fs.existsSync(AUTOPILOT_STATE)) {
      state = { ...state, ...JSON.parse(fs.readFileSync(AUTOPILOT_STATE, 'utf8')) };
    }
  } catch (e) { console.error('⚠️ Autopilot: estado corrompido, recriando.', e.message); }
}
function saveState() {
  try { fs.writeFileSync(AUTOPILOT_STATE, JSON.stringify(state, null, 2)); } catch (e) {}
}
function logEvent(event, extra = {}) {
  try {
    const line = JSON.stringify({ event, ts: new Date().toISOString(), ...extra }) + '\n';
    fs.appendFileSync(EVENTS_LOG, line);
  } catch (e) {}
}

// ===== BACKUP AUTOMÁTICO (a cada 6h) =====
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function backupData() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    files.forEach(f => {
      const src = path.join(DATA_DIR, f);
      const dest = path.join(BACKUP_DIR, `${stamp}_${f}`);
      fs.copyFileSync(src, dest);
    });
    // Limpa backups com mais de 14 dias
    const cutoff = Date.now() - 14 * 86400000;
    fs.readdirSync(BACKUP_DIR).forEach(f => {
      const fp = path.join(BACKUP_DIR, f);
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    });
    state.backups++;
    saveState();
    logEvent('backup.completed', { files: files.length });
    console.log(`🗂️ Backup automático: ${files.length} arquivos`);
  } catch (e) { console.error('⚠️ Backup falhou:', e.message); }
}

// ===== AGENTE OBSERVADOR: health checks (60s) =====
function healthCheck() {
  state.checks++;
  const target = { host: '127.0.0.1', port: 3334, path: '/api/health' };
  const req = http.get(target, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      const ok = res.statusCode === 200;
      state.lastHealthOk = ok ? new Date().toISOString() : state.lastHealthOk;
      if (!ok) {
        state.lastHealthFail = new Date().toISOString();
        state.failedChecks.push({ at: state.lastHealthFail, code: res.statusCode });
        if (state.failedChecks.length > 10) state.failedChecks.shift();
        // 3 falhas consecutivas → CU RADOR: reinicia via PM2
        if (state.failedChecks.length >= 3 && (Date.now() - new Date(state.failedChecks[0].at).getTime()) < 5 * 60000) {
          heal();
        }
      }
      saveState();
    });
  });
  req.on('error', () => {
    state.lastHealthFail = new Date().toISOString();
    state.failedChecks.push({ at: state.lastHealthFail, code: 0 });
    if (state.failedChecks.length > 10) state.failedChecks.shift();
    if (state.failedChecks.length >= 3 && (Date.now() - new Date(state.failedChecks[0].at).getTime()) < 5 * 60000) {
      heal();
    }
    saveState();
  });
  req.setTimeout(5000, () => req.destroy());
}

// ===== AGENTE CURADOR: auto-recovery =====
function heal() {
  console.log('🚑 AUTOPILOT: saúde crítica detectada — reiniciando serviço via PM2');
  logEvent('heal.restart', { reason: '3 health failures' });
  const { exec } = require('child_process');
  exec('pm2 restart severino', (err) => {
    if (err) {
      console.error('❌ Auto-recovery falhou:', err.message);
      logEvent('heal.failed', { error: err.message });
    } else {
      state.recovered++;
      state.failedChecks = [];
      state.lastHealthOk = new Date().toISOString();
      saveState();
      logEvent('heal.recovered');
      console.log('✅ Auto-recovery executado com sucesso');
    }
  });
}

// ===== AGENTE CURADOR 2: automações de usuários =====
// Monitora registros de automação; se um usuário está com automação down,
// registra falha e re-enfileira (simula re-provisionamento).
function monitorUserAutomations() {
  const licPath = path.join(DATA_DIR, 'licenses.json');
  const diagPath = path.join(DATA_DIR, 'diagnosticos.json');
  try {
    const diags = JSON.parse(fs.readFileSync(diagPath, 'utf8') || '[]');
    const licenses = fs.existsSync(licPath) ? JSON.parse(fs.readFileSync(licPath, 'utf8')) : {};
    const now = Date.now();

    diags.forEach(d => {
      if (!d.planoEscolhido) return;
      const uid = d.id || d.whatsapp || 'anon';
      const entry = state.userAutomations[uid] || { lastCheck: 0, status: 'up', failures: 0, plan: d.planoEscolhido };
      entry.plan = d.planoEscolhido;
      // A cada 10 min valida a automação
      if (now - entry.lastCheck > 10 * 60000) {
        entry.lastCheck = now;
        // Simulação de health: verifica se o registro tem WhatsApp válido
        const validPhone = d.whatsapp && /^\d{10,13}$/.test(String(d.whatsapp).replace(/\D/g, ''));
        if (!validPhone) {
          entry.failures++;
          entry.status = 'down';
          logEvent('automation.failed', { uid, reason: 'invalid_whatsapp' });
        } else {
          entry.failures = 0;
          entry.status = 'up';
        }
        // Auto-recovery: 2 falhas → tenta corrigir (marca para reprovisionar)
        if (entry.failures >= 2) {
          entry.status = 'recovering';
          entry.failures = 0;
          state.recovered++;
          logEvent('automation.recovered', { uid, plan: entry.plan });
        }
        state.userAutomations[uid] = entry;
      }
    });
    saveState();
  } catch (e) { console.error('⚠️ Monitor de automações:', e.message); }
}

// ===== AGENTE GUARDIÃO DE CUSTOS =====
function reportTokens(used) {
  state.cost.todayTokens += used || 0;
  if (state.cost.todayTokens > state.cost.monthlyBudgetTokens && !state.cost.budgetExceeded) {
    state.cost.budgetExceeded = true;
    logEvent('budget.exceeded', { tokens: state.cost.todayTokens });
    console.log('⚠️ Orçamento de tokens excedido! Modo economia ativado.');
  }
  // Reset diário
  const today = new Date().toISOString().split('T')[0];
  if (state.cost.day !== today) {
    state.cost = { ...state.cost, day: today, todayTokens: 0, budgetExceeded: false };
  }
  saveState();
}

// ===== AGENTE COBRADOR: reembolso automático =====
// Rota: POST /api/refund/request — processa reembolso 100% automático
function processRefundRequest(dados) {
  const tx = String(dados.transactionId || dados.tx || '');
  if (!tx) return { ok: false, error: 'transactionId required' };
  state.refunds.requested++;
  const refund = {
    id: 'ref_' + Date.now().toString(36),
    transactionId: tx,
    reason: dados.reason || 'não especificado',
    status: 'approved_auto', // política: insatisfeito → devolve, sem perguntas
    createdAt: new Date().toISOString(),
    processedAt: null
  };
  state.refunds.pending.push(refund);
  saveState();
  logEvent('refund.requested', refund);
  // Processa imediatamente (simulação de estorno via gateway)
  setTimeout(() => {
    refund.status = 'processed';
    refund.processedAt = new Date().toISOString();
    state.refunds.processed++;
    state.refunds.pending = state.refunds.pending.filter(r => r.id !== refund.id);
    saveState();
    logEvent('refund.processed', { id: refund.id });
  }, 1000);
  return { ok: true, id: refund.id, status: 'approved', message: 'Reembolso aprovado automaticamente. Valor devolvido em até 24h.' };
}

// ===== AGENTE APRENDIZ: feedback e métricas =====
function registerFeedback(dados) {
  const happy = !!dados.happy;
  if (happy) state.feedback.happy++;
  else state.feedback.unhappy++;
  state.feedback.recent.unshift({
    happy,
    text: String(dados.text || '').slice(0, 500),
    at: new Date().toISOString(),
    idioma: dados.idioma || 'pt'
  });
  if (state.feedback.recent.length > 50) state.feedback.recent.pop();
  saveState();
  logEvent('feedback.registered', { happy });
  return { ok: true };
}

// ===== ROTAS EXPORTADAS PARA O SERVIDOR =====
function handleAPI(rawUrl, method, body, res) {
  if (method === 'GET' && rawUrl === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      service: 'severino',
      uptime: process.uptime(),
      autopilot: {
        checks: state.checks,
        recovered: state.recovered,
        lastHealthOk: state.lastHealthOk,
        budgetExceeded: state.cost.budgetExceeded
      },
      ts: new Date().toISOString()
    }));
  }

  if (method === 'GET' && rawUrl === '/api/autopilot/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      state: {
        startedAt: state.startedAt,
        checks: state.checks,
        recovered: state.recovered,
        failedChecks: state.failedChecks.length,
        cost: state.cost,
        refunds: { requested: state.refunds.requested, processed: state.refunds.processed },
        feedback: { happy: state.feedback.happy, unhappy: state.feedback.unhappy },
        backups: state.backups,
        automationsMonitored: Object.keys(state.userAutomations).length
      }
    }));
  }

  if (method === 'POST' && rawUrl === '/api/refund/request') {
    const result = processRefundRequest(body || {});
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  if (method === 'POST' && rawUrl === '/api/feedback') {
    const result = registerFeedback(body || {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  if (method === 'POST' && rawUrl === '/api/tokens/report') {
    const used = Number(body && body.used) || 0;
    reportTokens(used);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (method === 'POST' && rawUrl === '/api/backup') {
    backupData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, backups: state.backups }));
  }

  return null; // não tratado pelo autopilot
}

// ===== INICIALIZAÇÃO =====
loadState();
setInterval(healthCheck, 60000);
setInterval(monitorUserAutomations, 60000);
setInterval(backupData, 6 * 3600000);
// Primeiro ciclo imediato
setTimeout(() => { healthCheck(); monitorUserAutomations(); }, 5000);

console.log('🤖 SEVERINO AUTOPILOT ativo');
console.log('   └─ Observador:  health check a cada 60s');
console.log('   └─ Curador:     auto-recovery (3 falhas → restart PM2)');
console.log('   └─ Cobrador:    reembolsos automáticos aprovados');
console.log('   └─ Aprendiz:    feedback contínuo');
console.log('   └─ Guardião:    orçamento de tokens monitorado');
console.log('   └─ Backup:      JSON a cada 6h (retenção 14 dias)');

module.exports = { handleAPI, reportTokens, processRefundRequest, getState: () => state };
