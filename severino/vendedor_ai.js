/**
 * 🤖 VENDEDOR_AI — Treinamento e ativação automática do Vendedor IA
 *
 * 100% autônomo (24/7): após o pagamento confirmado, este módulo:
 *  1. Lê os materiais do cliente (texto de treino + produtos + personalidade)
 *  2. Gera o CONTEXTO do vendedor via LLM (OpenRouter/ia.js)
 *  3. Salva o contexto treinado em data/vendedores/<id>/contexto.txt
 *  4. Marca o vendedor como ativo e entrega o link de acesso
 *
 * Fallback determinístico: se o LLM falhar, gera contexto template com os
 * dados — o fluxo nunca trava aguardando humano.
 */
const fs = require('fs');
const path = require('path');

let ia = null;
try {
  ia = require('./ecosystem/ia');
} catch (e) {
  ia = null;
}

const EXT_TEXTO = ['txt', 'md', 'csv', 'json'];

function pastaVendedor(vendedoresDir, id) {
  return path.join(vendedoresDir, id);
}

// Conteúdo de um arquivo de treino em texto puro (se legível)
function lerArquivoTexto(pasta, arquivo) {
  const ext = String(arquivo.ext || (arquivo.nome || '').split('.').pop() || '').toLowerCase();
  if (!EXT_TEXTO.includes(ext)) return null;
  const caminho = path.join(pasta, arquivo.nome);
  try {
    const buf = fs.readFileSync(caminho);
    const txt = buf.toString('utf8');
    if (txt.includes('\uFFFD')) return null; // binário não legível
    return txt.slice(0, 6000);
  } catch (e) {
    return null;
  }
}

// Monta o "pacote de conhecimento" a partir do cadastro
function montarMateriais(v, vendedoresDir) {
  const treino = v.treino || {};
  const personalidade = v.personalidade || {};
  const partes = [];

  partes.push(`# NEGÓCIO`);
  partes.push(`- Nome: ${v.negocio || '—'}`);
  partes.push(`- Ramo: ${v.ramo || '—'}`);
  partes.push(`- Redes: ${v.redes || '—'}`);

  partes.push(`\n# PRODUTOS`);
  const produtos = Array.isArray(v.produtos) ? v.produtos : [];
  if (produtos.length === 0) partes.push('- (não informados)');
  produtos.forEach((p, i) => {
    partes.push(`- [${i + 1}] ${p.nome || '—'} | R$ ${p.preco ?? '—'} | ${p.desc || ''}`);
  });

  partes.push(`\n# CONHECIMENTO/TREINO (texto do cliente)`);
  partes.push((treino.texto || '').slice(0, 8000) || '- (sem texto)');

  if (treino.linkRef) {
    partes.push(`\n# REFERÊNCIAS DO CLIENTE`);
    partes.push(String(treino.linkRef));
  }

  // Arquivos de treino legíveis
  const arquivos = Array.isArray(treino.arquivos) ? treino.arquivos : [];
  const legiveis = arquivos
    .map(a => lerArquivoTexto(pastaVendedor(vendedoresDir, v.id), a))
    .filter(Boolean);
  if (legiveis.length > 0) {
    partes.push(`\n# DOCUMENTOS DO CLIENTE`);
    legiveis.forEach((t, i) => partes.push(`\n--- doc ${i + 1} ---\n${t}`));
  }

  partes.push(`\n# PERSONALIDADE DO VENDEDOR`);
  partes.push(`- Nome do bot: ${personalidade.nomeBot || 'Severino'}`);
  partes.push(`- Tom de voz: ${personalidade.tomVoz || 'cordial'}`);
  partes.push(`- Idioma: ${personalidade.idiomaAtend || 'pt'}`);
  partes.push(`- Horário: ${personalidade.horario || '24h'}`);
  partes.push(`- Regras: ${personalidade.regras || 'não informadas'}`);

  return partes.join('\n');
}

// Gera o prompt de sistema do vendedor via LLM; fallback em template
async function gerarContexto(v, vendedoresDir) {
  const materiais = montarMateriais(v, vendedoresDir);
  const nomeBot = (v.personalidade && v.personalidade.nomeBot) || 'Severino';
  const idioma = (v.personalidade && v.personalidade.idiomaAtend) || 'pt';

  // Contexto determinístico de reserva (funciona SEM LLM)
  const contextoBase = `Você é ${nomeBot}, o vendedor IA do negócio "${v.negocio || 'este negócio'}".
Atenda o cliente com cordialidade, domínio total sobre os produtos e materiais abaixo, e sempre conduza para a venda.

== MATERIAIS DE TREINO ==
${materiais}

== REGRAS ==
- Idioma principal: ${idioma}
- Responda com base SOMENTE nos materiais acima; se não souber, diga que vai verificar.
- Objetivo: qualificar o lead, responder dúvidas e fechar a venda.
- Quando o lead quiser comprar, passe as instruções de pagamento e o WhatsApp da loja.
`;

  if (!ia) return contextoBase;

  try {
    const sistema = 'Você é um especialista em criar prompts de vendedores IA para lojas. Gere o prompt de sistema COMPLETO de um vendedor virtual, em primeira pessoa, pronto para usar, cobrindo: apresentação, conhecimento dos produtos, objeções comuns, técnicas de fechamento, tom e idioma do cliente. Sem comentários externos.';
    const res = await ia.perguntar({
      agente: 'treinador-vendedor',
      sistema,
      mensagens: [{ role: 'user', content: materiais }],
      modelo: 'forte',
      temperatura: 0.6
    });
    const gerado = (res.texto || '').trim();
    if (gerado.length > 200) return `== PROMPT GERADO PELA IA ==\n\n${gerado}\n\n== CONTEXTO BASE ==\n\n${contextoBase}`;
    return contextoBase;
  } catch (e) {
    console.log('⚠️ Treinamento IA: LLM indisponível, usando contexto base. (' + e.message + ')');
    return contextoBase;
  }
}

// Treina o vendedor: gera contexto, salva arquivo e retorna resumo
async function treinar(v, vendedoresDir) {
  const contexto = await gerarContexto(v, vendedoresDir);
  const pasta = pastaVendedor(vendedoresDir, v.id);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'contexto.txt'), contexto, 'utf8');
  const tokens = Math.ceil(contexto.length / 4);
  return {
    ok: true,
    contexto: contexto,
    tokens,
    pasta,
    arquivo: path.join(pasta, 'contexto.txt')
  };
}

// Link de acesso público do vendedor treinado (id + token de segurança)
function linkAcesso(v) {
  const t = (v.tokenAcesso || '').slice(0, 12);
  return 'https://severinobot.com/severino-ia/vendedor.html?id=' + encodeURIComponent(v.id) + (t ? '&t=' + encodeURIComponent(t) : '');
}

// Token de acesso do comprador (hash curto, usado para validar edições/chat)
function gerarTokenAcesso(id) {
  const base = String(id || '') + '|' + process.env.SECRET_KEY || '';
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// Valida o token (aceita o token completo ou os primeiros 12 chars)
function validarToken(v, tokenFornecido) {
  if (!v || !v.tokenAcesso || !tokenFornecido) return false;
  const t = String(tokenFornecido).trim().toLowerCase();
  const full = v.tokenAcesso.toLowerCase();
  return t === full || t === full.slice(0, 12);
}

// Conversa com o vendedor treinado (usa o contexto gerado)
async function conversar(v, pergunta, historico, vendedoresDir) {
  const pasta = pastaVendedor(vendedoresDir, v.id);
  let contexto = '';
  const ctxFile = path.join(pasta, 'contexto.txt');
  try { if (fs.existsSync(ctxFile)) contexto = fs.readFileSync(ctxFile, 'utf8'); } catch (e) {}
  if (!contexto) contexto = montarMateriais(v, vendedoresDir);

  const nomeBot = (v.personalidade && v.personalidade.nomeBot) || 'Severino';
  const idioma = (v.personalidade && v.personalidade.idiomaAtend) || 'pt';

  // Fallback determinístico sem LLM
  const respostaBase = `Sou ${nomeBot}, vendedor(a) IA de ${v.negocio || 'esta loja'}. Sobre "${String(pergunta).slice(0,120)}": me diga o que precisa e posso te ajudar com nossos produtos e condições. (Treinamento disponível em: ${ctxFile})`;

  if (!ia) return { ok: true, resposta: respostaBase, viaLLM: false };

  try {
    const sistema = `Você é ${nomeBot}, o vendedor IA do negócio "${v.negocio || 'esta loja'}". Use SOMENTE o contexto abaixo para responder com precisão, cordialidade e conduzindo à venda. Idioma principal: ${idioma}.

== CONTEXTO TREINADO DO VENDEDOR ==
${contexto.slice(0, 16000)}`;
    const mensagens = [
      ...(Array.isArray(historico) ? historico.slice(-8) : []),
      { role: 'user', content: String(pergunta || '').slice(0, 2000) }
    ];
    const res = await ia.perguntar({
      agente: 'vendedor-' + v.id.slice(-6),
      sistema,
      mensagens,
      modelo: 'barato',
      temperatura: 0.7
    });
    return { ok: true, resposta: (res.texto || respostaBase).trim(), viaLLM: true };
  } catch (e) {
    console.log('⚠️ Chat vendedor: LLM indisponível, resposta base. (' + e.message + ')');
    return { ok: true, resposta: respostaBase, viaLLM: false };
  }
}

module.exports = { treinar, montarMateriais, linkAcesso, gerarContexto, gerarTokenAcesso, validarToken, conversar };
