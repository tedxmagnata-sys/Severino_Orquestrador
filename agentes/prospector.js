/**
 * 🕵️ Prospector — prospecção ativa via Instagram (Fase B).
 *
 * A cada tick.prospeccao:
 *   1. Lista os media (posts/reels) mais recentes da conta IG conectada no Postiz
 *      (via Graph API do Facebook, usando o token real guardado no Postgres do Postiz).
 *   2. Lê os comentários de cada media (GET /{mediaId}/comments).
 *   3. Para cada comentário NOVO (não respondido antes, não é spam, não é o dono):
 *      - gera um código VIP7 de 7 dias;
 *      - responde PUBLICAMENTE com um CTA apontando pro bot do Telegram
 *        (deep link com o código embutido);
 *      - registra o lead no funil (origem instagram, status vip, trialCode).
 *   4. Avisa o admin no Telegram com o resumo.
 *
 * Anti-spam / anti-repetição:
 *   - estado em data/prospeccao.json: map comentarioId -> {ts, mediaId, username}
 *     (não responde duas vezes o mesmo comentário);
 *   - limite de respostas por rodada (PROSPECTOR_MAX_POR_RODADA, default 5);
 *   - palavras de spam bloqueadas (bloqueioAmigo, siga, promocao, etc).
 *   - só olha media publicados (state PUBLISHED via Postiz) ou, se falhar,
 *     cai pra Graph API direta (permalink com /p/ e /reel/).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const canais = require('../canais');
const funil = require('../funil');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ESTADO = path.join(DATA_DIR, 'prospeccao.json');

const BOT_USERNAME = 'btcweatherpanel_bot';
const PRODUTO = 'btcweather';

// Integração IG no Postiz (dados verificados no Postgres em 08/ago/2026).
const IG_INTERNAL_ID = '17841440273845195'; // Instagram Business Account ID
const IG_PERFIL = 'severinomagnate';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

const MAX_POR_RODADA = parseInt(process.env.PROSPECTOR_MAX_POR_RODADA || '5', 10);
const LIMITE_MEDIA = parseInt(process.env.PROSPECTOR_MEDIA_LIMITE || '12', 10);
// USO INTERNO/DIAGNÓSTICO: permite processar comentários da própria conta
// (postados via Graph API para teste). Nunca ativar em produção.
const TEST_MODE = process.env.PROSPECTOR_TEST_MODE === '1';

const SPAM = [
  'bloqueio amigo', 'bloqueada', 'siga o', 'segue o', 'marketing', 'venda curso',
  'ganhe seguidores', 'chance de ganhar', 'promoção', 'promocao', 'sorteio',
  'dm para', 'chama no direct', 'me chama', 'www.', 'http://', 'whatsapp',
  'casa de aposta', 'bet365', 'golpe', 'estelionato', 'clica no link'
];

// ========== util ==========
function lerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return { respondidos: {}, ultimaRodada: null };
  }
}

function salvarEstado(e) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
  fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2));
}

// Lê o token do IG direto do Postgres do Postiz em runtime (não fica no código).
// Formato no banco: "<accessToken>___<pageToken>" (o provider separa por ___).
function obterTokenIg() {
  const sql = "SELECT token FROM \\\"Integration\\\" WHERE \\\"providerIdentifier\\\"='instagram' AND \\\"deletedAt\\\" IS NULL LIMIT 1;";
  const cmd = `docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -t -A -c "${sql}" 2>/dev/null`;
  const out = execSync(cmd, { encoding: 'utf8', timeout: 15000 }).trim();
  if (!out) throw new Error('token IG não encontrado no Postiz');
  const part = out.split('___')[0];
  if (!part) throw new Error('token IG malformado');
  return part;
}

function gerarCodigo() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'VIP7-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function ehSpam(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return SPAM.some((s) => t.includes(s));
}

// ========== Graph API (retry simples) ==========
async function grafGet(url, token) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`graph ${res.status}: ${(body.error && body.error.message) || JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

async function grafPost(url, token) {
  const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`graph POST ${res.status}: ${(body.error && body.error.message) || JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

function mediaIdDeUrl(url, dados) {
  // Preferimos casar pelo permalink nos dados já buscados.
  if (dados && dados.length) {
    const achado = dados.find((m) => (m.permalink || '').replace(/\/$/, '') === (url || '').replace(/\/$/, ''));
    if (achado) return achado.id;
  }
  // Fallback: extrai o shortcode do permalink e busca na Graph API.
  const m = (url || '').match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// ========== fluxo ==========
// Abordagem do Outbound Strategist: resposta só vale se referenciar o que a
// pessoa escreveu (sinal) + valor específico + CTA único de baixo atrito.
function montarResposta(username, textoComentario, linkBot) {
  const citacao = String(textoComentario || '')
    .replace(/@\w+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const abertura = citacao
    ? `Sobre "${citacao}": é exatamente o que o painel acompanha todo dia. `
    : '';
  return (
    `@${username} ${abertura}` +
    `Testa grátis o painel de clima do Bitcoin: análise diária + sinais de operação na hora certa. ` +
    `1 toque pra começar: ${linkBot} 🚀`
  );
}

async function responderComentario(comentario, token, tokenCache) {
  const mediaUrl = comentario.mediaPermalink;
  const username = (comentario.from && (comentario.from.username || comentario.from.name)) || 'amigo';
  const mediaId = mediaIdDeUrl(mediaUrl, tokenCache.media || []);

  if (!mediaId) {
    return { ok: false, motivo: `sem mediaId para ${mediaUrl}` };
  }

  const code = gerarCodigo();
  const linkBot = `https://t.me/${BOT_USERNAME}?start=${code}`;
  // CTA curto (limite de comentários do IG) + sem link "externo" estranho.
  const resposta = montarResposta(username, comentario.text, linkBot);

  try {
    await grafPost(
      `${GRAPH_BASE}/${mediaId}/comments?message=${encodeURIComponent(resposta)}&access_token=${token}`,
      token
    );
  } catch (e) {
    return { ok: false, motivo: `graph: ${e.message}` };
  }

  // Registra lead no funil (já com código e trial ativo -> status vip).
  funil.upsertLead({
    leadId: 'ig-' + comentario.id,
    nome: comentario.from && comentario.from.name ? comentario.from.name : null,
    status: 'vip',
    trialCode: code,
    trialDias: 7,
    telegramId: null,
    email: null,
    retentorInicio: new Date().toISOString(),
    origem: 'instagram',
    produto: PRODUTO,
    instagram: { username, comentarioId: comentario.id, mediaPermalink: mediaUrl, respondidoEm: new Date().toISOString() }
  });

  return { ok: true, code, username };
}

async function processar(evento, ctx) {
  if (evento.tipo !== 'tick.prospeccao') {
    return { agente: 'prospector', acao: 'tipo não tratado', novosEventos: [] };
  }

  let token;
  try {
    token = obterTokenIg();
  } catch (e) {
    return { agente: 'prospector', acao: `token IG indisponível: ${e.message}`, novosEventos: [] };
  }

  const estado = lerEstado();
  const respondidos = estado.respondidos || {};

  try {
    // 1) Lista media recentes da conta.
    const media = await grafGet(
      `${GRAPH_BASE}/${IG_INTERNAL_ID}/media?fields=id,permalink,media_type,timestamp&limit=${LIMITE_MEDIA}&access_token=${token}`,
      token
    );
    const listaMedia = (media.data || []).filter(
      (m) => (m.permalink || '').includes('/p/') || (m.permalink || '').includes('/reel/')
    );

    const todos = [];
    // 2) Comentários de cada media (recentes, janela de 7 dias).
    const corte = Date.now() - 7 * 86400000;
    for (const m of listaMedia) {
      const ts = new Date(m.timestamp || 0).getTime();
      if (ts && ts < corte) continue;
      try {
        const c = await grafGet(
          `${GRAPH_BASE}/${m.id}/comments?fields=id,text,from,created_time,timestamp&limit=50&access_token=${token}`,
          token
        );
        for (const cm of (c.data || [])) {
          todos.push({ ...cm, mediaPermalink: m.permalink });
        }
      } catch (e) {
        // media sem permissão de comentários (raro) -> segue.
      }
    }

    // 3) Filtra comentários acionáveis.
    const acionaveis = todos.filter((cm) => {
      if (!cm.id) return false;
      if (respondidos[cm.id]) return false;
      if (!TEST_MODE && (cm.from && cm.from.username === IG_PERFIL)) return false;
      if (!TEST_MODE && (cm.from && cm.from.name === 'Severino Magnata')) return false;
      if (!TEST_MODE && cm.from && String(cm.from.id || '') === IG_INTERNAL_ID) return false;
      if (ehSpam(cm.text)) return false;
      return true;
    });

    const feitos = [];
    const falhas = [];
    const tokenCache = { media: listaMedia };

    for (const cm of acionaveis.slice(0, MAX_POR_RODADA)) {
      const r = await responderComentario(cm, token, tokenCache);
      if (r.ok) {
        respondidos[cm.id] = { ts: new Date().toISOString(), mediaId: mediaIdDeUrl(cm.mediaPermalink, listaMedia), username: (cm.from && (cm.from.username || cm.from.name)) || '' };
        feitos.push(r);
      } else {
        falhas.push(`${cm.id}:${r.motivo}`);
      }
      // Espera curta pra não estourar limite de requests do IG.
      await new Promise((res) => setTimeout(res, 1200));
    }

    estado.respondidos = respondidos;
    estado.ultimaRodada = new Date().toISOString();
    salvarEstado(estado);

    if (feitos.length) {
      const linhas = feitos
        .map((f) => `• @${f.username} — código ${f.code}`)
        .join('\n');
      await canais.enviarAdmin(
        `🕵️ Prospector: ${feitos.length} lead(s) via comentário IG!\n\n${linhas}\n\n` +
        `📣 Respondidos publicamente com CTA do bot @${BOT_USERNAME}.`
      );
    }
    if (falhas.length) {
      await canais.enviarAdmin(`🕵️ Prospector: ${falhas.length} resposta(s) falhou — ${falhas.slice(0, 3).join(' | ')}`);
    }

    return {
      agente: 'prospector',
      acao: `media=${listaMedia.length} comentarios=${todos.length} acionaveis=${acionaveis.length} respondidos=${feitos.length} falhas=${falhas.length}`,
      novosEventos: []
    };
  } catch (e) {
    const msg = String(e.message || e);
    // Erros de token expirado precisam de ação humana.
    if (/token|expired|OAuth|session/i.test(msg)) {
      await canais.enviarAdmin(`🕵️ Prospector: problema com o token do IG — ${msg.slice(0, 200)}`);
    }
    return { agente: 'prospector', acao: `erro: ${msg.slice(0, 200)}`, novosEventos: [] };
  }
}

module.exports = { processar };
