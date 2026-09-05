/**
 * 🧠 Gestor de Leads — Agente de Acompanhamento
 * 
 * Lê as licenças, categoriza por status, gera relatório no Telegram
 * com resultados e recomendações.
 * 
 * Uso: node gestor_leads.js [--report-only]
 *       --report-only: só gera relatório, não dispara mensagens
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const LICENSES_PATH = path.join(__dirname, '..', 'data', 'licenses.json');
const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// --- Helpers ---

function loadLicenses() {
  if (!fs.existsSync(LICENSES_PATH)) return {};
  return JSON.parse(fs.readFileSync(LICENSES_PATH, 'utf8'));
}

function daysUntil(ts) {
  const now = Date.now();
  const diff = ts - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

async function sendTelegram(text) {
  if (!TOKEN || !CHAT_ID) {
    console.log('[WARN] TELEGRAM_TOKEN ou CHAT_ID não configurados');
    console.log(text);
    return;
  }
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const body = { chat_id: CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) console.error('Telegram error:', await res.text());
  } catch (e) {
    console.error('Telegram fetch error:', e.message);
  }
}

// --- Main ---

function analyze() {
  const licenses = loadLicenses();
  const entries = Object.entries(licenses);

  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  // Categories
  const batchActivated = [];  // activated on 2026-07-29
  const purchased = [];       // has customerEmail (Kiwify purchase)
  const active7d = [];        // activated within last 7 days
  const expiringSoon = [];    // expires in <= 3 days
  const expired = [];         // more than 7 days since activation
  const neverActivated = [];  // no activatedAt

  for (const [code, data] of entries) {
    const activated = data.activatedAt && data.activatedAt !== 'null';
    
    if (data.customerEmail || data.transactionId) {
      purchased.push({ code, ...data });
    }
    
    if (data.batchActivation === '2026-07-29') {
      batchActivated.push({ code, ...data });
    }

    if (!activated) {
      neverActivated.push({ code, ...data });
      continue;
    }

    const activatedAt = data.activatedAt_ts || new Date(data.activatedAt).getTime();
    const age = now - activatedAt;

    if (age <= SEVEN_DAYS) {
      active7d.push({ code, ...data, daysLeft: daysUntil(activatedAt + SEVEN_DAYS) });
      if (daysUntil(activatedAt + SEVEN_DAYS) <= 3) {
        expiringSoon.push({ code, ...data, daysLeft: daysUntil(activatedAt + SEVEN_DAYS) });
      }
    } else {
      expired.push({ code, ...data });
    }
  }

  return { total: entries.length, batchActivated, purchased, active7d, expiringSoon, expired, neverActivated };
}

function buildReport(stats) {
  const lines = [];

  lines.push('📊 <b>RELATÓRIO — GESTOR DE LEADS</b>');
  lines.push(`📅 ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');

  // Summary
  lines.push('');
  lines.push(`<b>📌 RESUMO</b>`);
  lines.push(`Total de licenças: ${stats.total}`);
  lines.push(`🎯 Lote 29/jul (32 leads): ${stats.batchActivated.length} ativadas`);
  lines.push(`💰 Pagantes (Kiwify): ${stats.purchased.length}`);
  lines.push(`✅ VIP ativo hoje: ${stats.active7d.length}`);
  lines.push(`⚠️ Expirando em ≤3 dias: ${stats.expiringSoon.length}`);
  lines.push(`❌ Já expiradas: ${stats.expired.length}`);
  lines.push(`💤 Nunca ativadas: ${stats.neverActivated.length}`);

  // Batch 29/jul detail
  if (stats.batchActivated.length > 0) {
    lines.push('');
    lines.push(`<b>🎯 LOTE 29/JUL — SITUAÇÃO</b>`);
    const stillVip = stats.batchActivated.filter(l =>
      l.activatedAt_ts && (Date.now() - l.activatedAt_ts < 7 * 24 * 60 * 60 * 1000)
    );
    const expiredBatch = stats.batchActivated.filter(l =>
      l.activatedAt_ts && (Date.now() - l.activatedAt_ts >= 7 * 24 * 60 * 60 * 1000)
    );

    lines.push(`Ainda VIP: ${stillVip.length}`);
    lines.push(`Expirados: ${expiredBatch.length}`);

    if (stillVip.length > 0) {
      lines.push('');
      lines.push('<b>Próximos a expirar:</b>');
      const soon = stillVip
        .map(l => ({ code: l.code, daysLeft: Math.ceil((l.activatedAt_ts + 7*24*60*60*1000 - Date.now())/(1000*60*60*24)) }))
        .filter(l => l.daysLeft <= 3)
        .sort((a, b) => a.daysLeft - b.daysLeft);
      
      for (const l of soon.slice(0, 10)) {
        lines.push(`  └ ${l.code} → expira em ${l.daysLeft} dia${l.daysLeft > 1 ? 's' : ''}`);
      }
      if (soon.length > 10) lines.push(`  └ ... e mais ${soon.length - 10}`);
    }
  }

  // Purchased detail
  if (stats.purchased.length > 0) {
    lines.push('');
    lines.push(`<b>💰 PAGANTES</b>`);
    for (const p of stats.purchased) {
      const plan = p.plan || 'N/A';
      const value = p.value ? `R$ ${p.value}` : 'N/A';
      const name = p.customerName || p.customerEmail || p.code;
      lines.push(`  └ <code>${p.code}</code> — ${name} — ${plan} — ${value}`);
    }
  }

  // Recommendations
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`<b>💡 RECOMENDAÇÕES</b>`);

  if (stats.batchActivated.length > 0 && stats.purchased.length === 0) {
    lines.push('');
    lines.push('🔴 <b>NENHUMA VENDA AINDA</b>');
    lines.push('As 32 ativações em massa não geraram pagantes.');
    lines.push('');
    lines.push('<b>Ações sugeridas:</b>');
    lines.push('1. Disparar mensagem de acompanhamento para os leads prestes a expirar');
    lines.push('2. Oferecer cupom de primeiro mês por R$ 27 (50% off) via link Kiwify');
    lines.push('3. Se não houver contato (Telegram/e-mail), focar em tráfego novo');
  }

  if (stats.purchased.length > 0) {
    lines.push('');
    lines.push('✅ <b>VENDAS REALIZADAS</b>');
    lines.push(`Total: ${stats.purchased.length} pagante${stats.purchased.length > 1 ? 's' : ''}`);
    const mrr = stats.purchased.reduce((acc, p) => {
      const v = parseFloat(p.value);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
    lines.push(`Receita: R$ ${mrr.toFixed(2)}`);
    lines.push('');
    lines.push('<b>Próximo passo:</b>');
    lines.push('1. Garantir que estão recebendo os sinais VIP');
    lines.push('2. Preparar oferta de upsell (plano anual)');
  }

  if (stats.active7d.length > 0 && stats.purchased.length === 0) {
    lines.push('');
    lines.push('⏳ <b>JANELA DE CONVERSÃO ABERTA</b>');
    lines.push(`${stats.expiringSoon.length} licenças expirando em ≤3 dias.`);
    lines.push('Recomendo disparo de urgência + oferta relâmpago.');
    lines.push('');
    lines.push('Sugestão de mensagem:');
    lines.push('"⚠️ Seu teste VIP termina em X dias. Bloqueie o valor promocional agora → link"');
  }

  if (stats.neverActivated.length > 0) {
    lines.push('');
    lines.push('💤 <b>LEADS DORMINDO</b>');
    lines.push(`${stats.neverActivated.length} códigos nunca foram usados.`);
    lines.push('Sem dados de contato — focar em novos canais de aquisição.');
  }

  // Final tip
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🔧 <b>Próximo relatório:</b> amanhã às 8h (automático)');
  lines.push('📊 <b>Para relatório agora:</b> node gestor_leads.js');

  return lines.join('\n');
}

// --- Run ---
const stats = analyze();
const report = buildReport(stats);
const reportOnly = process.argv.includes('--report-only');

if (reportOnly) {
  console.log(report);
} else {
  sendTelegram(report).then(() => {
    console.log('Relatório enviado ao Telegram.');
    console.log(`Resumo: ${stats.total} licenças, ${stats.active7d.length} VIP, ${stats.expiringSoon.length} expirando, ${stats.purchased.length} pagantes.`);
  });
}
