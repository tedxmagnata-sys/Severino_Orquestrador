/**
 * 🔁 Retentor — pós-venda e retenção.
 * - trial.ativado: marca o lead VIP e agenda o caminho pro plano pago.
 * - tick.followups: envia check-in (dia 3) e upsell (dia 7) com o checkout.
 * - venda.confirmada: lead que pagou sai da fila de upsell.
 */
const funil = require('../funil');
const canais = require('../canais');
const produtos = require('../produtos.json');

const CHECKIN_DIAS = 3;
const UPSELL_DIAS = 7;

function etapaDoDia(dias) {
  if (dias >= UPSELL_DIAS) return 'upsell';
  if (dias >= CHECKIN_DIAS) return 'checkin';
  return null;
}

async function enviarFollowup(lead, etapa) {
  const info = produtos[lead.produto] || produtos.btcweather;
  const nome = lead.nome || '';
  if (etapa === 'checkin') {
    const msg = `Oi ${nome}! Vi que você está aproveitando o ${info.nome} há uns dias. Está curtindo os sinais? Qualquer dúvida é só me chamar 🙂`;
    await canais.enviarTelegram(lead.telegramId, msg);
  } else {
    const checkout = (info && info.checkoutUrl) || 'https://pay.kiwify.com.br/ffphj4e';
    const valor = (info && info.plano && info.plano.valor) || 'R$47';
    const msg = `Oi ${nome}! Seu teste gratuito está chegando ao fim. Quer continuar recebendo os sinais diários? O plano é ${valor}/mês e você garante agora aqui: ${checkout} 😉`;
    await canais.enviarTelegram(lead.telegramId, msg);
  }
  funil.upsertLead({ leadId: lead.leadId, ultimaFollowup: etapa, ultimoFollowupEm: new Date().toISOString() });
}

async function processar(evento, ctx) {
  const p = evento.payload || {};

  if (evento.tipo === 'trial.ativado') {
    const leadId = p.leadId || evento.id;
    const produto = evento.produto || p.produto || 'btcweather';
    const info = produtos[produto] || produtos.btcweather;
    const trialDias = (info && info.plano && info.plano.trialDias) || 7;
    funil.upsertLead({ leadId, status: 'vip', trialCode: p.code || null, trialDias, retentorInicio: new Date().toISOString() });
    return { agente: 'retentor', acao: 'pós-trial registrado', novosEventos: [] };
  }

  if (evento.tipo === 'venda.confirmada') {
    const email = (p.customer_email || '').toLowerCase();
    if (email) {
      const lead = funil.listLeads().find(l => l.email && String(l.email).toLowerCase() === email);
      if (lead && lead.leadId) {
        funil.upsertLead({ leadId: lead.leadId, status: 'pago', vipPago: true, comprouEm: new Date().toISOString() });
      }
    }
    return { agente: 'retentor', acao: 'comprador marcado como pago', novosEventos: [] };
  }

  if (evento.tipo === 'tick.followups') {
    const leads = funil.listLeads().filter(l => l.status === 'vip' && l.retentorInicio && l.telegramId);
    const acoes = [];
    for (const lead of leads) {
      const dias = (Date.now() - new Date(lead.retentorInicio).getTime()) / 86400000;
      const etapa = etapaDoDia(dias);
      if (!etapa || lead.ultimaFollowup === etapa) continue;
      try {
        await enviarFollowup(lead, etapa);
        acoes.push(`${lead.leadId}:${etapa}`);
      } catch (e) {
        acoes.push(`${lead.leadId}:erro(${e.message})`);
      }
    }
    return { agente: 'retentor', acao: acoes.length ? 'followups: ' + acoes.join(', ') : 'nada vencido', novosEventos: [] };
  }

  return { agente: 'retentor', acao: 'tipo não tratado', novosEventos: [] };
}

module.exports = { processar };
