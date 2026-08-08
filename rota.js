/**
 * 🧭 Rota de eventos → agente responsável (Fase 1: agentes LLM reais).
 */
const agentes = {
  qualificador: require('./agentes/qualificador'),
  nutridor: require('./agentes/nutridor'),
  conversor: require('./agentes/conversor'),
  onboarder: require('./agentes/onboarder'),
  retentor: require('./agentes/retentor'),
  cobrador: require('./agentes/cobrador'),
  analista: require('./agentes/analista'),
  estrategista: require('./agentes/estrategista'),
  videasta: require('./agentes/videasta'),
  observador: require('./agentes/observador'),
  captador: require('./agentes/captador')
};

const AGENTES = {
  'lead.novo': 'qualificador',
  'lead.qualificado': 'nutridor',
  'lead.quente': 'conversor',
  'venda.proposta': 'onboarder',
  'trial.ativado': 'retentor',
  'venda.confirmada': 'cobrador',
  'reembolso.pedido': 'cobrador',
  'tick.renovacao': 'cobrador',
  'tick.followups': 'retentor',
  'tick.captura': 'captador',
  'gerar.relatorio': 'analista',
  'relatorio.diario': 'estrategista',
  'campanha.nova': 'videasta',
  'tick.conteudo': 'videasta',
  'conteudo.pronto': 'observador'
};

function agenteDo(tipo) {
  return AGENTES[tipo] || 'observador';
}

async function processar(evento, ctx) {
  const nome = agenteDo(evento.tipo);
  if (!agentes[nome]) {
    return { agente: nome, acao: 'rastreado', novosEventos: [] };
  }
  return agentes[nome].processar(evento, ctx);
}

module.exports = { agenteDo, processar };
