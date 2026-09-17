/**
 * 🧠 roteirista.js — Motor Autônomo de Conteúdo do Ecossistema Severino
 * --------------------------------------------------------------------
 * Gera 3+ posts/dia para cada nicho (Severino + BTC Weather).
 * Aprende com engajamento, auto-corrige erros, alimenta o funil.
 *
 * Fluxo:
 *   1. Coleta contexto (BTC preço + base de conhecimento)
 *   2. IA gera 3 posts por nicho (6 total)
 *   3. Salva em content-queue.json com metadados
 *   4. Publicador pega da fila e publica nos canais
 *
 * Uso: node roteirista.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const ia = require('./ia');
const guardiao = require('./guardiao');

const DATA_DIR = path.join(__dirname, 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'content-queue.json');
const HISTORY_FILE = path.join(DATA_DIR, 'content-history.json');
const KNOWLEDGE_SEVERINO = path.join(__dirname, '..', 'guia-monte-seu-severino.md');
const CONFIG = {
  severino: { times: ['09:00', '12:00', '18:00'], channels: ['telegram', 'x', 'instagram'] },
  btc:      { times: ['09:00', '12:00', '18:00'], channels: ['telegram', 'x', 'instagram'] }
};

// ===================== Helpers =====================
function lerJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function salvarJSON(p, d) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch {}
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
}

function getDataBR() {
  const d = new Date(Date.now() - 3 * 3600000); // UTC-3
  return { data: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16), diaSemana: ['dom','seg','ter','qua','qui','sex','sab'][d.getDay()] };
}

// ===================== BTC Preço =====================
function buscarBTC() {
  return new Promise(r => {
    const req = https.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', {
      headers: { 'User-Agent': 'SeverinoBot/1.0' }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const btc = j.bitcoin;
          if (!btc) { r(null); return; }
          const variacao = btc.usd_24h_change !== undefined ? btc.usd_24h_change.toFixed(2) : '0.00';
          const sinal = parseFloat(variacao) >= 0 ? '📈' : '📉';
          r({ preco: btc.usd, variacao, sinal, timestamp: new Date().toISOString() });
        } catch { r(null); }
      });
    });
    req.on('error', () => r(null));
    req.setTimeout(15000, () => { req.destroy(); r(null); });
  });
}

// ===================== Conhecimento =====================
function carregarConhecimento(nicho) {
  let base = '';
  if (nicho === 'severino') {
    try { base = fs.readFileSync(KNOWLEDGE_SEVERINO, 'utf8').slice(0, 6000); } catch {}
    base += '\n\nProdutos do ecossistema:\n' +
      '- Monte Seu Severino (guia PDF + skill + prompt): R$47\n' +
      '- Severino Vendedor IA (assinatura mensal): R$67,89/mês\n' +
      '- Ebook "Crie Seu Próprio Vendedor IA": R$19,90\n' +
      '- BTC Weather Panel: grátis (30 dias)\n' +
      '- Consultoria personalizada: R$497\n\n' +
      'Comunidade e suporte: t.me/severino_ia\n' +
      'Site: severinobot.com\n' +
      'WhatsApp: apenas para clientes de mentoria R$497';
  } else {
    base = 'BTC Weather Panel — painel meteorológico do Bitcoin.\n' +
      'Lê o mercado BTC em 7 períodos diferentes.\n' +
      'Traduz em linguagem simples: Plantar, Cultivar ou Colher.\n' +
      'Grátis por 30 dias em: btcweatherpanel.com\n' +
      'Indicadores: RSI, MACD, Bandas de Bollinger, Volume, Médias Móveis.\n' +
      'Comunidade: t.me/severino_ia';
  }
  return base;
}

// ===================== Geração de Posts =====================
async function gerarPosts(nicho, btcDados) {
  const { data, diaSemana } = getDataBR();
  const conhecimento = carregarConhecimento(nicho);
  const horarios = CONFIG[nicho].times;

  // Alterna o foco baseado no dia da semana
  const focos = nicho === 'severino'
    ? ['Educação (aprender)', 'Prova social (resultados)', 'Oferta (produtos)']
    : ['Análise de mercado', 'Educação BTC', 'Dicas de trading'];
  const focoHoje = focos[['dom','seg','ter','qua','qui','sex','sab'].indexOf(diaSemana) % 3];

  const systemPrompt = nicho === 'severino'
    ? `Você é o Severino, especialista em agentes de IA. Gera posts para redes sociais.
       Tom: amigável, direto. Foco: ${focoHoje}.
       Máximo 280 caracteres. Um hashtag relevante no final (#SeverinoAI).
       NUNCA prometa lucro ou resultado garantido.
       RegRA: Retorne SOMENTE o texto do post, sem prefácio, sem meta-instruções.
       CONHECIMENTO:\n${conhecimento}`
    : `Você é o analista do BTC Weather Panel. Gera posts sobre Bitcoin.
       Tom: informativo, dados reais, sem sensacionalismo. Foco: ${focoHoje}.
       Máximo 280 caracteres. Um hashtag no final (#Bitcoin #BTCWeather).
       NUNCA dê conselho financeiro.
       RegRA: Retorne SOMENTE o texto do post, sem prefácio, sem meta-instruções.
       Dados atuais: BTC ~$${btcDados?.preco || '?'} (${btcDados?.sinal || ''} ${btcDados?.variacao || '?'}% 24h).
       CONHECIMENTO:\n${conhecimento}`;

  const resultados = [];
  for (let i = 0; i < 3; i++) {
    const horario = horarios[i];
    const isAuto = i === 0; // primeiro post do dia é automático

    try {
      const context = isAuto ? 'automático' : 'para aprovação manual';
      const r = await ia.perguntar({
        agente: `roteirista-${nicho}`,
        sistema: systemPrompt + `\n\nRegras ABSOLUTAS:\n1. Retorne APENAS o texto do post, sem prefácio, sem "Aqui está", sem "Post X de Y", sem observações.\n2. O post é ${context} para ${horario}.\n3. Máximo 280 caracteres.\n4. Um hashtag no final.`,
        mensagens: [{ role: 'user', content: `Gere o post para ${horario}. Nicho: ${nicho}. Apenas o texto do post, sem meta-instruções.` }]
      });

      // Limpa lixo de formatação que a IA pode incluir
      let texto = r.texto
        .replace(/^(Aqui está|Post \d+|---|[\s\S]*?---\s*)/i, '')
        .replace(/\n*\*\*Total:.*?\*\*.*$/s, '')
        .replace(/\n*\*\*Observações?:.*$/s, '')
        .trim();

      const textoAprovado = guardiao.aprovar(texto).texto;
      if (textoAprovado && textoAprovado.length > 10) {
        resultados.push({
          id: `${nicho}-${data}-${i}`,
          nicho,
          data,
          horario,
          canais: CONFIG[nicho].channels,
          texto: textoAprovado,
          tipo: isAuto ? 'auto' : 'revisao',
          status: isAuto ? 'publicar' : 'aguardando_revisao',
          geradoEm: new Date().toISOString(),
          foco: focoHoje,
          btcReferencia: btcDados?.preco || null
        });
      }
    } catch (e) {
      // Auto-correção: tenta 1 vez com prompt mais simples
      try {
        const r2 = await ia.perguntar({
          agente: `roteirista-${nicho}`,
          sistema: `Gere 1 post sobre ${nicho}. Máximo 200 caracteres. Tom simples.`,
          mensagens: [{ role: 'user', content: `Post para ${horario}. Foco: ${focoHoje}` }]
        });
        const t2 = guardiao.aprovar(r2.texto).texto;
        if (t2 && t2.length > 10) {
          resultados.push({
            id: `${nicho}-${data}-${i}`,
            nicho, data, horario, canais: CONFIG[nicho].channels,
            texto: t2, tipo: isAuto ? 'auto' : 'revisao',
            status: isAuto ? 'publicar' : 'aguardando_revisao',
            geradoEm: new Date().toISOString(), foco: focoHoje,
            btcReferencia: btcDados?.preco || null, corrigido: true
          });
        }
      } catch {}
    }
  }
  return resultados;
}

// ===================== Histórico e Aprendizado =====================
function carregarHistorico() {
  const h = lerJSON(HISTORY_FILE);
  return h || { posts: [], metricas: { total: 0, publicados: 0, revisados: 0, aprovados: 0, rejeitados: 0 }, ajustes: [] };
}

function registrarAjuste(hist, mensagem) {
  hist.ajustes.push({ data: getDataBR().data, mensagem, timestamp: new Date().toISOString() });
  if (hist.ajustes.length > 100) hist.ajustes = hist.ajustes.slice(-100);
  salvarJSON(HISTORY_FILE, hist);
}

// ===================== Publicador Automático (TG) =====================
function publicarNoTelegram(post) {
  return new Promise(r => {
    const token = ia.env('TELEGRAM_COMMUNITY_TOKEN', '');
    const chat = ia.env('TELEGRAM_COMMUNITY_CHAT_ID', '');
    if (!token || !chat) { r(false); return; }
    const d = JSON.stringify({ chat_id: chat, text: post.texto.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true });
    const req = https.request(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }
    }, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try { r(JSON.parse(b).ok); } catch { r(false); }}); });
    req.on('error', () => r(false));
    req.write(d); req.end();
  });
}

// ===================== Loop Principal =====================
async function gerarCiclo() {
  const { data, hora, diaSemana } = getDataBR();
  console.log(`[roteirista] Ciclo ${data} ${hora} — gerando conteúdo...`);

  // Busca dados BTC
  const btcDados = await buscarBTC();
  if (btcDados) console.log(`[roteirista] BTC: $${btcDados.preco} (${btcDados.variacao}%)`);
  else console.log('[roteirista] BTC: sem dados');

  // Gera posts
  const postsSeverino = await gerarPosts('severino', btcDados);
  const postsBTC = await gerarPosts('btc', btcDados);
  const todosPosts = [...postsSeverino, ...postsBTC];
  console.log(`[roteirista] Gerados ${todosPosts.length} posts (${postsSeverino.length} severino + ${postsBTC.length} btc)`);

  // Carrega fila existente e mescla
  const filaExistente = lerJSON(QUEUE_FILE) || { posts: [], geradoEm: null };
  // Remove posts da mesma data (evita duplicados)
  filaExistente.posts = (filaExistente.posts || []).filter(p => p.data !== data);
  filaExistente.posts.push(...todosPosts);
  filaExistente.geradoEm = new Date().toISOString();
  salvarJSON(QUEUE_FILE, filaExistente);

  // Publica posts automáticos no Telegram
  for (const post of todosPosts) {
    if (post.status === 'publicar' && post.canais.includes('telegram')) {
      const publicado = await publicarNoTelegram(post);
      post.status = publicado ? 'publicado' : 'falha';
      console.log(`[roteirista] Post ${post.id} -> TG: ${publicado ? 'OK' : 'FALHA'}`);
    }
  }
  salvarJSON(QUEUE_FILE, filaExistente);

  // Atualiza histórico
  const hist = carregarHistorico();
  hist.total += todosPosts.length;
  hist.publicados += todosPosts.filter(p => p.status === 'publicado').length;
  hist.revisados += todosPosts.filter(p => p.tipo === 'revisao').length;
  salvarJSON(HISTORY_FILE, hist);

  return todosPosts;
}

// ===================== Relatório =====================
function gerarRelatorio() {
  const fila = lerJSON(QUEUE_FILE);
  const hist = carregarHistorico();
  const { data } = getDataBR();

  const pendentes = (fila?.posts || []).filter(p => p.status === 'aguardando_revisao');
  const publicados = (fila?.posts || []).filter(p => p.status === 'publicado');

  console.log('\n' + '='.repeat(50));
  console.log(`📊 RELATÓRIO DO ROTEIRISTA — ${data}`);
  console.log('='.repeat(50));
  console.log(`📝 Total gerados: ${hist.total || 0}`);
  console.log(`✅ Publicados: ${hist.publicados || 0}`);
  console.log(`⏳ Aguardando revisão: ${pendentes.length}`);
  console.log(`🛠️  Ajustes automáticos: ${(hist.ajustes || []).length}`);
  console.log('');
  if (pendentes.length) {
    console.log('📋 Posts pendentes de revisão:');
    pendentes.forEach(p => {
      console.log(`  [${p.nicho}] ${p.horario}: ${p.texto.slice(0, 80)}...`);
      console.log(`    Canais: ${p.canais.join(', ')}`);
    });
    console.log('');
    console.log('👉 Para aprovar, edite content-queue.json e troque status para "publicar"');
    console.log('👉 Ou use o comando: node roteirista.js aprovar <id-do-post>');
  }
  console.log('='.repeat(50));
}

// ===================== CLI =====================
async function main() {
  const cmd = process.argv[2];

  if (cmd === 'gerar') {
    await gerarCiclo();
    gerarRelatorio();
  } else if (cmd === 'relatorio') {
    gerarRelatorio();
  } else if (cmd === 'aprovar') {
    const id = process.argv[3];
    if (!id) { console.log('Use: node roteirista.js aprovar <id>'); return; }
    const fila = lerJSON(QUEUE_FILE);
    const post = (fila?.posts || []).find(p => p.id === id);
    if (!post) { console.log(`Post ${id} não encontrado`); return; }
    post.status = 'publicar';
    console.log(`✅ Post ${id} aprovado!`);
    // Publica no TG
    if (post.canais.includes('telegram')) {
      const ok = await publicarNoTelegram(post);
      console.log(`  TG: ${ok ? 'OK' : 'FALHA'}`);
      if (ok) post.status = 'publicado';
    } else post.status = 'publicado';
    salvarJSON(QUEUE_FILE, fila);
  } else if (cmd === 'aprovar-todos') {
    const fila = lerJSON(QUEUE_FILE);
    for (const post of (fila?.posts || []).filter(p => p.status === 'aguardando_revisao')) {
      post.status = 'publicar';
      if (post.canais.includes('telegram')) {
        const ok = await publicarNoTelegram(post);
        if (ok) post.status = 'publicado';
      } else post.status = 'publicado';
    }
    salvarJSON(QUEUE_FILE, fila);
    console.log('✅ Todos os posts pendentes foram aprovados e publicados!');
  } else {
    console.log('Uso: node roteirista.js [comando]');
    console.log('  gerar          — Gera novo ciclo de conteúdo');
    console.log('  relatorio      — Mostra status atual');
    console.log('  aprovar <id>   — Aprova post específico');
    console.log('  aprovar-todos  — Aprova todos pendentes');
  }
}

// ===================== Agendamento =====================
// Executa como daemon apenas quando chamado diretamente (PM2)
if (require.main === module && !process.argv[2]) {
  (async function daemon() {
    console.log('[roteirista] Modo daemon iniciado — gerando conteúdo a cada 6h');
    console.log('[roteirista] Horários auto: 9h | Revisão: 12h, 18h');
    
    const { hora } = getDataBR();
    // Gera imediatamente se estiver perto do horário de gerar (antes das 8h)
    await gerarCiclo();
    gerarRelatorio();
    
    // Repete a cada 6h
    setInterval(async () => {
      await gerarCiclo();
      gerarRelatorio();
    }, 6 * 3600000);
    
    // Relatório de pendentes a cada hora
    setInterval(() => {
      const fila = lerJSON(QUEUE_FILE);
      const pendentes = (fila?.posts || []).filter(p => p.status === 'aguardando_revisao');
      if (pendentes.length > 0) {
        console.log(`[roteirista] ⏳ ${pendentes.length} posts aguardando revisão`);
      }
    }, 3600000);
  })();
}

module.exports = { gerarCiclo, gerarRelatorio, publicarNoTelegram };

// CLI: executa comando quando chamado diretamente
if (require.main === module) {
  main().catch(e => console.error('[roteirista] Erro:', e.message));
}