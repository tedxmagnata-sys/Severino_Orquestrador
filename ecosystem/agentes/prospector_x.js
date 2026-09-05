/**
 * 🐦 Prospector X/Twitter — prospecção com valor em posts sobre Bitcoin/cripto.
 *
 * A cada tick.prospeccao_x:
 *   1. Busca tweets recentes sobre BTC/cripto em português (API v2, Bearer token).
 *   2. Filtra oportunidades.
 *   3. Gera comentário com VALOR via LLM.
 *   4. Envia ao admin no Telegram com INLINE KEYWORDS:
 *      - ✅ Aprovar (post automático)
 *      - ⏭️ Pular
 *      - 📋 Copiar (só mostra o texto)
 *   5. Se X_AUTO_REPLY=true e OAuth completo, posta automático sem pedir.
 *
 * Anti-spam / anti-ban:
 *   - limite de ações por rodada (X_MAX_POR_RODADA, default 5);
 *   - estado em data/prospeccao_x.json (nunca repete tweet);
 *   - só tweets em português sobre Bitcoin/cripto;
 *   - comentário sempre > 40 palavras e com conteúdo educativo real.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const canais = require('../canais');
const ia = require('../ia');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ESTADO = path.join(DATA_DIR, 'prospeccao_x.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending_replies.json');

const BEARER = process.env.X_BEARER_TOKEN;
const MAX_POR_RODADA = parseInt(process.env.X_MAX_POR_RODADA || '5', 10);
const LIMITE_TWEETS = parseInt(process.env.X_LIMITE_TWEETS || '20', 10);
const AUTO_REPLY = process.env.X_AUTO_REPLY === 'true';
const JANELA_MIN = 4 * 60;

const SINAIS_INTERESSE = [
  'bitcoin', 'btc', 'cripto', 'entrar', 'comprar', 'investir', 'carteira',
  'quando comprar', 'vender', 'previsão', 'preço', 'taxa', 'rendimento',
  'bear', 'bull', 'queda', 'alta', 'mineração', 'halving', 'altcoin'
];

const BLOQUEIO = [
  'scam', 'golpe', 'perdi tudo', 'furada', 'rug pull', 'preciso de ajuda',
  'me recuperar', 'casa de aposta', 'bet365'
];

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return { respondidos: {}, ultimaRodada: null }; }
}

function salvarEstado(e) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2));
}

function lerPending() {
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return []; }
}

function salvarPending(arr) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(PENDING_FILE, JSON.stringify(arr, null, 2));
}

async function buscarTweets(query, token) {
  const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${LIMITE_TWEETS}&tweet.fields=created_at,author_id,text,public_metrics`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`x ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

async function buscarPerfil(authorId, token) {
  const res = await fetch(`https://api.x.com/2/users/${authorId}?user.fields=username,name,public_metrics`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return { username: 'desconhecido', name: '' };
  const d = await res.json();
  return d.data || { username: 'desconhecido', name: '' };
}

async function gerarComentario(tweet) {
  const sistema =
    'Você é o Prospector X/Twitter. Escreva UM reply útil e educativo respondendo a ' +
    'um tweet sobre Bitcoin/cripto. Regras: valor real primeiro (dados, contexto, ' +
    'pró/contra), tom respeitoso, SEM link, SEM promoção, SEM promessa de lucro, ' +
    '40-80 palavras, em pt-BR. Termine com uma pergunta aberta leve.';
  try {
    const r = await ia.perguntar({
      agente: 'prospector_x',
      modelo: 'barato',
      sistema,
      mensagens: [{ role: 'user', content: `Tweet: ${tweet.text.slice(0, 500)}` }],
      temperatura: 0.7
    });
    return r.texto.trim();
  } catch {
    return (
      `Boa análise! Sobre o que você mencionou: o importante é separar tendência ` +
      `(direção de médio prazo) de timing (melhor momento de entrada). Dá pra acompanhar ` +
      `indicadores simples de sentimento (Fear & Greed, volume) em vez de tentar adivinhar ` +
      `topo ou fundo. O que você está acompanhando mais de perto?`
    );
  }
}

async function postarReplyDireto(tweetId, replyText, username) {
  const { TwitterApi } = require('twitter-api-v2');
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });
  await client.v2.reply(replyText, tweetId);
  return true;
}

function ehOportunidade(tweet, estado) {
  if (estado.respondidos[tweet.id]) return false;
  const t = (tweet.text || '').toLowerCase();
  if (!SINAIS_INTERESSE.some(s => t.includes(s))) return false;
  if (BLOQUEIO.some(b => t.includes(b))) return false;
  const likes = tweet.public_metrics?.like_count || 0;
  if (likes > 50) return false;
  return true;
}

async function processar(evento, ctx) {
  if (evento.tipo !== 'tick.prospeccao_x') {
    return { agente: 'prospector_x', acao: 'tipo não tratado', novosEventos: [] };
  }

  if (!BEARER) {
    await canais.enviarAdmin('Prospector X: X_BEARER_TOKEN ausente no .env.');
    return { agente: 'prospector_x', acao: 'bearer ausente', novosEventos: [] };
  }

  const estado = lerEstado();
  const feitos = [];
  const falhas = [];

  try {
    const queries = [
      'bitcoin lang:pt -is:retweet',
      'btc comprar lang:pt -is:retweet',
      'cripto investir lang:pt -is:retweet'
    ];

    for (const q of queries) {
      if (feitos.length >= MAX_POR_RODADA) break;

      let data;
      try {
        data = await buscarTweets(q, BEARER);
      } catch (e) {
        falhas.push(`query "${q.slice(0, 20)}": ${e.message}`);
        continue;
      }

      const tweets = (data.data || [])
        .filter(t => t && t.id && !t.text.startsWith('RT '))
        .filter(t => {
          const ts = new Date(t.created_at || 0).getTime();
          return Date.now() - ts <= JANELA_MIN * 60000;
        })
        .filter(t => ehOportunidade(t, estado));

      for (const tweet of tweets.slice(0, MAX_POR_RODADA - feitos.length)) {
        if (feitos.length >= MAX_POR_RODADA) break;

        const texto = await gerarComentario(tweet);
        const perfil = await buscarPerfil(tweet.author_id, BEARER);

        // MODO AUTOMÁTICO (quando configurado e OAuth disponível)
        if (AUTO_REPLY && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET) {
          try {
            await postarReplyDireto(tweet.id, texto, perfil.username);
            estado.respondidos[tweet.id] = {
              ts: new Date().toISOString(),
              username: perfil.username,
              tweetText: tweet.text.slice(0, 100),
              modo: 'auto'
            };
            feitos.push({ id: tweet.id, username: perfil.username, modo: 'auto' });
            await new Promise(res => setTimeout(res, 2000));
            continue;
          } catch (e) {
            // Se falhar (403 = tier gratuito), cai para modo assistente
          }
        }

        // MODO ASSISTENTE (1-clique)
        const pendingId = `x_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const pending = lerPending();
        pending.push({
          id: pendingId,
          tweetId: tweet.id,
          username: perfil.username,
          tweetText: tweet.text.slice(0, 200),
          replyText: texto,
          criadoEm: new Date().toISOString()
        });
        salvarPending(pending);

        // Enviar com inline keyboard
        const linkTweet = `https://x.com/${perfil.username}/status/${tweet.id}`;
        const msg =
          `🐦 <b>Reply para postar</b>\n\n` +
          `👤 @${perfil.username} (${perfil.name})\n` +
          `💬 "${tweet.text.slice(0, 120)}"\n` +
          `❤️ ${tweet.public_metrics?.like_count || 0} likes\n` +
          `🔗 ${linkTweet}\n\n` +
          `📝 <b>Reply:</b>\n${texto}`;

        const buttons = [
          [{ text: '✅ Aprovar', callback_data: `x_approve:${pendingId}` }],
          [{ text: '⏭️ Pular', callback_data: `x_skip:${pendingId}` }]
        ];

        await canais.enviarInlineKeyboard(process.env.TELEGRAM_CHAT_ID, msg, buttons);

        estado.respondidos[tweet.id] = {
          ts: new Date().toISOString(),
          username: perfil.username,
          tweetText: tweet.text.slice(0, 100),
          modo: 'assistente'
        };
        feitos.push({ id: tweet.id, username: perfil.username, modo: 'assistente' });

        await new Promise(res => setTimeout(res, 1500));
      }
    }

    estado.ultimaRodada = new Date().toISOString();
    salvarEstado(estado);

    if (feitos.length && !AUTO_REPLY) {
      const autoCount = feitos.filter(f => f.modo === 'auto').length;
      const assistCount = feitos.filter(f => f.modo === 'assistente').length;
      let msg = `Prospector X: ${feitos.length} oportunidade(s)!`;
      if (autoCount) msg += ` (${autoCount} auto)`;
      if (assistCount) msg += ` (${assistCount} para aprovar)`;
      await canais.enviarAdmin(msg);
    }
    if (falhas.length) {
      await canais.enviarAdmin(`Prospector X: ${falhas.length} falha(s) — ${falhas.slice(0, 3).join(' | ')}`);
    }

    return {
      agente: 'prospector_x',
      acao: `feitos=${feitos.length} falhas=${falhas.length} auto=${AUTO_REPLY}`,
      novosEventos: []
    };
  } catch (e) {
    const msg = String(e.message || e);
    await canais.enviarAdmin(`Prospector X: erro — ${msg.slice(0, 200)}`);
    return { agente: 'prospector_x', acao: `erro: ${msg.slice(0, 200)}`, novosEventos: [] };
  }
}

module.exports = { processar };
