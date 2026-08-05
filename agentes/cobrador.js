/**
 * 💰 Cobrador — registra vendas confirmadas (webhook Kiwify), reembolsos,
 * avisos de vencimento/renovação da assinatura e garante o reembolso.
 */
const fs = require('fs');
const path = require('path');
const funil = require('../funil');
const canais = require('../canais');
const produtos = require('../produtos.json');

const AVISO_DIAS = 2;      // avisa X dias antes do vencimento
const VENCIDO_DIAS = 2;    // checa Y dias após o vencimento se renovou
const RENOVACAO_DAYS = 30; // plano mensal

function telegramIdDoEmail(email) {
  try {
    const notifPath = path.join(__dirname, '..', '..', 'data', 'notifications.json');
    if (!fs.existsSync(notifPath)) return null;
    const notifUsers = JSON.parse(fs.readFileSync(notifPath, 'utf8'));
    const buyer = Object.values(notifUsers).find(u => u.email && String(u.email).toLowerCase() === String(email).toLowerCase());
    return (buyer && buyer.telegramId) || null;
  } catch {
    return null;
  }
}

async function vincularPorEmail(payload) {
  const email = (payload.customer_email || '').toLowerCase();
  if (!email) return null;
  const leads = funil.listLeads();
  return leads.find(l => l.email && String(l.email).toLowerCase() === email) || null;
}

async function processar(evento, ctx) {
  const p = evento.payload || {};
  const produto = evento.produto || p.produto || '?';
  const email = p.customer_email || p.email || '';
  const lead = await vincularPorEmail(p);

  if (evento.tipo === 'reembolso.pedido') {
    funil.registrarReembolso({ email, produto, transaction: p.transaction || '', event: p.event || '' });
    if (lead && lead.leadId) {
      funil.upsertLead({ leadId: lead.leadId, status: 'reembolsado', compraAnulada: true, ultimaRenovacaoAviso: null });
    }
    await canais.enviarAdmin(`🔁 Reembolso registrado (cobrador): ${email} — ${produto}`);
    return { agente: 'cobrador', acao: 'reembolso registrado', novosEventos: [] };
  }

  if (evento.tipo === 'venda.confirmada') {
    const leadId = (lead && lead.leadId) || `compra-${p.transactionId || p.transaction || Date.now()}`;
    const telegramId = (lead && lead.telegramId) || telegramIdDoEmail(email) || null;
    const renovacaoEm = new Date(Date.now() + RENOVACAO_DAYS * 86400000).toISOString();
    funil.registrarCompra({
      leadId,
      email,
      produto,
      plan: p.plan || '',
      value: p.value || 0,
      transactionId: p.transactionId || p.transaction || '',
      code: p.code || '',
      gateway: p.gateway || 'kiwify'
    });
    funil.upsertLead({
      leadId,
      status: 'pago',
      email,
      produto,
      nome: p.customer_name || (lead && lead.nome) || '',
      telegramId,
      comprouEm: new Date().toISOString(),
      vipPago: true,
      renovacaoEm,
      ultimaRenovacaoAviso: null
    });

    await canais.enviarAdmin(`💰 Venda confirmada (cobrador): ${email || p.customer_name || '?'} — ${produto}`);
    return { agente: 'cobrador', acao: 'venda registrada', novosEventos: [] };
  }

  if (evento.tipo === 'tick.renovacao') {
    const agora = Date.now();
    const leads = funil.listLeads().filter(l => l.status === 'pago' && l.renovacaoEm && l.telegramId);
    const acoes = [];
    for (const lead of leads) {
      const dias = Math.ceil((new Date(lead.renovacaoEm).getTime() - agora) / 86400000);
      const info = produtos[lead.produto] || produtos.btcweather;
      try {
        if (dias > 0 && dias <= AVISO_DIAS && lead.ultimaRenovacaoAviso !== 'aviso') {
          const quando = new Date(lead.renovacaoEm).toLocaleDateString('pt-BR');
          const msg = `Oi ${lead.nome || 'tudo bem'}! Sua assinatura do ${info.nome} renova automaticamente em ${dias} dia(s) (${quando}). Se quiser cancelar ou tiver qualquer problema, é só me chamar — garantia total, sem perguntas. 🙏`;
          await canais.enviarTelegram(lead.telegramId, msg);
          funil.upsertLead({ leadId: lead.leadId, ultimaRenovacaoAviso: 'aviso' });
          acoes.push(`${lead.leadId}:aviso(${dias}d)`);
        } else if (dias < -VENCIDO_DIAS && lead.ultimaRenovacaoAviso !== 'vencido') {
          const msg = `Oi ${lead.nome || 'tudo bem'}! Seu período renovou ou houve algum problema na cobrança? Se algo estiver errado, me chama que resolvo na hora — garantia total.`;
          await canais.enviarTelegram(lead.telegramId, msg);
          funil.upsertLead({ leadId: lead.leadId, ultimaRenovacaoAviso: 'vencido' });
          acoes.push(`${lead.leadId}:vencido`);
        }
      } catch (e) {
        acoes.push(`${lead.leadId}:erro(${e.message})`);
      }
    }
    return { agente: 'cobrador', acao: acoes.length ? 'renovacao: ' + acoes.join(', ') : 'nada vencido', novosEventos: [] };
  }

  return { agente: 'cobrador', acao: 'tipo não tratado', novosEventos: [] };
}

module.exports = { processar };
