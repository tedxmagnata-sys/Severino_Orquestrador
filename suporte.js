/**
 * 🤖 Agente Suporte — gerencia o e-mail de suporte de TODOS os infoprodutos
 *    do severinobot.com (BTC Weather Panel, LeadBook, Barber, ConsultorIA...).
 *
 * Fluxo: IMAP (ler) → LLM (entender+responder) → SMTP (enviar) → Telegram (avisar).
 * Regra de autonomia: responde o simples, escala o complexo para o dono.
 *
 * Deps: imapflow, mailparser, nodemailer
 * PM2: pm2 start suporte.js --name suporte --time
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

const ia = require('./ia');
const canais = require('./canais');
const produtos = require('./produtos');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'suporte_state.json');
const LOG_FILE = path.join(DATA_DIR, 'suporte.log.jsonl');

const PORT = parseInt(process.env.SUPORTE_HTTP_PORT || '3337', 10);
const IMAP_HOST = process.env.SUPORTE_IMAP_HOST || 'imap.zoho.com';
const IMAP_PORT = parseInt(process.env.SUPORTE_IMAP_PORT || '993', 10);
const IMAP_SECURE = (process.env.SUPORTE_IMAP_SECURE || 'true') === 'true';
const IMAP_USER = process.env.SUPORTE_IMAP_USER || '';
const IMAP_PASS = process.env.SUPORTE_IMAP_PASS || '';
const SMTP_HOST = process.env.SUPORTE_SMTP_HOST || IMAP_HOST.replace('imap.', 'smtp.');
const SMTP_PORT = parseInt(process.env.SUPORTE_SMTP_PORT || '465', 10);
const SMTP_SECURE = (process.env.SUPORTE_SMTP_SECURE || 'true') === 'true';
const SMTP_USER = process.env.SUPORTE_SMTP_USER || IMAP_USER;
const SMTP_PASS = process.env.SUPORTE_SMTP_PASS || IMAP_PASS;
const SMTP_FROM = process.env.SUPORTE_SMTP_FROM || `"Suporte Severino" <${SMTP_USER || 'suporte@severinobot.com'}>`;
const INTERVALO = parseInt(process.env.SUPORTE_INTERVALO || '60', 10);
const REPLIES_DIA = parseInt(process.env.SUPORTE_REPLIES_DIA || '100', 10);
const DRY_RUN = (process.env.SUPORTE_DRY_RUN || '0') === '1';
const AUTO_MARKER = '[atendimento automático]';
const ADM = process.env.SUPORTE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '';

let transporter = null;
function getTransporter() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false }
  });
  return transporter;
}

function estado() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { processados: {}, autoHoje: 0, dia: '' }; }
}
function salvarEstado(e) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(e, null, 2));
}
function logLinha(entry) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}
function hoje() { return new Date().toISOString().slice(0, 10); }

function textoLimpo(mail) {
  let t = mail.text || '';
  if (!t.trim() && mail.html) t = String(mail.html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return t.replace(/\s+/g, ' ').trim().slice(0, 4000);
}

function catalogoProdutos() {
  const linhas = [];
  for (const p of Object.values(produtos)) {
    if (!p.nome) continue;
    const moeda = String(p.moeda || 'BRL').toUpperCase();
    const simbolo = moeda === 'USD' ? 'US$' : 'R$';
    const preco = p.plano && p.plano.preco != null ? `${simbolo}${p.plano.preco}/${p.plano.periodo || 'mês'}` : 'gratuito (teste)';
    const trial = p.plano && p.plano.trialDias ? `trial ${p.plano.trialDias} dias` : 'sem trial';
    linhas.push(`- ${p.nome} (id: ${p.id}): ${preco}. Checkout: ${p.checkout || '—'} ${p.checkoutUrl || ''}. ${trial}. Status: ${p.status || ''}. Persona: ${p.persona || ''}.`);
  }
  return linhas.join('\n');
}

const SISTEMA = `Você é o assistente de suporte por e-mail do ecossistema de infoprodutos do severinobot.com (nome humano: "Severino Suporte"). Responda SEMPRE em português do Brasil, tom amigável, direto e profissional, sem exageros.

PRODUTOS ECOSSISTEMA:
${catalogoProdutos()}

REGRAS:
1. Responda APENAS dúvidas simples e seguras: onde acessar o produto, como ativar/digar trial, onde está o código, como cancelar, valores e planos, prazo do reembolso.
2. NUNCA prometa reembolso automático, créditos ou descontos extras. Se o cliente pedir cancelamento/reembolso, diga que a solicitação foi encaminhada e avise = MODO ESCALA.
3. Se o e-mail for agressivo, ofensivo, técnico avançado, pedido de reembolso/cancelamento, denúncia de cobrança indevida, problema de acesso persistente, ou se você não tiver certeza → MODO ESCALA. Não invente.
4. Máximo ~120 palavras na resposta. Encerre com: "Equipe ${AUTO_MARKER} · Em caso de dúvida, responda este e-mail." (não traduza isso).
5. Identifique o produto pelo contexto (nome citado, preço, link, domínio). Se não der para identificar, use "produto" genérico e marque escala se precisar assumir algo.

Responda SOMENTE com JSON válido:
{"produto":"id ou desconhecido","intento":"cancelamento|reembolso|duvida|ativacao|problema-tecnico|outro","resumo":"1 frase","escalar":true|false,"resposta":"texto da resposta (só se escalar=false, senão deixe vazio)"}`;

async function classificarEResponder(mail) {
  const prompt = `ASSUNTO: ${mail.subject || '(sem assunto)'}
DE: ${mail.from ? (mail.from.text || '') : '(desconhecido)'}
DATA: ${mail.date ? mail.date.toISOString() : ''}
MENSAGEM:
${textoLimpo(mail)}`;
  const r = await ia.perguntar({ agente: 'suporte', sistema: SISTEMA, mensagens: [{ role: 'user', content: prompt }], modelo: 'forte', temperatura: 0.3 });
  const txt = r.texto || '';
  const ini = txt.indexOf('{');
  const fim = txt.lastIndexOf('}');
  if (ini === -1 || fim === -1) throw new Error('LLM não retornou JSON: ' + txt.slice(0, 200));
  const j = JSON.parse(txt.slice(ini, fim + 1));
  return { produto: String(j.produto || 'desconhecido'), intento: String(j.intento || 'outro'), resumo: String(j.resumo || ''), escalar: !!j.escalar, resposta: String(j.resposta || '') };
}

async function enviarResposta(mail, texto) {
  const t = getTransporter();
  if (!t) throw new Error('Sem credenciais SMTP do suporte');
  const assunto = String(mail.subject || '').trim();
  const refs = (mail.references ? (Array.isArray(mail.references) ? mail.references : String(mail.references)) : null);
  const references = refs ? (Array.isArray(refs) ? [...refs, mail.messageId] : [refs, mail.messageId]) : [mail.messageId];
  await t.sendMail({
    from: SMTP_FROM,
    to: mail.from.text,
    subject: /^re:/i.test(assunto) ? assunto : 'Re: ' + assunto,
    text: texto,
    inReplyTo: mail.messageId,
    references
  });
}

async function processarEmail(client, uid, mail) {
  if (!mail.from || !mail.from.text) return;
  const de = String(mail.from.text).toLowerCase();
  if (de.includes(SMTP_USER.toLowerCase())) return; // loop com nossos próprios envios
  const estadoAtual = estado();
  if (estadoAtual.processados[mail.messageId]) return;

  const tele = (msg) => { if (ADM) return canais.enviarTelegram(ADM, msg); return Promise.resolve(); };

  let clf;
  try {
    clf = await classificarEResponder(mail);
  } catch (e) {
    console.error('Falha no LLM p/ ' + mail.messageId, e.message);
    await tele(`⚠️ <b>Suporte</b>: não consegui analisar e-mail (LLM).\n\n<b>De:</b> ${mail.from.text}\n<b>Assunto:</b> ${mail.subject || ''}\n<pre>${textoLimpo(mail).slice(0, 400)}</pre>`);
    estadoAtual.processados[mail.messageId] = 'erro-llm';
    salvarEstado(estadoAtual);
    return;
  }

  const autoHojeOk = estadoAtual.dia === hoje() ? estadoAtual.autoHoje : 0;
  const deveAuto = !clf.escalar && autoHojeOk < REPLIES_DIA && clf.resposta.trim();

  const entry = {
    ts: new Date().toISOString(),
    messageId: mail.messageId,
    de: mail.from.text,
    assunto: mail.subject || '',
    uid,
    produto: clf.produto,
    intento: clf.intento,
    resumo: clf.resumo,
    acao: deveAuto ? 'resposta' : 'escala'
  };

  if (deveAuto && DRY_RUN) {
    entry.acao = 'resposta(dry-run)';
    console.log('[DRY] responder', entry.de, '->', clf.resposta.slice(0, 120));
  } else if (deveAuto) {
    try {
      await enviarResposta(mail, clf.resposta);
      entry.acao = 'resposta';
      await tele(`✅ <b>Respondi</b> (${clf.produto} · ${clf.intento})\n<b>De:</b> ${mail.from.text}\n<b>Resumo:</b> ${clf.resumo}`);
    } catch (e) {
      entry.acao = 'erro-envio';
      entry.erro = e.message;
      console.error('Falha SMTP p/ ' + mail.messageId, e.message);
      await tele(`⚠️ <b>Suporte</b>: NÃO consegui enviar resposta.\n<b>De:</b> ${mail.from.text}\n<b>Assunto:</b> ${mail.subject || ''}\n<b>Erro:</b> ${e.message}`);
    }
  } else {
    const motivo = !clf.resposta.trim() ? (clf.escalar ? 'escalado pelo bot' : 'sem resposta') : `limite diário (${REPLIES_DIA})`;
    entry.motivoEscala = motivo;
    await tele(`🚨 <b>Escalar suporte</b> (${clf.produto} · ${clf.intento} · ${motivo})\n<b>De:</b> ${mail.from.text}\n<b>Assunto:</b> ${mail.subject || ''}\n<b>Resumo:</b> ${clf.resumo}\n\nMensagem:\n${textoLimpo(mail).slice(0, 700)}`);
  }

  if (deveAuto) {
    const e = estado();
    e.dia = hoje();
    e.autoHoje = (e.dia === hoje() ? e.autoHoje : 0) + 1;
    e.processados[mail.messageId] = 'ok';
    salvarEstado(e);
  } else {
    const e = estado();
    e.processados[mail.messageId] = entry.acao + (entry.motivoEscala ? ':' + entry.motivoEscala : '');
    salvarEstado(e);
  }
  logLinha(entry);
  try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch {}
}

async function ciclo() {
  if (!IMAP_USER || !IMAP_PASS) {
    console.log('Sem credenciais IMAP do suporte — aguardando configuração.');
    return;
  }
  const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: IMAP_SECURE, auth: { user: IMAP_USER, pass: IMAP_PASS }, logger: false });
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const desde = new Date(Date.now() - 14 * 86400000);
      const ids = await client.search({ unseen: true, since: desde }, { uid: true });
      if (!ids.length) return;
      console.log(`Suporte: ${ids.length} e-mail(s) novo(s)`);
      for (const uid of ids.sort((a, b) => a - b)) {
        const msgs = [];
        for await (const m of client.fetch([uid], { source: true }, { uid: true })) msgs.push(m);
        if (!msgs.length) continue;
        const texto = Buffer.isBuffer(msgs[0].source) ? msgs[0].source : Buffer.from(msgs[0].source || '');
        const mail = await simpleParser(texto, { maxAttachments: 0, skipHtmlToText: true });
        await processarEmail(client, uid, mail);
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error('Erro no ciclo IMAP:', e.message);
  } finally {
    try { await client.logout(); } catch {}
  }
}

// Health HTTP para o nginx/PM2 (opcional)
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, nome: 'Agente Suporte', configurado: !!IMAP_USER && !!IMAP_PASS, dryRun: DRY_RUN, produtos: Object.keys(produtos).filter((k) => produtos[k].nome).length, base: '/suporte' }));
}).listen(PORT, () => console.log(`Agente Suporte rodando (health :${PORT}) — poll a cada ${INTERVALO}s`));

ciclo();
setInterval(ciclo, INTERVALO * 1000);