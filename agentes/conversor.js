/**
 * 💬 Conversor — conversa 1:1 (LLM) e oferece:
 *  - lead novo: teste grátis 7 dias + opção de compra direta (checkout)
 *  - lead que já testou: checkout direto (não gera novo trial)
 * O link real do checkout entra no lugar de {CHECKOUT} após a aprovação do Guardião.
 */
const ia = require('../ia');
const funil = require('../funil');
const guardiao = require('../guardiao');
const canais = require('../canais');
const produtos = require('../produtos.json');

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const leadId = p.leadId || evento.id;
  const nome = p.nome || 'trader';
  const produto = evento.produto || p.produto || 'btcweather';
  const telegramId = p.telegramId || null;
  const slug = p.slug || null;
  const info = produtos[produto] || produtos.btcweather;
  const checkoutUrl = (info && info.checkoutUrl) || null;
  const valor = (info && info.plano && info.plano.preco) ? `R$${info.plano.preco}` : '';
  const leadAtual = funil.getLead(leadId);
  const jaTestou = !!(leadAtual && (leadAtual.status === 'vip' || leadAtual.status === 'trial' || leadAtual.trialCode));

  let pitch = null;
  if (jaTestou) {
    try {
      const r = await ia.perguntar({
        agente: 'conversor',
        sistema:
          `Você é o Conversor de vendas. O lead JÁ USOU o teste grátis de 7 dias do ${info.nome}. ` +
          (checkoutUrl
            ? `Escreva UMA mensagem curta (máx 80 palavras) oferecendo a compra direta do plano (${valor}/mês) com o link {CHECKOUT}. Tom leve, honesto, sem pressão.`
            : `Escreva UMA mensagem curta (máx 80 palavras) dizendo que o teste já foi usado e se ele quiser continuar, é só me chamar.`),
        mensagens: [{ role: 'user', content: `Lead: ${nome}` }]
      });
      pitch = r.texto.trim();
    } catch {}
    if (!pitch) {
      pitch = checkoutUrl
        ? `Oi ${nome}! Seu teste grátis já foi usado — mas você pode garantir o acesso ao ${info.nome} por ${valor}/mês: {CHECKOUT}`
        : `Oi ${nome}! Seu teste grátis já foi usado. Se quiser continuar, é só me chamar!`;
    }
  } else {
    try {
      const r = await ia.perguntar({
        agente: 'conversor',
        sistema:
          `Você é o Conversor de vendas. Escreva UMA mensagem curta (máx 90 palavras) oferecendo o teste grátis de 7 dias do ${info.nome}. ` +
          (checkoutUrl ? `Mencione também que ele pode comprar direto (${valor}/mês) no link {CHECKOUT}. ` : '') +
          `Diferenciais: ${info.argumentos.join('; ')}. Tom leve e honesto.`,
        mensagens: [{ role: 'user', content: `Lead: ${nome}` }]
      });
      pitch = r.texto.trim();
    } catch {}
    if (!pitch) {
      pitch = `Oi ${nome}! Vi seu interesse no ${info.nome}. Que tal testar 7 dias grátis, sem cartão e sem compromisso? ` +
        (checkoutUrl ? `Ou, se preferir, já garanta o acesso por ${valor}/mês: {CHECKOUT} ` : '') +
        `Quer que eu ative o teste agora pra você?`;
    }
  }

  const texto = guardiao.aprovar(pitch.split('{CHECKOUT}').join(checkoutUrl || '')).texto;
  if (telegramId) await canais.enviarTelegram(telegramId, texto);
  funil.upsertLead({ leadId, status: jaTestou ? 'checkout' : 'proposta', oferta: texto });

  return {
    agente: 'conversor',
    acao: jaTestou ? 'checkout direto ofertado' : 'oferta (trial+compra) enviada',
    novosEventos: [{
      tipo: 'venda.proposta',
      produto,
      payload: { leadId, nome, telegramId, produto, aceito: true, compraDireta: !!jaTestou, slug }
    }]
  };
}

module.exports = { processar };
