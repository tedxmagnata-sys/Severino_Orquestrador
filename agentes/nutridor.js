/**
 * 🌱 Nutridor — envia mensagem educativa e esquenta o lead para a oferta.
 */
const ia = require('../ia');
const funil = require('../funil');
const guardiao = require('../guardiao');
const canais = require('../canais');
const produtos = require('../produtos.json');

const MENSAGENS_PARA_QUENTE = 1;

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const leadId = p.leadId || evento.id;
  const nome = p.nome || 'trader';
  const produto = evento.produto || p.produto || 'btcweather';
  const telegramId = p.telegramId || null;
  const slug = p.slug || null;
  const info = produtos[produto] || produtos.btcweather;

  const lead = funil.getLead(leadId);
  const nutrido = (lead && lead.nutrido) || 0;

  let texto =
    `Olá ${nome}! Uma dica rápida sobre o ${info.nome}: timing é tudo no mercado. ` +
    `Posso te mostrar como isso funciona de graça por 7 dias. 🙂`;
  try {
    const r = await ia.perguntar({
      agente: 'nutridor',
      sistema:
        `Você é o Nutridor do ecossistema. Escreva UMA mensagem curta e educativa (máx 120 palavras) para um lead do produto ${info.nome}. ` +
        `Diferenciais: ${info.argumentos.join('; ')}. Tom acolhedor, sem prometer lucro.`,
      mensagens: [{ role: 'user', content: `Lead: ${nome}\nMensagens já enviadas: ${nutrido}` }]
    });
    texto = r.texto.trim();
  } catch {}

  const { texto: txt } = guardiao.aprovar(texto);
  if (telegramId) await canais.enviarTelegram(telegramId, txt);

  const novo = nutrido + 1;
  const quente = novo >= MENSAGENS_PARA_QUENTE;
  funil.upsertLead({ leadId, nutrido: novo, status: quente ? 'quente' : 'nutrido', ultimaMensagem: txt });

  if (quente) {
    return {
      agente: 'nutridor',
      acao: `${novo} msgs -> quente`,
      novosEventos: [{
        tipo: 'lead.quente',
        produto,
        payload: { leadId, nome, telegramId, produto, slug }
      }]
    };
  }
  return { agente: 'nutridor', acao: `msg ${novo} enviada`, novosEventos: [] };
}

module.exports = { processar };
