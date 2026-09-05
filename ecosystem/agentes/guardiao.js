/**
 * 🛡️ Agente Guardião — tick periódico de verificação de saldos.
 * Posta um resumo + alertas de degrau (50%→cada 3% abaixo) no Telegram.
 */
const guardiao = require('../guardiao_saldo');

async function processar(evento, ctx) {
  if (evento.tipo === 'tick.saldo') {
    const avisarResumo = !!(evento.payload && evento.payload.resumo);
    const saldos = await guardiao.vigiar({ avisarResumo });
    const linhas = Object.entries(saldos)
      .map(([p, s]) => `${p}: ${s === null ? 'não verificado' : 'US$' + s.toFixed(2)}`)
      .join(', ');
    return { agente: 'guardiao', acao: 'saldos verificados: ' + linhas, novosEventos: [] };
  }
  if (evento.tipo === 'saldo.resumo') {
    await guardiao.vigiar({ avisarResumo: true });
    return { agente: 'guardiao', acao: 'resumo enviado', novosEventos: [] };
  }
  return { agente: 'guardiao', acao: 'tipo não tratado', novosEventos: [] };
}

module.exports = { processar };