/**
 * Guardião do LeadBook Engine — filtra entradas e saídas
 * Bloqueia temas de conteúdo sexual explícito, violência gráfica, ódio,
 * promoção de autodestruição ou exploração.
 */
const BLOQUEADOS = [
  'conteudo adulto', 'adulto', 'sexual', 'pornografia', 'nudez',
  'nude', 'explícito', 'erótico', 'violência gráfica', 'gore',
  'ódio', 'hate', 'discriminação racial', 'racismo', 'autodestruição',
  'suicídio', 'automutilação', 'exploração infantil', 'pedofilia',
  'narcóticos', 'droga ilegal', 'arma de fogo ilegal', 'fraude',
  'golpe', 'esquema ponzi', 'pirâmide', 'enganoso'
];

function normalizar(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function motivoBloqueio(texto) {
  const t = normalizar(texto);
  for (const b of BLOQUEADOS) {
    if (t.includes(normalizar(b))) return b;
  }
  return null;
}

function validarEntrada({ tema, publico, objetivo }) {
  const campos = { tema, publico, objetivo };
  const falhas = [];
  for (const [k, v] of Object.entries(campos)) {
    if (!v || String(v).trim().length < 3) falhas.push(`campo '${k}' precisa de pelo menos 3 caracteres`);
    if (String(v || '').length > 2000) falhas.push(`campo '${k}' muito longo`);
  }
  if (falhas.length) return { ok: false, erro: falhas.join('; ') };
  const bloco = motivoBloqueio([tema, publico, objetivo].join(' '));
  if (bloco) return { ok: false, erro: `Conteúdo bloqueado pelo Guardião (termo: ${bloco}). Este gerador não produz material que vá contra os princípios de cuidado e respeito.` };
  return { ok: true };
}

module.exports = { validarEntrada, motivoBloqueio, BLOQUEADOS };
