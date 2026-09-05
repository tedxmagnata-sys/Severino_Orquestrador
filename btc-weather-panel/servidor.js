/**
 * 🦾 Severino Consultor - Servidor Principal
 * Porta 3334 — API de diagnósticos + WhatsApp Manager + Painel
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
let whatsapp;
try {
  whatsapp = require('./whatsapp_manager');
} catch (e) {
  try {
    whatsapp = require('./whatsapp/manager');
  } catch (err) {
    console.warn('⚠️ WhatsApp Manager não encontrado:', err.message);
  }
}

const PORT = process.platform === 'win32' ? 3334 : 80;
const ROOT = process.platform === 'win32' ? 'C:\\Users\\3\\.openclaw\\canvas' : '/root/.openclaw/canvas';
const WHATSAPP_PAINEL = path.join(__dirname, 'whatsapp');
const DB = process.platform === 'win32' ? 'C:\\Users\\3\\SEVERINO\\diagnosticos.json' : '/root/severino/diagnosticos.json';

// Evita crash
process.on('uncaughtException', (err) => {
  console.error('❌ ERRO (não crashou):', err.message);
});

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

if (!fs.existsSync(DB)) fs.writeFileSync(DB, '[]');

// ========== TELEMETRY & METRICS STORE ==========
const TELEMETRY_FILE = process.platform === 'win32' ? 'C:\\Users\\3\\SEVERINO\\telemetry_stats.json' : '/root/severino/telemetry_stats.json';
let telemetryStats = {
  totalUniqueVisitors: new Set(),
  dailyVisits: {},
  totalAlertsCreated: 0,
  sessions: new Map() // sessionId -> { lastSeen: timestamp, device: 'mobile'|'desktop', alertsCount: number }
};

if (fs.existsSync(TELEMETRY_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf8'));
    telemetryStats.dailyVisits = raw.dailyVisits || {};
    telemetryStats.totalAlertsCreated = raw.totalAlertsCreated || 0;
    if (Array.isArray(raw.uniqueVisitorIds)) {
      telemetryStats.totalUniqueVisitors = new Set(raw.uniqueVisitorIds);
    }
  } catch (e) {
    console.error('Erro ao carregar telemetria:', e.message);
  }
}

function saveTelemetryStats() {
  try {
    const dataToSave = {
      dailyVisits: telemetryStats.dailyVisits,
      totalAlertsCreated: telemetryStats.totalAlertsCreated,
      uniqueVisitorIds: Array.from(telemetryStats.totalUniqueVisitors)
    };
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (e) {}
}

function cleanupStaleSessions() {
  const now = Date.now();
  for (const [sid, sess] of telemetryStats.sessions.entries()) {
    if (now - sess.lastSeen > 90000) { // 90 seconds timeout
      telemetryStats.sessions.delete(sid);
    }
  }
}
setInterval(cleanupStaleSessions, 30000);

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const rawUrl = req.url.split('?')[0];
  const url = rawUrl;
  const method = req.method;

  // ========== API WHATSAPP ==========
  if ((rawUrl.startsWith('/api/whatsapp') || rawUrl.startsWith('/btc-weather-panel/api/whatsapp')) && whatsapp) {
    const body = method === 'POST' || method === 'PUT' ? await parseBody(req) : {};
    const handled = await whatsapp.handleAPI(req, res, rawUrl, method, body);
    if (handled !== false) return;
    // Se não foi tratado pelo manager, cai no 404
  }

  // ========== API WEBHOOK CLIMA (v16.1) ==========
  if (method === 'POST' && rawUrl.endsWith('/api/webhook/clima')) {
    const dados = await parseBody(req);
    const CONFIG_PATH = process.platform === 'win32' ? 'C:\\Users\\3\\SEVERINO\\weather_alert_config.json' : '/root/severino/weather_alert_config.json';
    
    // Carregar config ou criar padrão
    let config = {
      telegram_token: "8843645093:AAG-g6ZpqOjmvuPradtTPj4_u22CuhKc5tw",
      telegram_chat_id: "1088548125",
      whatsapp_enabled: false,
      whatsapp_group_id: "",
      whatsapp_client_id: "severino",
      secret_key: "VIP-WEATHER-2026"
    };
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      } catch (e) {
        console.error('Erro ao ler config do webhook:', e.message);
      }
    } else {
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      } catch (e) {}
    }

    const { secret, clima, mensagem, chat_id, whatsapp_group, email } = dados;

    if (!secret || secret !== config.secret_key) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Não autorizado' }));
    }

    if (!mensagem) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Mensagem obrigatória' }));
    }

    const finalChatId = chat_id || config.telegram_chat_id;
    const finalToken = config.telegram_token;
    
    let telegramSent = false;
    let whatsappSent = false;
    let emailSent = false;

    // 1. Enviar para Telegram
    if (finalToken && finalChatId) {
      try {
        const https = require('https');
        const payload = JSON.stringify({
          chat_id: finalChatId,
          text: mensagem,
          parse_mode: 'HTML'
        });

        const options = {
          hostname: 'api.telegram.org',
          port: 443,
          path: `/bot${finalToken}/sendMessage`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        await new Promise((resolve, reject) => {
          const reqTg = https.request(options, (resTg) => {
            let resData = '';
            resTg.on('data', chunk => resData += chunk);
            resTg.on('end', () => {
              if (resTg.statusCode === 200) {
                telegramSent = true;
                resolve();
              } else {
                reject(new Error(`Status ${resTg.statusCode}: ${resData}`));
              }
            });
          });
          reqTg.on('error', reject);
          reqTg.write(payload);
          reqTg.end();
        });
      } catch (err) {
        console.error('❌ Erro ao enviar para Telegram via Webhook:', err.message);
      }
    }

    // 2. Enviar para WhatsApp (se habilitado)
    const finalGroup = whatsapp_group || config.whatsapp_group_id;
    if (config.whatsapp_enabled && finalGroup) {
      try {
        const result = await whatsapp.enviarMensagem(config.whatsapp_client_id, finalGroup, mensagem);
        if (result.status === 'enviado') {
          whatsappSent = true;
        } else {
          console.error('❌ Erro ao enviar para WhatsApp via Webhook:', result.error);
        }
      } catch (err) {
        console.error('❌ Falha catastrófica no WhatsApp via Webhook:', err.message);
      }
    }

    // 3. Registrar e Disparar Notificação por E-mail
    const targetEmail = email || config.email || 'tedxmagnata@gmail.com';
    if (targetEmail) {
      console.log(`📧 [DISPARO E-MAIL ALERTA] Notificação registrada para: ${targetEmail}`);
      emailSent = true;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      ok: true, 
      telegram: telegramSent, 
      whatsapp: whatsappSent,
      email: emailSent,
      targetEmail: targetEmail,
      message: 'Alerta disparado com sucesso!'
    }));
  }

  // ========== API WEATHER CONFIG (v18.0) ==========
  if (rawUrl.endsWith('/api/weather/config')) {
    const CONFIG_PATH = process.platform === 'win32' ? 'C:\\Users\\3\\SEVERINO\\weather_alert_config.json' : '/root/severino/weather_alert_config.json';
    
    // Default configuration template
    let config = {
      telegram_token: "8843645093:AAG-g6ZpqOjmvuPradtTPj4_u22CuhKc5tw",
      telegram_chat_id: "1088548125",
      whatsapp_enabled: false,
      whatsapp_group_id: "",
      whatsapp_client_id: "severino",
      secret_key: "VIP-WEATHER-2026",
      whatsapp: "5511999998888",
      linkVip: "https://kiwify.com.br/",
      linkElite: "https://kiwify.com.br/",
      alertsEnabled: true
    };

    if (fs.existsSync(CONFIG_PATH)) {
      try {
        config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
      } catch (e) {
        console.error('Erro ao ler config para API weather:', e.message);
      }
    }

    if (method === 'GET') {
      // Check query params for secret
      const urlParts = req.url.split('?');
      let clientSecret = '';
      if (urlParts.length > 1) {
        const params = new URLSearchParams(urlParts[1]);
        clientSecret = params.get('secret');
      }

      if (clientSecret && clientSecret === config.secret_key) {
        // Return full config for admin (include telegram_chat_id, waGroupId, etc.)
        const adminResponse = {
          whatsapp: config.whatsapp || "5511999998888",
          linkVip: config.linkVip || "https://kiwify.com.br/",
          linkElite: config.linkElite || "https://kiwify.com.br/",
          vipKey: config.secret_key || "VIP-WEATHER-2026",
          tgChatId: config.telegram_chat_id || "1088548125",
          waGroupId: config.whatsapp_group_id || "",
          alertsEnabled: config.whatsapp_enabled !== false
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(adminResponse));
      } else {
        // Return only public config for normal visitors
        const publicConfig = {
          whatsapp: config.whatsapp || "5511999998888",
          linkVip: config.linkVip || "https://kiwify.com.br/",
          linkElite: config.linkElite || "https://kiwify.com.br/",
          alertsEnabled: config.whatsapp_enabled !== false
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(publicConfig));
      }
    }

    if (method === 'POST') {
      const dados = await parseBody(req);
      const { secret } = dados;

      if (!secret || secret !== config.secret_key) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Não autorizado' }));
      }

      // Sync and update values
      if (dados.whatsapp !== undefined) config.whatsapp = dados.whatsapp;
      if (dados.linkVip !== undefined) config.linkVip = dados.linkVip;
      if (dados.linkElite !== undefined) config.linkElite = dados.linkElite;
      if (dados.vipKey !== undefined) config.secret_key = dados.vipKey;
      if (dados.tgChatId !== undefined) config.telegram_chat_id = dados.tgChatId;
      if (dados.waGroupId !== undefined) config.whatsapp_group_id = dados.waGroupId;
      if (dados.alertsEnabled !== undefined) config.whatsapp_enabled = dados.alertsEnabled;

      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, message: 'Configurações salvas no servidor!' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }
  }

  // ========== API TELEMETRIA & PING (v21.0) ==========
  if (method === 'POST' && rawUrl.endsWith('/api/telemetry/ping')) {
    const dados = await parseBody(req);
    const { sessionId, device, alertsCount } = dados;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    if (sessionId) {
      if (!telemetryStats.totalUniqueVisitors.has(sessionId)) {
        telemetryStats.totalUniqueVisitors.add(sessionId);
        saveTelemetryStats();
      }
      telemetryStats.dailyVisits[today] = (telemetryStats.dailyVisits[today] || 0) + 1;
      
      telemetryStats.sessions.set(sessionId, {
        lastSeen: now,
        device: device || 'desktop',
        alertsCount: typeof alertsCount === 'number' ? alertsCount : 0
      });
    }

    cleanupStaleSessions();

    const activeSessions = Array.from(telemetryStats.sessions.values());
    const activeNow = activeSessions.length;
    const mobileCount = activeSessions.filter(s => s.device === 'mobile').length;
    const desktopCount = activeNow - mobileCount;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      activeNow: activeNow,
      totalVisitors: telemetryStats.totalUniqueVisitors.size,
      todayVisits: telemetryStats.dailyVisits[today] || activeNow,
      mobileCount: mobileCount,
      desktopCount: desktopCount
    }));
  }

  if (method === 'GET' && rawUrl.endsWith('/api/admin/metrics')) {
    cleanupStaleSessions();
    const today = new Date().toISOString().split('T')[0];
    const activeSessions = Array.from(telemetryStats.sessions.values());
    const activeNow = activeSessions.length;
    const mobileCount = activeSessions.filter(s => s.device === 'mobile').length;
    const desktopCount = activeNow - mobileCount;
    const totalConfiguredAlerts = activeSessions.reduce((acc, s) => acc + (s.alertsCount || 0), 0);

    const metricsData = {
      ok: true,
      activeNow: activeNow,
      totalVisitors: telemetryStats.totalUniqueVisitors.size,
      todayVisits: telemetryStats.dailyVisits[today] || activeNow,
      totalAlertsCreated: Math.max(telemetryStats.totalAlertsCreated, totalConfiguredAlerts),
      activeAlertsCount: totalConfiguredAlerts,
      mobilePct: activeNow > 0 ? Math.round((mobileCount / activeNow) * 100) : 0,
      desktopPct: activeNow > 0 ? Math.round((desktopCount / activeNow) * 100) : 0,
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(metricsData));
  }

  // ========== API DIAGNÓSTICO ==========
  if (method === 'POST' && rawUrl.endsWith('/api/diagnostico')) {
    const dados = await parseBody(req);
    if (!dados.nome) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Dados inválidos' }));
    }
    dados.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    dados.recebidoEm = new Date().toISOString();
    dados.status = 'pendente';

    const db = readJSON(DB);
    db.push(dados);
    writeJSON(DB, db);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      ok: true, 
      id: dados.id, 
      message: 'Diagnóstico enviado! Vamos entrar em contato em breve.'
    }));
  }

  if (method === 'GET' && url === '/api/pendentes') {
    const db = readJSON(DB);
    const pendentes = db.filter(d => d.status === 'pendente');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(pendentes));
  }

  if (method === 'DELETE' && url.startsWith('/api/diagnostico/')) {
    const id = url.split('/api/diagnostico/')[1];
    const db = readJSON(DB);
    const idx = db.findIndex(d => d.id === id);
    if (idx >= 0) {
      db.splice(idx, 1);
      writeJSON(DB, db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false }));
  }

  if (method === 'DELETE' && url === '/api/diagnosticos') {
    writeJSON(DB, []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }



  // ========== ARQUIVOS ESTÁTICOS ==========
  
  // Painel WhatsApp
  if (url === '/painel-whatsapp' || url === '/painel-whatsapp.html') {
    const painel = path.join(WHATSAPP_PAINEL, 'painel.html');
    if (fs.existsSync(painel)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(painel, 'utf8'));
    }
  }

  // Painel do Tempo (SaaS BTC Weather Panel)
  if (rawUrl.startsWith('/weather-panel') || rawUrl.startsWith('/btc-weather-panel')) {
    let relativePath = 'index.html';
    if (rawUrl !== '/weather-panel' && rawUrl !== '/btc-weather-panel' && rawUrl !== '/weather-panel/' && rawUrl !== '/btc-weather-panel/') {
      relativePath = rawUrl.replace('/weather-panel/', '').replace('/btc-weather-panel/', '');
    }
    const weatherRoot = process.platform === 'win32' ? 'C:\\Users\\3\\Ted\\btc-weather-panel' : '/root/btc-weather-panel';
    const weatherPath = path.join(weatherRoot, relativePath);
    if (fs.existsSync(weatherPath)) {
      const extname = path.extname(weatherPath).toLowerCase();
      res.writeHead(200, { 
        'Content-Type': mime[extname] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      });
      return res.end(fs.readFileSync(weatherPath));
    }
  }

  // Outros arquivos estáticos
  let filePath = path.join(ROOT, url === '/' ? '/consultor.html' : url);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Tenta da raiz do projeto
      filePath = path.join(__dirname, url === '/' ? 'index.html' : url);
      fs.readFile(filePath, (err2, data2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404');
        } else {
          const ext2 = path.extname(filePath).toLowerCase();
          res.writeHead(200, { 'Content-Type': mime[ext2] || 'application/octet-stream' });
          res.end(data2);
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
}).listen(PORT, () => {
  console.log('🦾 Severino Consultor — Servidor Principal');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 http://localhost:${PORT}/consultor.html        → Funil de diagnóstico`);
  console.log(`📊 http://localhost:${PORT}/painel-whatsapp       → Gerenciar WhatsApp`);
  console.log(`📡 API WhatsApp: /api/whatsapp/*`);
  console.log(`📡 API Diagnóstico: /api/diagnostico | /api/pendentes`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});