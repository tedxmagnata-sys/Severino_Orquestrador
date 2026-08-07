/**
 * 🔁 Retentor — pós-venda e retenção.
 * - trial.ativado: marca o lead VIP e agenda o caminho pro plano pago.
 * - tick.followups: envia check-in (dia 3) e upsell (dia 7) com o checkout.
 * - venda.confirmada: lead que pagou sai da fila de upsell.
 * - Reativação: trial expirado (> 7 dias) sem pagamento recebe UMA mensagem de
 *   recuperação com o checkout; depois é marcado como 'expirado' (sem spam).
 */
const funil = require('../funil');
const canais = require('../canais');
const produtos = require('../produtos.json');

const CHECKIN_DIAS = 3;
const UPSELL_DIAS = 7;
const REATIVACAO_DIAS = 8;

// Resolve telegramId de um lead pelo código de licença (notifications.json
// guarda o vínculo chatId -> licenseCode feito via /vincular ou /resgatar).
function telegramDoTrialCode(code) {
  if (!code) return null;
  try {
    const fs = require('fs');
    const path = require('path');
    const nf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'notifications.json'), 'utf8'));
    for (const [chatId, u] of Object.entries(nf)) {
      if (u && u.licenseCode === code) return chatId;
    }
  } catch {}
  return null;
}

function etapaDoDia(dias) {
  if (dias >= UPSELL_DIAS) return 'upsell';
  if (dias >= CHECKIN_DIAS) return 'checkin';
  return null;
}

async function enviarFollowup(lead, etapa) {
  const info = produtos[lead.produto] || produtos.btcweather;
  const nome = lead.nome || '';
  let ok = false;
  if (etapa === 'checkin') {
    const msg = `Oi ${nome}! Vi que você está aproveitando o ${info.nome} há uns dias. Está curtindo os sinais? Qualquer dúvida é só me chamar 🙂`;
    ok = await canais.enviarTelegram(lead.telegramId, msg);
  } else {
    const checkout = (info && info.checkoutUrl) || 'https://pay.kiwify.com.br/ffphj4e';
    const valor = (info && info.plano && info.plano.valor) || 'R$47';
    const msg = `Oi ${nome}! Seu teste gratuito está chegando ao fim. Quer continuar recebendo os sinais diários? O plano é ${valor}/mês e você garante agora aqui: ${checkout} 😉`;
    ok = await canais.enviarTelegram(lead.telegramId, msg);
  }
  if (ok) {
    funil.upsertLead({ leadId: lead.leadId, ultimaFollowup: etapa, ultimoFollowupEm: new Date().toISOString() });
  }
  return ok;
}

async function processar(evento, ctx) {
  const p = evento.payload || {};

  if (evento.tipo === 'trial.ativado') {
    const leadId = p.leadId || evento.id;
    const produto = evento.produto || p.produto || 'btcweather';
    const info = produtos[produto] || produtos.btcweather;
    const trialDias = (info && info.plano && info.plano.trialDias) || 7;
    const telegramId = p.telegramId || null;
    funil.upsertLead({
      leadId, status: 'vip', trialCode: p.code || null, trialDias,
      nome: p.nome || null,
      email: p.email || null,
      telegramId,
      retentorInicio: new Date().toISOString()
    });
    return { agente: 'retentor', acao: 'pós-trial registrado', novosEventos: [] };
  }

  if (evento.tipo === 'venda.confirmada') {
    const email = (p.customer_email || '').toLowerCase();
    const code = p.code || null;
    let lead = null;
    if (email) {
      lead = funil.listLeads().find(l => l.email && String(l.email).toLowerCase() === email);
    }
    if (!lead && code) {
      // Comprador que veio do trial (leadId lic-CODIGO) — casa pelo trialCode
      lead = funil.listLeads().find(l => l.trialCode === code || l.leadId === 'lic-' + code);
    }
    if (lead && lead.leadId) {
      funil.upsertLead({ leadId: lead.leadId, status: 'pago', vipPago: true, comprouEm: new Date().toISOString() });
      return { agente: 'retentor', acao: 'comprador marcado como pago', novosEventos: [] };
    }
    return { agente: 'retentor', acao: 'venda sem lead no funil (rastreio por código/email)', novosEventos: [] };
  }

  if (evento.tipo === 'tick.followups') {
    const leads = funil.listLeads().filter(l => (l.status === 'vip' || l.status === 'expirado') && l.retentorInicio);
    const acoes = [];
    for (const lead of leads) {
      // Resolve telegramId tardio: lead do site que vinculou o código no bot depois
      const telegramId = lead.telegramId || telegramDoTrialCode(lead.trialCode);
      if (!telegramId) continue;
      if (telegramId !== lead.telegramId) funil.upsertLead({ leadId: lead.leadId, telegramId });
      const dias = (Date.now() - new Date(lead.retentorInicio).getTime()) / 86400000;

      // Reativação: trial venceu e não pagou → UMA mensagem de recuperação
      if (dias >= REATIVACAO_DIAS && lead.status === 'vip' && !lead.reativado) {
        const info = produtos[lead.produto] || produtos.btcweather;
        const checkout = (info && info.checkoutUrl) || 'https://pay.kiwify.com.br/ffphj4e';
        const valor = (info && info.plano && info.plano.valor) || 'R$47';
        const msg = `Oi ${lead.nome || ''}! Seu teste gratuito terminou 😉 Se gostou dos sinais, dá pra continuar por ${valor}/mês: ${checkout} Ainda dá tempo de pegar o valor promocional de lançamento.`;
        try {
          const ok = await canais.enviarTelegram(telegramId, msg);
          if (ok) funil.upsertLead({ leadId: lead.leadId, status: 'expirado', reativado: true, reativadoEm: new Date().toISOString() });
          acoes.push(`${lead.leadId}:reativacao${ok ? '' : '(falhou envio)'}`);
        } catch (e) {
          acoes.push(`${lead.leadId}:erro(${e.message})`);
        }
        continue;
      }

      const etapa = etapaDoDia(dias);
      if (!etapa || lead.ultimaFollowup === etapa) continue;
      try {
        const ok = await enviarFollowup({ ...lead, telegramId }, etapa);
        acoes.push(`${lead.leadId}:${etapa}${ok ? '' : '(falhou envio)'}`);
      } catch (e) {
        acoes.push(`${lead.leadId}:erro(${e.message})`);
      }
    }
    return { agente: 'retentor', acao: acoes.length ? 'followups: ' + acoes.join(', ') : 'nada vencido', novosEventos: [] };
  }

  return { agente: 'retentor', acao: 'tipo não tratado', novosEventos: [] };
}

module.exports = { processar };
