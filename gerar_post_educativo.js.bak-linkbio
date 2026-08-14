#!/usr/bin/env node
/**
 * 📚 Gerador de Post Educativo diário ("Ciclo do Medo") — BTC Weather Panel
 *
 * Ensina 1 conceito por dia usando dados REAIS do clima_card.json do dia,
 * rotativo por dia da semana. CTA suave no fim -> trial.
 *
 * Saída: data/posts_educativo.json (consumido por publicar_educativo.js)
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CLIMA_JSON = path.join(DATA_DIR, 'clima_card.json');
const OUT_JSON = path.join(DATA_DIR, 'posts_educativo.json');
const CARD_PNG = path.join(DATA_DIR, 'card_today.png');

function num(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function temaDoDia() {
  // 0=dom,1=seg,...6=sab
  const d = new Date().getDay();
  const temas = [
    { id: 'estacoes', titulo: 'As estações do mercado', emoji: '🌱' },      // dom
    { id: 'fear-greed', titulo: 'Medo & Ganância', emoji: '😱' },            // seg
    { id: 'rsi', titulo: 'O que o RSI diz', emoji: '📊' },                   // ter
    { id: 'suporte-resistencia', titulo: 'Suporte e Resistência', emoji: '🛡️' }, // qua
    { id: 'periodos', titulo: '15M, 1H e 4H: o que olhar', emoji: '🕐' },    // qui
    { id: 'plano', titulo: 'Um plano simples em 3 passos', emoji: '🧭' },    // sex
    { id: 'semana', titulo: 'Resumo da semana', emoji: '📅' },               // sab
  ];
  return temas[d];
}

function montarX(clima, tema) {
  const fng = clima.medoGanancia || {};
  const p = clima.periodos || {};
  const p15 = p['15M'] || {}, p1h = p['1H'] || {}, p4h = p['4H'] || {};
  const preco = num(clima.precoBTC);
  const txts = [];

  if (tema.id === 'fear-greed') {
    const val = fng.value ?? '--';
    const cl = fng.classification || '--';
    const sinal = val >= 55 ? 'ganância domina' : val <= 45 ? 'medo domina' : 'zona neutra';
    txts.push(`Medo & Ganância: ${val}/100 (${cl}) → ${sinal}.`);
    txts.push(`Medo alto pode ser oportunidade, mas precisa de confirmação no gráfico. No card, sentimento e RSI andam juntos.`);
  } else if (tema.id === 'rsi') {
    const r15 = p15.rsi ?? '--', r4h = p4h.rsi ?? '--';
    const nome = v => v >= 70 ? 'sobrecompra 🔥' : v <= 30 ? 'sobrevenda 💎' : v >= 55 ? 'força alta' : v <= 45 ? 'força baixa' : 'neutro';
    txts.push(`RSI hoje: 15M ${r15} (${nome(r15)}), 4H ${r4h} (${nome(r4h)}).`);
    txts.push(`Alto demais esfria, baixo demais impulsiona. Comparar prazos conta a história — faço isso todo dia no card.`);
  } else if (tema.id === 'suporte-resistencia') {
    const sup = p4h.suporte ? num(p4h.suporte) : '--';
    const res = p4h.resistencia ? num(p4h.resistencia) : '--';
    txts.push(`4H hoje: suporte ≈ $${sup}, resistência ≈ $${res}.`);
    txts.push(`Suporte = compradores reaparecem; resistência = vendedores freiam. Comportamento, não palpite.`);
  } else if (tema.id === 'periodos') {
    txts.push(`Hoje: 15M ${p15.clima || '--'}, 1H ${p1h.clima || '--'}, 4H ${p4h.clima || '--'}.`);
    txts.push(`15M é o agora, 1H os minutos, 4H o dia. Clareza quando concordam; conflito = indecisão. Resumo numa imagem diária.`);
  } else if (tema.id === 'estacoes') {
    const cl4h = p4h.clima || '--';
    const estacao = cl4h === 'ALTA' ? 'COLHER ou CULTIVAR' : cl4h === 'BAIXA' ? 'PLANTAR (acumular)' : 'AGUARDAR';
    txts.push(`Mercado tem estações: plantar, cultivar, colher.`);
    txts.push(`4H está ${cl4h} → ${estacao}. Erro clássico: vender no medo, comprar na euforia.`);
  } else if (tema.id === 'plano') {
    txts.push(`Plano de 3 passos: 1️⃣ 4H define direção 2️⃣ 15M confirma 3️⃣ decide só alinhado.`);
    txts.push(`Hoje: 4H ${p4h.clima || '--'} + 15M ${p15.clima || '--'} → ${(p4h.clima === p15.clima) ? 'alinhados ✅' : 'divergentes ⚠️'}. Sem sinal claro, sem operação.`);
  } else if (tema.id === 'semana') {
    txts.push(`Fecho da semana: $${preco}, Medo & Ganância ${fng.value ?? '--'}/100.`);
    txts.push(`4H ${p4h.clima || '--'} + 1M ${(p['1M'] && p['1M'].clima) || '--'} → ${(p['1M'] && p['1M'].clima === 'SOBREVENDA') ? 'sobrevenda acumulando' : 'transição'}. Ciclo: medo é contexto, RSI confirmação, níveis o palco.`);
  }

  const cta = `\n\n📚 7 dias grátis para aprender na prática: https://btcweatherpanel.com/oferta\n\n#Bitcoin #BTC #Trading #Investimento`;
  return txts.join('\n\n') + cta;
}

function montarIG(clima, tema) {
  return montarX(clima, tema)
    .replace(/\*\*/g, '*')
    .replace(/#Bitcoin #BTC #Trading #Investimento/g, '#bitcoin #btc #trading #investimento #cripto #cryptocurrency #bitcoinbrasil');
}

function gerar(clima, data) {
  const tema = temaDoDia();
  const textoX = montarX(clima, tema);
  const textoIG = montarIG(clima, tema);
  return {
    geradoEm: new Date().toISOString(),
    data: data || new Date().toLocaleDateString('pt-BR'),
    tema: tema.id,
    titulo: tema.titulo,
    cardPNG: CARD_PNG,
    x: { texto: textoX, rede: 'x', hashtags: ['#Bitcoin', '#BTC', '#Trading'] },
    instagram: { texto: textoIG, rede: 'instagram', hashtags: ['#bitcoin', '#btc', '#cripto'] }
  };
}

if (require.main === module) {
  (async () => {
    if (!fs.existsSync(CLIMA_JSON)) {
      console.log('[educativo] clima_card.json nao existe — rode postar_card.js primeiro');
      process.exit(1);
    }
    const clima = JSON.parse(fs.readFileSync(CLIMA_JSON, 'utf8'));
    const post = gerar(clima);
    fs.writeFileSync(OUT_JSON, JSON.stringify(post, null, 2));
    console.log('[educativo] post gerado ->', OUT_JSON);
    console.log('=== TEMA:', post.titulo, '===');
    console.log('--- X (len ' + post.x.texto.length + ') ---\n' + post.x.texto);
    console.log('--- IG (len ' + post.instagram.texto.length + ') ---\n' + post.instagram.texto);
  })();
}

module.exports = { gerar, montarX, montarIG, temaDoDia };
