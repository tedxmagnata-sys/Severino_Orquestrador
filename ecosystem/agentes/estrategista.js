/**
 * 🧠 Estrategista — lê o relatório (LLM), propõe a próxima campanha e
 * registra em data/campanhas.json (histórico para A/B e revisão mensal).
 */
const fs = require('fs');
const path = require('path');
const ia = require('../ia');
const canais = require('../canais');

const CAMPANHAS = path.join(__dirname, '..', 'data', 'campanhas.json');

function registrarCampanha(sugestao) {
  try {
    const d = fs.existsSync(CAMPANHAS) ? JSON.parse(fs.readFileSync(CAMPANHAS, 'utf8')) : [];
    d.push({ ts: new Date().toISOString(), sugestao });
    fs.mkdirSync(path.dirname(CAMPANHAS), { recursive: true });
    fs.writeFileSync(CAMPANHAS, JSON.stringify(d, null, 2));
  } catch {}
}

async function processar(evento, ctx) {
  const p = evento.payload || {};
  let sugestao = 'Focar em converter trials em assinantes pagos.';
  try {
    const r = await ia.perguntar({
      agente: 'estrategista',
      sistema:
        'Você é o Estrategista do ecossistema de vendas. Proponha UMA ação concreta de campanha (máx 80 palavras) baseada nos KPIs do relatório. Se houver reembolsos altos ou custo LLM alto, proponha correção. Sem prometer lucro.',
      mensagens: [{ role: 'user', content: `Relatório: ${p.resumo || 'sem dados'}` }]
    });
    sugestao = r.texto.trim();
  } catch {}

  registrarCampanha(sugestao);
  await canais.enviarAdmin(`🧠 Estrategista: ${sugestao}`);

  return {
    agente: 'estrategista',
    acao: 'campanha proposta',
    novosEventos: [{ tipo: 'campanha.nova', payload: { sugestao } }]
  };
}

module.exports = { processar };
