/**
 * 🚀 Onboarder — entrega o acesso ao produto lendo a configuração de
 * ativação de produtos.json (independente do produto). Tipos:
 *  - trial: chama o endpoint e monta o link com o código
 *  - link: só entrega o link de acesso
 */
const funil = require('../funil');
const canais = require('../canais');
const produtos = require('../produtos.json');

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const leadId = p.leadId || evento.id;
  const nome = p.nome || 'cliente';
  const produto = evento.produto || p.produto || process.env.ECOSYSTEM_PRODUTO_PADRAO || 'btcweather';
  const telegramId = p.telegramId || null;

  const info = produtos[produto];
  const ativacao = info && info.ativacao;
  if (!info || !ativacao) {
    return { agente: 'onboarder', acao: `produto '${produto}' sem ativação configurada`, novosEventos: [] };
  }

  // Compra direta (lead que já usou o trial): o Conversor já enviou o link do
  // checkout — não ativa novo trial nem envia outra mensagem.
  if (p.compraDireta) {
    funil.upsertLead({ leadId, status: 'checkout', produto });
    return { agente: 'onboarder', acao: 'checkout direto (link já enviado pelo conversor)', novosEventos: [] };
  }

  let code = null;
  let link = null;
  let mensagem = null;
  try {
    if (ativacao.tipo === 'trial') {
      const resp = await fetch(ativacao.endpoint, { method: 'POST', headers: { 'x-ecosystem': '1' } });
      const data = await resp.json();
      if (data && data.ok && data.code) code = data.code;
      link = ativacao.linkTemplate.replace('{code}', code || '');
    } else if (ativacao.tipo === 'link') {
      link = ativacao.link;
    }
    mensagem = (ativacao.mensagem || '')
      .replace('{nome}', nome)
      .replace('{code}', code || '')
      .replace('{link}', link || '');
  } catch {}

  if (!link) {
    return { agente: 'onboarder', acao: 'ativação falhou (sem link)', novosEventos: [] };
  }

  if (telegramId) await canais.enviarTelegram(telegramId, mensagem);
  await canais.enviarAdmin(`🛰️ Novo acesso pelo ecossistema: ${nome} — ${info.nome}${code ? ' — ' + code : ''}`);

  funil.upsertLead({ leadId, status: 'trial', trialCode: code || null, produto });

  return {
    agente: 'onboarder',
    acao: code ? `ativado ${code}` : 'acesso enviado',
    novosEventos: [{
      tipo: 'trial.ativado',
      produto,
      payload: { leadId, nome, telegramId, produto, code: code || null }
    }]
  };
}

module.exports = { processar };
