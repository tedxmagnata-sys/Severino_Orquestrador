/**
 * 🔍 Qualificador — pontua o lead (1-5), escolhe o produto pelo contexto e
 * cuida do cross-sell (lead que já é cliente de um produto pode receber outro).
 * A escolha do LLM é VALIDADA contra produtos.json — produto inválido cai no padrão.
 */
const ia = require('../ia');
const funil = require('../funil');
const produtos = require('../produtos.json');

const DEFAULT = process.env.ECOSYSTEM_PRODUTO_PADRAO || 'btcweather';
const VALIDOS = Object.keys(produtos);
const JA_CLIENTE = ['pago', 'checkout', 'vip', 'trial'];

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const leadId = p.leadId || evento.id;
  const nome = p.nome || 'pessoa';
  const telegramId = p.telegramId || p.chatId || null;
  const contexto = p.contexto || 'sem contexto adicional';
  const origem = evento.origem || 'desconhecida';

  const existente = funil.getLead(leadId);
  const jaCliente = !!(existente && (JA_CLIENTE.includes(existente.status) || existente.trialCode));
  const jaClienteDe = jaCliente ? (existente.produto || '') : '';

  let score = 3;
  let razao = 'avaliado automaticamente';
  let decisao = evento.produto || p.produto || DEFAULT;
  let lista = [];

  try {
    const r = await ia.perguntar({
      agente: 'qualificador',
      sistema:
        `Você é o Qualificador de vendas do ecossistema da BTC Weather Panel. ` +
        `Produtos disponíveis (escolha APENAS desta lista): ${VALIDOS.join(', ')}. ` +
        `"btcweather" = investidor de cripto querendo sinais de tendência; ` +
        `"severino-consultor-ia" = empreendedor/CLT querendo consultoria IA 24/7. ` +
        (jaCliente ? `ATENÇÃO: este lead JÁ é cliente do produto "${jaClienteDe}". ` +
          `Se o contexto indicar outro interesse, escolha outro produto (cross-sell). ` : '') +
        `Avalie o lead com score 1-5 (5=muito quente). Responda APENAS em JSON: ` +
        `{"score":3,"produto":"btcweather","produtos":["btcweather"],"razao":"curta"}` +
        ` — "produto" é o principal; "produtos" pode listar mais de um candidato.`,
      mensagens: [{ role: 'user', content: `Nome: ${nome}\nOrigem: ${origem}\nContexto: ${contexto}` }]
    });
    const match = (r.texto || '').match(/\{[\s\S]*\}/);
    if (match) {
      const o = JSON.parse(match[0]);
      if (typeof o.score === 'number') score = Math.max(1, Math.min(5, Math.round(o.score)));
      if (o.razao) razao = o.razao;
      if (Array.isArray(o.produtos)) {
        lista = o.produtos.filter(pp => produtos[pp]);
      }
      if (o.produto) {
        if (produtos[o.produto]) {
          decisao = o.produto;
        } else if (lista.length) {
          decisao = lista[0];
        }
      } else if (lista.length) {
        decisao = lista[0];
      }
    }
  } catch {
    const t = (contexto + ' ' + origem).toLowerCase();
    score = t.includes('btc') || t.includes('cripto') || t.includes('consulta') || t.includes('negocio') ? 4 : 3;
  }

  if (!produtos[decisao]) decisao = DEFAULT;
  if (!lista.includes(decisao)) lista = [decisao, ...lista];
  else if (lista[0] !== decisao) lista = [decisao, ...lista.filter(pp => pp !== decisao)];

  funil.upsertLead({ leadId, nome, telegramId, produto: decisao, produtos: lista, score, razao, status: 'qualificado', contexto, origem, crossSell: jaCliente });

  if (score <= 1) {
    return { agente: 'qualificador', acao: `frio (score ${score}) — sem oferta`, novosEventos: [] };
  }

  return {
    agente: 'qualificador',
    acao: `score ${score} -> ${decisao}${lista.length > 1 ? ` (+${lista.length - 1} outro)` : ''}${jaCliente ? ' [cross-sell]' : ''}`,
    novosEventos: [{
      tipo: 'lead.qualificado',
      produto: decisao,
      payload: { leadId, nome, telegramId, score, produto: decisao, produtos: lista, razao }
    }]
  };
}

module.exports = { processar };
