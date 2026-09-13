/**
 * 🤖 community-manager.js — Agente Bot que administra a Comunidade Severino
 * ---------------------------------------------------------------------------
 * Roda 24/7 no VPS (PM2). Cuida de:
 *   - Boas-vindas a novos membros
 *   - Respostas a dúvidas (IA + conteúdo do guia)
 *   - Posts programados (agenda em data/community-content.json)
 *   - Moderação básica (remove spam de links)
 *   - Resumo diário por DM para o admin
 *
 * Config (no .env):
 *   TELEGRAM_COMMUNITY_TOKEN   -> token do bot criado no BotFather
 *   TELEGRAM_COMMUNITY_CHAT_ID -> id do grupo/comunidade (ex: -100123...)
 *   TELEGRAM_ADMIN_CHAT_ID     -> quem recebe o resumo (default: TELEGRAM_CHAT_ID)
 *   COMMUNITY_WELCOME_TOPIC    -> (opcional) id do tópico de boas-vindas
 *
 * Uso: node community-manager.js
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const ia = require('./ia');
const guardiao = require('./guardiao');

const TOKEN = ia.env('TELEGRAM_COMMUNITY_TOKEN', '');
const CHAT = ia.env('TELEGRAM_COMMUNITY_CHAT_ID', '');
const ADMIN = ia.env('TELEGRAM_ADMIN_CHAT_ID', ia.env('TELEGRAM_CHAT_ID', ''));
const WELCOME_TOPIC = ia.env('COMMUNITY_WELCOME_TOPIC', '');
const GUIDE_PATH = path.join(__dirname, '..', 'guia-monte-seu-severino.md');
const CONTENT_PATH = path.join(__dirname, 'data', 'community-content.json');
const STATE_PATH = path.join(__dirname, 'data', 'community-state.json');

const API = 'https://api.telegram.org/bot';

// ===================== Persistência =====================
function lerEstado() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { offset: 0, dia: '', membrosBemVindos: 0, respostas: 0, posts: 0 }; }
}
function salvarEstado(s) {
  try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); } catch {}
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch {}
}
function lerConteudo() {
  try { return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')); } catch { return { posts: [] }; }
}
function lerGuia() {
  try { return fs.readFileSync(GUIDE_PATH, 'utf8').slice(0, 8000); } catch { return ''; }
}

// ===================== Telegram API =====================
function tg(method, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(60000, () => { req.destroy(); resolve(null); });
    req.write(data); req.end();
  });
}

function enviar(texto, topicId) {
  const body = { chat_id: CHAT, text: String(texto || '').slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true };
  if (topicId) body.message_thread_id = topicId;
  return tg('sendMessage', body);
}

function avisarAdmin(texto) {
  if (!ADMIN) return Promise.resolve();
  return tg('sendMessage', { chat_id: ADMIN, text: String(texto || '').slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true });
}

// ===================== Boas-vindas =====================
function textoBoasVindas(nome) {
  return [
    `👋 Bem-vindo(a), <b>${nome}</b>!`,
    ``,
    `Você entrou na <b>Comunidade Severino</b> — aqui a gente aprende a ter o <b>seu próprio agente de IA</b> trabalhando 24h.`,
    ``,
    `📚 <b>O que fazer agora:</b>`,
    `1. Leia o tópico <b>📌 Boas-vindas</b> (regras + links)`,
    `2. Apresente-se no <b>💬 Geral</b>`,
    `3. Dúvida? Poste no tópico certo — eu respondo 😉`,
    ``,
    `Qualquer coisa, é só perguntar. Estou aqui 24/7. 🤖`
  ].join('\n');
}

async function darBoasVindas(msg) {
  const novos = msg.new_chat_members || [];
  if (!novos.length) return false;
  for (const u of novos) {
    if (u.is_bot) continue;
    const nome = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'amigo(a)';
    await enviar(textoBoasVindas(nome), WELCOME_TOPIC || msg.message_thread_id);
  }
  const st = lerEstado();
  st.membrosBemVindos = (st.membrosBemVindos || 0) + novos.filter(u => !u.is_bot).length;
  salvarEstado(st);
  return true;
}

// ===================== Respostas com IA =====================
function deveResponder(msg, texto) {
  if (!texto) return false;
  const mencao = (msg.entities || []).some(e => e.type === 'mention');
  const reply = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot;
  const pergunta = texto.trim().endsWith('?');
  const palavra = /\b(severino|agente|bot|vps|opencode|openrouter|guia|comunidade|assinatura|preco|preço|como faço)\b/i.test(texto);
  return mencao || reply || (pergunta && palavra);
}

async function responderComIA(msg, texto) {
  try {
    const guia = lerGuia();
    const r = await ia.perguntar({
      agente: 'gestor-comunidade',
      sistema:
        'Você é o Severino, gestor da Comunidade Severino (Telegram). ' +
        'Fala português claro, é simpático, direto e ajuda de verdade. ' +
        'Você ajuda membros a montar o próprio agente de IA na nuvem (VPS + OpenRouter + opencode) ' +
        'usando o guia "Monte Seu Severino". Produto: guia R$47, assinatura Severino Vendedor IA R$67,89/mês. ' +
        'NUNCA prometa lucro, retorno garantido ou resultados mágicos. ' +
        'Se não souber, diga que vai verificar e peça para a pessoa detalhar. ' +
        'Use no máximo 4 frases. Não use markdown pesado; texto simples.\n\n' +
        'CONTEÚDO DO GUIA (use como fonte):\n' + guia,
      mensagens: [{ role: 'user', content: texto }]
    });
    const aprovado = guardiao.aprovar(r.texto).texto;
    await enviar(aprovado, msg.message_thread_id);
    const st = lerEstado();
    st.respostas = (st.respostas || 0) + 1;
    salvarEstado(st);
  } catch (e) {
    await enviar('Boa pergunta! Deixa eu verificar isso e já te respondo. 🙏', msg.message_thread_id);
  }
}

// ===================== Moderação =====================
function pareceSpam(texto) {
  if (!texto) return false;
  const links = (texto.match(/https?:\/\//g) || []).length;
  const temGolpe = /\b(ganhe|clique aqui|renda extra|cripto grátis|trabalhe em casa)\b/i.test(texto);
  return links >= 3 || (links >= 1 && temGolpe);
}
async function moderar(msg) {
  const t = msg.text || msg.caption || '';
  if (pareceSpam(t)) {
    await tg('deleteMessage', { chat_id: msg.chat.id, message_id: msg.message_id });
    return true;
  }
  return false;
}

// ===================== Posts programados =====================
function horaBR() {
  const now = new Date(Date.now() - 3 * 3600000); // UTC-3
  return now.toISOString().slice(11, 16);
}
async function checarPosts() {
  const cfg = lerConteudo();
  const posts = Array.isArray(cfg.posts) ? cfg.posts : [];
  if (!posts.length) return;
  const st = lerEstado();
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const hhmm = horaBR();
  for (const p of posts) {
    if (p.hora !== hhmm) continue;
    const chave = `${hoje}:${p.hora}:${(p.texto || '').slice(0, 20)}`;
    st.enviados = st.enviados || {};
    if (st.enviados[chave]) continue;
    const aprovado = guardiao.aprovar(p.texto).texto;
    await enviar(aprovado, p.topico || undefined);
    st.enviados[chave] = new Date().toISOString();
    st.posts = (st.posts || 0) + 1;
    salvarEstado(st);
  }
}

// ===================== Resumo diário =====================
async function resumoDiario() {
  const st = lerEstado();
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  if (st.ultimoResumo === hoje) return;
  await avisarAdmin(
    `📊 <b>Comunidade Severino — resumo de hoje</b>\n` +
    `👋 Novos membros: ${st.membrosBemVindos || 0}\n` +
    `💬 Respostas do bot: ${st.respostas || 0}\n` +
    `📅 Posts publicados: ${st.posts || 0}`
  );
  st.ultimoResumo = hoje;
  st.membrosBemVindos = 0; st.respostas = 0; st.posts = 0;
  salvarEstado(st);
}

// ===================== Loop principal =====================
async function processarUpdate(upd) {
  const msg = upd.message || upd.edited_message;
  if (!msg) return;

  // boas-vindas
  if (msg.new_chat_members && msg.new_chat_members.length) {
    await darBoasVindas(msg);
    return;
  }
  const texto = msg.text || '';
  if (!texto) return;

  // moderação
  if (await moderar(msg)) return;

  // respostas
  if (deveResponder(msg, texto)) {
    await responderComIA(msg, texto);
  }
}

async function loop() {
  const st = lerEstado();
  let offset = st.offset || 0;
  for (;;) {
    const r = await tg('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'edited_message'] });
    if (r && r.ok && Array.isArray(r.result)) {
      for (const upd of r.result) {
        offset = upd.update_id + 1;
        try { await processarUpdate(upd); } catch (e) {}
      }
      if (r.result.length) { st.offset = offset; salvarEstado(st); }
    } else {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ===================== Start =====================
if (!TOKEN || !CHAT) {
  console.log('[community] Faltam TELEGRAM_COMMUNITY_TOKEN / TELEGRAM_COMMUNITY_CHAT_ID no .env');
  process.exit(0);
}
console.log('[community] Gestor da Comunidade Severino iniciado ✓ chat=' + CHAT);
setInterval(() => checarPosts().catch(() => {}), 60000);   // checa agenda a cada 1 min
setInterval(() => resumoDiario().catch(() => {}), 60 * 60000); // resumo a cada 1h (1x/dia)
loop().catch(e => console.error('[community] loop erro:', e.message));
