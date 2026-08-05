/**
 * 📊 Analista — gera relatório do funil com KPIs reais (evento: gerar.relatorio):
 * leads por estágio, trials/vip, vendas, receita, reembolsos e custo LLM do dia.
 */
const funil = require('../funil');
const ia = require('../ia');

async function processar(evento, ctx) {
  const d = funil.load();
  const leads = Object.values(d.leads || {});
  const compras = d.compras || [];
  const reembolsos = d.reembolsos || [];

  const porStatus = {};
  leads.forEach((l) => {
    porStatus[l.status] = (porStatus[l.status] || 0) + 1;
  });

  const trials = leads.filter((l) => l.status === 'trial' || l.status === 'vip').length;
  const pagos = leads.filter((l) => l.status === 'pago').length;
  const receita = compras.reduce((s, c) => s + (Number(c.value) || 0), 0);

  let orc = { dia: null, tokens: 0, chamadas: 0, custoUsd: 0 };
  try {
    orc = ia.lerOrcamento();
  } catch {}

  const resumo =
    `Leads: ${leads.length} (estágios ${JSON.stringify(porStatus)}) | ` +
    `trials/vip: ${trials} | pagos: ${pagos} | ` +
    `compras: ${compras.length} (R$${receita.toFixed(2)}) | reembolsos: ${reembolsos.length} | ` +
    `custo LLM: ${orc.chamadas} chamadas / ${orc.tokens} tokens (US$${(orc.custoUsd || 0).toFixed(4)})`;

  return {
    agente: 'analista',
    acao: resumo,
    novosEventos: [{
      tipo: 'relatorio.diario',
      payload: {
        resumo,
        leads: leads.length,
        trials,
        pagos,
        compras: compras.length,
        receita,
        reembolsos: reembolsos.length,
        custoUsd: orc.custoUsd || 0,
        tokens: orc.tokens,
        chamadas: orc.chamadas
      }
    }]
  };
}

module.exports = { processar };
