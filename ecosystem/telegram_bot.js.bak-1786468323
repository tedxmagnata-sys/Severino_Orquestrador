const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const notif = require('./notifications');

// Comunicação com o orquestrador do ecossistema por HTTP (porta 3335),
// para o btcweather não depender de código do ecossistema.
function postarLeadNovo(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      tipo: 'lead.novo',
      origem: 'telegram',
      produto: process.env.ECOSYSTEM_PRODUTO_PADRAO || 'btcweather',
      payload
    });
    const opts = {
      hostname: '127.0.0.1',
      port: parseInt(process.env.ECOSISTEMA_PORT || '3335', 10),
      path: '/api/ecosystem/enviar',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': process.env.SECRET_KEY || '',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(opts, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
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

function handleWebhook(req, res) {
  const token = process.env.TELEGRAM_TOKEN || '';
  if (!token) { res.writeHead(500); return res.end('TELEGRAM_TOKEN not configured'); }
  let body = '';
  req.on("data", c => body += c);
  req.on("end", () => {
    try {
      const update = JSON.parse(body);
      const msg = update.message || update.channel_post || {};
      const chat = msg.chat || {};
      const from = msg.from || {};
      const chatId = chat.id;
      const text = msg.text || "";

      if (!chatId) { res.writeHead(200); return res.end("ok"); }

      // Register as lead
      if (from.id && text) {
        const leads = loadLeads();
        const exists = leads.some(l => l.telegram_id == from.id);
        if (!exists) {
          leads.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            nome: from.first_name + (from.last_name ? " " + from.last_name : ""),
            telegram_id: from.id,
            telegram_username: from.username || "",
            fonte: "telegram",
            status: "novo",
            score: 1,
            createdAt: new Date().toISOString()
          });
          saveLeads(leads);
          try {
            postarLeadNovo({
              leadId: 'tg-' + from.id,
              nome: from.first_name + (from.last_name ? " " + from.last_name : ""),
              telegramId: from.id,
              contexto: 'Novo contato no Telegram' + (text ? ': ' + String(text).slice(0, 120) : '')
            }).then((ok) => {
              if (!ok) console.log('[TelegramBot] lead.novo não enviado ao ecossistema (orquestrador offline?)');
            });
          } catch (e) {
            console.log('[TelegramBot] falha ao postar lead.novo:', e.message);
          }
        } else {
          const idx = leads.findIndex(l => l.telegram_id == from.id);
          if (idx >= 0) {
            leads[idx].telegram_username = from.username || leads[idx].telegram_username;
            leads[idx].nome = from.first_name + (from.last_name ? " " + from.last_name : "");
            if (leads[idx].status === "novo") leads[idx].score = Math.min((leads[idx].score || 0) + 1, 5);
            saveLeads(leads);
          }
        }
      }

      let responseText = "";
      const lower = text.toLowerCase();

      if (text === "/start" || text === "/iniciar") {
        responseText = onboardingTexto(from, text);
      
      } else if (text.startsWith("/start ")) {
        // Deep link: t.me/btcweatherpanel_bot?start=CODIGO → tenta vincular direto
        const codigo = text.replace("/start ", "").trim().toUpperCase();
        const lic = loadJSON(LICENSES_PATH);
        if (lic[codigo]) {
          notif.updateUser(chatId, { licenseCode: codigo, telegramId: from.id, nome: from.first_name + (from.last_name ? " " + from.last_name : "") });
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🔗 <b>Conta Vinculada</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Código <code>" + codigo + "</code> conectado com sucesso!\n\n📊 Você receberá análise BTC diária às 9h\n📡 Sinais operacionais em tempo real\n🌦️ Alertas de clima\n\nUse /notificacoes para configurar.\n\n📋 Veja seu status com /status.";
        } else {
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ Código Não Encontrado\n━━━━━━━━━━━━━━━━━━━━━━\n\nO código <code>" + codigo + "</code> não foi reconhecido.\n\nVerifique se copiou certo ou use:\n🎫 /resgatar seu@email — se comprou na Kiwify\n👤 /codigo — para gerar um VIP grátis\n\n🔗 https://btcweatherpanel.com/";
        }

      } else if (text === "/ajuda" || text === "/help") {
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❓ <b>Ajuda — Comandos</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n👤 <b>/codigo</b> — Gera código VIP 7 dias\n🎫 <b>/resgatar</b> email@… — Pega o código da sua compra Kiwify\n🔑 <b>/meucodigo</b> — Mostra seu código\n🔗 <b>/vincular VIP7-XXXXX</b> — Vincula Telegram\n📊 <b>/diaria on|off</b> — Análise BTC 9h\n🌦️ <b>/clima on|off</b> — Alerta de clima\n📧 <b>/email</b> user@email.com — Cadastra e-mail\n📋 <b>/status</b> — Status VIP\n⚙️ <b>/notificacoes</b> — Suas configs\n\n━━━━━━━━━━━━━━━━━━━━━━\n🔗 https://btcweatherpanel.com/";

      } else if (text === "/meucodigo") {
        const codes = loadJSON(getCodesPath());
        const leadCodes = codes.filter(c => c.telegram_id == from.id || c.telegram_username === (from.username || ""));
        if (leadCodes.length > 0) {
          const last = leadCodes[leadCodes.length - 1];
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🔑 <b>Seu Código VIP</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\nCódigo: <code>" + last.codigo + "</code>\n\nAtive em:\n🌐 https://btcweatherpanel.com/btc-weather-panel/?code=" + last.codigo;
        } else {
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ Nenhum Código Encontrado\n━━━━━━━━━━━━━━━━━━━━━━\n\nUse /codigo para gerar um VIP grátis de 7 dias.\n\n🔗 https://btcweatherpanel.com/";
        }

      } else if (text === "/codigo") {
        const http = require("http");
        const reqInt = http.request({
          hostname: "127.0.0.1", port: 3334, path: "/api/license/generate", method: "POST",
          headers: { "Content-Type": "application/json", "X-Admin-Secret": process.env.SECRET_KEY || "" }
        }, resInt => {
          let d = "";
          resInt.on("data", c => d += c);
          resInt.on("end", () => {
            try {
              const r = JSON.parse(d);
              const code = (r.codes && r.codes[0]) || "";
              if (code) {
                const codes = loadJSON(getCodesPath());
                codes.push({
                  leadId: from.id, nome: from.first_name, codigo: code,
                  telegram_id: from.id, telegram_username: from.username || "",
                  createdAt: new Date().toISOString(), sent: true
                });
                saveJSON(getCodesPath(), codes);
                responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🎉 <b>Código VIP Gerado</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🔑 Código: <code>" + code + "</code>\n\n📋 Ative em:\n🌐 https://btcweatherpanel.com/btc-weather-panel/?code=" + code + "\n\n💡 Use /vincular " + code + " para conectar ao Telegram e receber notificações.";
              } else {
                responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ Erro ao gerar código\n━━━━━━━━━━━━━━━━━━━━━━\n\nTente novamente em alguns instantes.";
              }
            } catch { responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ Erro ao gerar código\n━━━━━━━━━━━━━━━━━━━━━━\n\nTente novamente."; }
            sendTelegram(chatId, responseText, token);
          });
        });
        reqInt.on("error", () => sendTelegram(chatId, "━━━━━━━━━━━━━━━━━━━━━━\n❌ Erro ao gerar código\n━━━━━━━━━━━━━━━━━━━━━━\n\nTente novamente.", token));
        reqInt.end(JSON.stringify({ count: 1, source: "telegram_bot" }));
        res.writeHead(200);
        return res.end("ok");

      } else if (text.startsWith("/vincular ")) {
        const code = text.replace("/vincular ", "").trim().toUpperCase();
        const licenses = loadJSON(LICENSES_PATH);
        if (licenses[code]) {
          const user = notif.getUser(chatId);
          user.telegramId = from.id;
          user.nome = from.first_name + (from.last_name ? " " + from.last_name : "");
          notif.updateUser(chatId, { licenseCode: code, telegramId: from.id, nome: user.nome });
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🔗 <b>Conta Vinculada</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Código: <code>" + code + "</code>\n\n📊 Você receberá análise BTC diária às 9h\n🌦️ Alertas de clima em tempo real\n\nUse /notificacoes para configurar.";
        } else {
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ Código Não Encontrado\n━━━━━━━━━━━━━━━━━━━━━━\n\nVerifique o código e tente novamente.\nUse /codigo para gerar um novo VIP grátis.\n\n🔗 https://btcweatherpanel.com/";
        }

      } else if (text === "/notificacoes") {
        const user = notif.getUser(chatId);
        const diaria = user.prefs.dailyAnalysis ? "✅ Ligada" : "❌ Desligada";
        const clima = user.prefs.climateChange ? "✅ Ligado" : "❌ Desligado";
        const sinal = user.prefs.operationalSignal ? "✅ Ligado" : "❌ Desligado";
        const licenca = user.licenseCode ? "<code>" + user.licenseCode + "</code>" : "❌ Nenhuma";
        const email = user.email || "❌ Não cadastrado";
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n⚙️ <b>Suas Notificações</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n"
          + "🔗 Licença: " + licenca + "\n"
          + "📧 E-mail: " + email + "\n\n"
          + "📊 Análise diária (9h): " + diaria + "\n"
          + "🌦️ Alerta de clima: " + clima + "\n\n"
          + "━━━━━━━━━━━━━━━━━━━━━━\n/diaria on|off\n/clima on|off\n/email email@…";

      } else if (text === "/diaria on") {
        notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, dailyAnalysis: true } });
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n📊 <b>Análise Diária Ativada</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Você receberá análise BTC todo dia às 9h com:\n💎 Preço e variação\n📈 RSI, EMA 200, Fear & Greed\n🌦️ Previsão por período\n💡 Recomendação estratégica";
      } else if (text === "/diaria off") {
        notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, dailyAnalysis: false } });
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n📊 Análise Diária Desativada\n━━━━━━━━━━━━━━━━━━━━━━\n\n❌ Você não receberá mais análises automáticas.\n\nUse /diaria on para reativar quando quiser.";
      
      } else if (text === "/clima on") {
        notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, climateChange: true } });
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🌦️ <b>Alertas de Clima Ativados</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Você será notificado em <b>tempo real</b> quando houver mudança na previsão de qualquer período (15M a 1M).";
      } else if (text === "/sinais on") {
        notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, operationalSignal: true } });
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n📡 <b>Sinais Operacionais</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Alertas de sinal operacional ativados!\n\nVocê receberá notificações quando o cenário geral mudar entre alta/baixa/neutro.\n\nUse /sinais off para desativar.";
      } else if (text === "/sinais off") {
        notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, operationalSignal: false } });
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n📡 <b>Sinais Operacionais</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n❌ Alertas de sinal operacional desativados.";
      } else if (text === "/clima off") {
        notif.updateUser(chatId, { prefs: { ...notif.getUser(chatId).prefs, climateChange: false } });
        responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🌦️ Alertas de Clima Desativados\n━━━━━━━━━━━━━━━━━━━━━━\n\n❌ Você não receberá mais alertas de mudança climática.\n\nUse /clima on para reativar.";
      
      } else if (text.startsWith("/email ")) {
        const email = text.replace("/email ", "").trim();
        if (email.includes("@") && email.includes(".")) {
          notif.updateUser(chatId, { email });
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n📧 <b>E-mail Cadastrado</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ " + email + "\n\nVocê receberá notificações também por e-mail.";
        } else {
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ E-mail Inválido\n━━━━━━━━━━━━━━━━━━━━━━\n\nUse: /email usuario@dominio.com\nExemplo: /email fulano@gmail.com";
        }

      } else if (text.startsWith("/resgatar ")) {
        const email = text.replace("/resgatar ", "").trim().toLowerCase();
        if (!email.includes("@") || !email.includes(".")) {
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ <b>E-mail Inválido</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\nUse: /resgatar usuario@dominio.com\n\n💡 Use o mesmo e-mail da compra na Kiwify.";
        } else {
          const purchases = loadJSON(PURCHASES_PATH);
          const found = purchases
            .filter(p => p.customerEmail && String(p.customerEmail).toLowerCase() === email)
            .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
          if (found.length > 0) {
            const p = found[found.length - 1];
            const code = p.code;
            const linkAtivar = "https://btcweatherpanel.com/btc-weather-panel/?code=" + code;
            const nome = (from.first_name || "") + (from.last_name ? " " + from.last_name : "");
            // Vincula a licença ao Telegram automaticamente
            notif.updateUser(chatId, { licenseCode: code, telegramId: from.id, nome: nome });
            responseText = "━━━━━━━━━━━━━━━━━━━━━━\n🎉 <b>Compra encontrada!</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n👋 " + nome + ", seu acesso VIP:\n\n🔑 <b>Código:</b> <code>" + code + "</code>\n📦 <b>Plano:</b> " + (p.plan || "VIP") + "\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ <b>Ative em:</b>\n" + linkAtivar + "\n\n🔗 Seu Telegram já foi vinculado! Você receberá:\n📊 Análise diária às 9h\n🌦️ Alertas de clima em tempo real\n📡 Sinais operacionais\n\n📋 Use /status para confirmar.";
            // Avisa o admin que o código foi resgatado
            const adminChat = process.env.TELEGRAM_CHAT_ID || "";
            if (adminChat && token) {
              sendTelegram(adminChat, "💌 <b>Código resgatado pelo comprador</b>\n\n👤 " + nome + "\n📧 " + p.customerEmail + "\n🔑 <code>" + code + "</code>", token);
            }
          } else {
            responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ <b>Compra Não Encontrada</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\nNenhuma compra com o e-mail <b>" + email + "</b>.\n\n💡 Use o mesmo e-mail cadastrado na Kiwify.\nSe comprou agora, aguarde 2 minutos e tente de novo.\n\nCaso precise, fale com o suporte.";
          }
        }

      } else if (text === "/status") {
        const user = notif.getUser(chatId);
        if (!user.licenseCode) {
          responseText = "━━━━━━━━━━━━━━━━━━━━━━\n❌ Nenhuma Licença Vinculada\n━━━━━━━━━━━━━━━━━━━━━━\n\nUse /vincular CODIGO para conectar sua conta.\nOu /codigo para gerar um código VIP grátis.\n\n🔗 https://btcweatherpanel.com/";
        } else {
          const licenses = loadJSON(LICENSES_PATH);
          const lic = licenses[user.licenseCode];
          if (lic && lic.activatedAt && lic.activatedAt !== 'null') {
            const activatedAt = lic.activatedAt_ts || new Date(lic.activatedAt).getTime();
            const daysPassed = Math.floor((Date.now() - activatedAt) / (1000 * 60 * 60 * 24));
            const daysLeft = Math.max(0, 7 - daysPassed);
            if (daysLeft > 0) {
              responseText = "━━━━━━━━━━━━━━━━━━━━━━\n✅ <b>VIP Ativo</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🔗 Código: <code>" + user.licenseCode + "</code>\n📅 Dias restantes: " + daysLeft + "\n\n📊 Diária: " + (user.prefs.dailyAnalysis ? "✅" : "❌") + "  |  🌦️ Clima: " + (user.prefs.climateChange ? "✅" : "❌") + "\n\nUse /notificacoes para configurar.";
            } else {
              responseText = "━━━━━━━━━━━━━━━━━━━━━━\n⏳ <b>VIP Expirado</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n🔗 Código: <code>" + user.licenseCode + "</code>\n\n💎 Renove sua assinatura:\n📆 Mensal: https://pay.kiwify.com.br/ffphj4e\n📅 Anual: https://pay.kiwify.com.br/vim8bDb";
            }
          } else {
            responseText = "━━━━━━━━━━━━━━━━━━━━━━\n⚠️ Licença Não Ativada\n━━━━━━━━━━━━━━━━━━━━━━\n\nAcesse o painel com seu código:\n🌐 https://btcweatherpanel.com/btc-weather-panel/?code=" + user.licenseCode;
          }
        }
      }

      if (responseText) {
        sendTelegram(chatId, responseText, token);
      }
      res.writeHead(200);
      res.end("ok");
    } catch (e) {
      console.error("Telegram webhook error:", e.message);
      res.writeHead(200);
      res.end("ok");
    }
  });
}

function sendTelegram(chatId, text, token) {
  if (!token || !chatId) return;
  token = token || process.env.TELEGRAM_TOKEN || "";
  const payload = JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" });
  const opts = { hostname: "api.telegram.org", port: 443, path: "/bot" + token + "/sendMessage", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } };
  const req = https.request(opts);
  req.on("error", () => {});
  req.write(payload);
  req.end();
}

function onboardingTexto(from, textoCompleto) {
  const nome = (from.first_name || '').split(' ')[0];
  const sauda = nome ? nome + '!' : 'seja bem-vindo(a)!';
  return "━━━━━━━━━━━━━━━━━━━━━━\n🚀 <b>BTC Weather Panel</b>\n🦾 <b>Bot Severino</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n👋 Oi, " + sauda + " Aqui você recebe:\n📊 Análise BTC diária às 9h\n📡 Sinais operacionais em tempo real\n🌦️ Alertas de clima\n\n<b>Como ativar seu acesso:</b>\n\n1️⃣ <b>Já comprou?</b> Envie:\n🎫 /resgatar seuemail@…\n\n2️⃣ <b>Ainda não tem código?</b> Envie:\n👤 /codigo (VIP grátis 7 dias)\n\n3️⃣ <b>Já tem código?</b> Envie:\n🔗 /vincular SEUCODIGO\n\n━━━━━━━━━━━━━━━━━━━━━━\n📋 /status — Ver sua assinatura\n⚙️ /notificacoes — Configurar alertas\n❓ /ajuda — Todos os comandos\n\n🔗 https://btcweatherpanel.com/";
}

module.exports = { handleWebhook, sendTelegram };
