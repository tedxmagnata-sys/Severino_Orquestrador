/**
 * 🛡️ Guardião do ecossistema — ética + segurança de saída.
 * Fase 1: filtra textos dos agentes antes de enviar ao cliente.
 * Fase posterior: também monitora custo de LLM (hoje em ia.js).
 */
const BLOQUEADAS = [
  /\blucro garantido\b/i,
  /\bretorno garantido\b/i,
  /\bganhos certos\b/i,
  /\bdinheiro fácil\b/i,
  /\bmultiplique\b.*\brapidamente\b/i
];

const LIMITE_CHARS = 1500;

function aprovar(texto) {
  let t = String(texto || '').trim().slice(0, LIMITE_CHARS);
  for (const rx of BLOQUEADAS) {
    if (rx.test(t)) t = t.replace(rx, 'resultados com responsabilidade');
  }
  if (!t.length) t = 'Mensagem não disponível no momento.';
  return { ok: true, texto: t };
}

module.exports = { aprovar };
