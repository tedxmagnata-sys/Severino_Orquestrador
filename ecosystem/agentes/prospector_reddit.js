/**
 * ðŸ¤– Prospector Reddit â€” prospecÃ§Ã£o com valor em subreddits de cripto/investimento.
 *
 * A cada tick.prospeccao_reddit:
 *   1. LÃª posts novos dos subreddits configurados.
 *   2. Filtra oportunidades reais: pergunta sobre BTC/entrada/saÃ­da/investimento,
 *      post recente (janela 2h) e sem resposta nossa.
 *   3. Comenta com VALOR (resposta Ãºtil/educativa, sem CTA direto no 1Âº contato)
 *      â€” Reddit ban self-promo; a regra Ã© "agregue antes de convidar".
 *   4. SÃ³ se a pessoa responder ao comentÃ¡rio Ã© que o CTA do bot entra (2Âº contato).
 *
 * Modos:
 *   - OAuth configurado (REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD): lÃª e comenta
 *     via oauth.reddit.com (API autenticada). OBRIGATÃ“RIO: o IP de datacenter da
 *     VPS Ã© bloqueado (403) nos endpoints pÃºblicos www.reddit.com/.json.
 *   - Sem OAuth: detecta o bloqueio e avisa o admin no Telegram com instruÃ§Ãµes
 *     (criar app script gratuito em reddit.com/prefs/apps).
 *
 * Anti-spam / anti-ban:
 *   - limite de aÃ§Ãµes por rodada (REDDIT_MAX_POR_RODADA, default 3);
 *   - estado em data/prospeccao_reddit.json (nunca repete post);
 *   - sÃ³ subreddits da lista branca (evita comunidades que banem promoÃ§Ã£o);
 *   - comentÃ¡rio sempre > 40 palavras e com conteÃºdo educativo real;
 *   - CTA do bot apenas no 2Âº contato (resposta ao nosso comentÃ¡rio).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const canais = require('../canais');
const ia = require('../ia');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ESTADO = path.join(DATA_DIR, 'prospeccao_reddit.json');

const BOT_USERNAME = 'btcweatherpanel_bot';
const PRODUTO = 'btcweather';

const USER_AGENT = 'severino-ecosystem/1.0 (prospeccao educativa em crypto; contato: suporte@btcweatherpanel.com)';

// Subreddits de nicho onde dÃ¡ pra agregar valor sem ser spam.
// Prioridade: comunidades BR de cripto/investimento.
const SUBREDDITS = [
  'investimentos',
  'criptomoedasbr',
  'BitcoinBrasil',
  'bitcoin',
  'CryptoMarkets'
];

const MAX_POR_RODADA = parseInt(process.env.REDDIT_MAX_POR_RODADA || '3', 10);
const LIMITE_POSTS = parseInt(process.env.REDDIT_LIMITE_POSTS || '25', 10);
const JANELA_MIN = 2 * 60; // posts publicados nos Ãºltimos 2h

// Palavras-chave que indicam "dÃ¡ pra ajudar": o post Ã© uma pergunta sobre BTC.
const SINAIS_INTERESSE = [
  'bitcoin', 'btc', 'cripto', 'entrar', 'comprar', 'investir', 'carteira',
  'quando comprar', 'vender', 'prÃ©via', 'previsÃ£o', 'preco', 'preÃ§o',
  'taxa', 'rendimento', 'bear', 'bull', 'merca', 'queda', 'alta'
];

// Frases proibidas de detectar em posts (evita comentar em briga/flood).
const BLOQUEIO = [
  'scam', 'golpe', 'perdi tudo', 'furada', 'melhor nÃ£o', 'caiu', 'rug pull',
  'preciso de ajuda urgente', 'me ajudem a recuperar'
];

const OAUTH_OK =
  process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET &&
  process.env.REDDIT_USERNAME && process.env.REDDIT_PASSWORD;

// ========== util ==========
function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return { comentados: {}, ultimaRodada: null };
  }
}

function salvarEstado(e) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
  fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2));
}

// LÃª JSON do Reddit. Com OAuth usa oauth.reddit.com (API autenticada, nÃ£o
// sujeita ao block de IP de datacenter dos endpoints pÃºblicos). Sem OAuth usa
// www.reddit.com/.json; se 403, detecta que o IP foi bloqueado.
async function getJson(url, token) {
  const headers = { 'User-Agent': USER_AGENT };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 403) throw new Error('IP_BLOQUEADO');
  if (!res.ok) throw new Error(`reddit ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

// OAuth do Reddit: obtÃ©m token de app para comentar.
async function obterOAuthToken() {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
      ).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD
    })
  });
  const d = await res.json();
  if (!d.access_token) throw new Error(`oauth falhou: ${JSON.stringify(d).slice(0, 120)}`);
  return d.access_token;
}

// Publica comentÃ¡rio via API OAuth.
async function comentarReddit(token, postId, texto) {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      Authorization: `Bearer ${token}`
    },
    body: new URLSearchParams({
      api_type: 'json',
      thing_id: postId, // ex: t3_abc
      text: texto
    })
  });
  const d = await res.json();
  const err = d.json && d.json.errors && d.json.errors.length ? d.json.errors : null;
  if (err) throw new Error(`reddit comentario: ${JSON.stringify(err).slice(0, 150)}`);
  return d.json;
}

// Gera o comentÃ¡rio com valor via LLM (fallback: template educativo).
async function gerarComentario(post) {
  const sistema =
    'VocÃª Ã© o Prospector Reddit. Escreva UM comentÃ¡rio Ãºtil e educativo respondendo a ' +
    'uma dÃºvida sobre Bitcoin/cripto/investimento. Regras: valor real primeiro (dados, ' +
    'contexto, prÃ³/contra), tom respeitoso, SEM link, SEM promoÃ§Ã£o, SEM promessa de lucro, ' +
    '40-80 palavras, em pt-BR. Termine com uma pergunta aberta leve (ex: "vocÃª estÃ¡ ' +
    'acompanhando o que?").';
  try {
    const r = await ia.perguntar({
      agente: 'prospector_reddit',
      modelo: 'barato',
      sistema,
      mensagens: [{
        role: 'user',
        content: `TÃ­tulo do post: ${post.titulo}\nTexto (resumo): ${(post.texto || '').slice(0, 500)}`
      }],
      temperatura: 0.7
    });
    return r.texto.trim();
  } catch (e) {
    // Fallback determinÃ­stico sem LLM (conta zerada / orÃ§amento).
    return (
      `Ã“tima pergunta! Sobre ${post.titulo.slice(0, 60)}: o importante Ã© separar tendÃªncia ` +
      `(direÃ§Ã£o de mÃ©dio prazo) de timing (melhor momento de entrada). DÃ¡ pra acompanhar ` +
      `indicadores simples de tendÃªncia e sentimento (tipo Fear & Greed e volume) em vez de ` +
      `tentar adivinhar o topo ou fundo exato. O que vocÃª jÃ¡ estÃ¡ acompanhando?`
    );
  }
}

function ehOportunidade(post, estado) {
  const id = post.id;
  if (estado.comentados[id]) return false;
  const t = `${post.titulo} ${post.texto || ''}`.toLowerCase();
  if (!SINAIS_INTERESSE.some(s => t.includes(s))) return false;
  if (BLOQUEIO.some(b => t.includes(b))) return false;
  return true;
}

// ========== fluxo ==========
async function processar(evento, ctx) {
  if (evento.tipo !== 'tick.prospeccao_reddit') {
    return { agente: 'prospector_reddit', acao: 'tipo nÃ£o tratado', novosEventos: [] };
  }

  const estado = lerEstado();
  const feitos = [];
  const falhas = [];
  let ipBloqueado = false;

  try {
    // Com OAuth: uma Ãºnica sessÃ£o para ler e comentar via API autenticada.
    let token = null;
    if (OAUTH_OK) {
      try {
        token = await obterOAuthToken();
      } catch (e) {
        falhas.push(`oauth:${e.message}`);
      }
    }

    for (const sub of SUBREDDITS) {
      let data;
      try {
        if (token) {
          data = await getJson(`https://oauth.reddit.com/r/${sub}/new?limit=${LIMITE_POSTS}&raw_json=1`, token);
        } else {
          data = await getJson(`https://www.reddit.com/r/${sub}/new.json?limit=${LIMITE_POSTS}`);
        }
      } catch (e) {
        if (e.message === 'IP_BLOQUEADO') {
          ipBloqueado = true;
        } else {
          falhas.push(`${sub}:${e.message}`);
        }
        continue;
      }
      const posts = ((data.data && data.data.children) || [])
        .map(c => c.data)
        .filter(p => p && p.id && !p.stickied)
        .filter(p => {
          const ts = (p.created_utc || 0) * 1000;
          return Date.now() - ts <= JANELA_MIN * 60000;
        })
        .filter(p => ehOportunidade(p, estado));

      for (const post of posts.slice(0, MAX_POR_RODADA)) {
        if (feitos.length >= MAX_POR_RODADA) break;
        const id = post.id;
        const texto = await gerarComentario({
          titulo: post.title,
          texto: (post.selftext || '').slice(0, 500)
        });

        let acao = 'assistente (colar manual)';
        if (token) {
          try {
            const r = await comentarReddit(token, 't3_' + id, texto);
            const ok = !!(r && r.data && r.data.things && r.data.things.length);
            acao = ok ? 'comentado automatico' : 'falhou postar';
          } catch (e) {
            falhas.push(`${id}:${e.message}`);
            acao = 'assistente (oauth falhou)';
          }
        }

        estado.comentados[id] = {
          ts: new Date().toISOString(),
          subreddit: sub,
          titulo: post.title,
          modo: acao,
          texto
        };
        feitos.push({ id, sub, acao, texto });

        if (acao === 'assistente (colar manual)' || acao === 'assistente (oauth falhou)') {
          await canais.enviarAdmin(
            `ðŸ¤– Reddit: post pra comentar (colar manual)\n\n` +
            `r/${sub} â€” "${post.title.slice(0, 80)}"\nðŸ”— ${post.url}\n\n` +
            `ðŸ’¬ ComentÃ¡rio pronto:\n${texto}`
          );
        }
        await new Promise(res => setTimeout(res, 1500)); // respeita rate limit
      }
    }

    estado.ultimaRodada = new Date().toISOString();
    salvarEstado(estado);

    if (feitos.length) {
      const linhas = feitos.map(f => `â€¢ r/${f.sub} â€” ${f.id} (${f.acao})`).join('\n');
      await canais.enviarAdmin(`ðŸ¤– Prospector Reddit: ${feitos.length} oportunidade(s)!\n\n${linhas}`);
    }
    if (falhas.length) {
      await canais.enviarAdmin(`ðŸ¤– Prospector Reddit: ${falhas.length} falha(s) â€” ${falhas.slice(0, 3).join(' | ')}`);
    }
    if (ipBloqueado) {
      await canais.enviarAdmin(
        `ðŸš« Prospector Reddit: o IP desta VPS foi bloqueado pela API pÃºblica do Reddit (403 blocked). ` +
        `Sem OAuth ele nÃ£o consegue nem ler os posts. Para destravar, crie um app script gratuito em ` +
        `https://www.reddit.com/prefs/apps e preencha no .env: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, ` +
        `REDDIT_USERNAME, REDDIT_PASSWORD. AÃ­ o agente passa a ler e comentar via API autenticada.`
      );
    }

    return {
      agente: 'prospector_reddit',
      acao: `feitos=${feitos.length} falhas=${falhas.length} oauth=${OAUTH_OK ? 'on' : 'off'} bloqueado=${ipBloqueado}`,
      novosEventos: []
    };
  } catch (e) {
    const msg = String(e.message || e);
    await canais.enviarAdmin(`ðŸ¤– Prospector Reddit: erro â€” ${msg.slice(0, 200)}`);
    return { agente: 'prospector_reddit', acao: `erro: ${msg.slice(0, 200)}`, novosEventos: [] };
  }
}

module.exports = { processar, OAUTH_OK };
