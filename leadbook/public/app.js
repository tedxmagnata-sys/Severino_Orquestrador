const BASE = window.LB_BASE || '';
const $ = (s) => document.querySelector(s);

let resultadoAtual = null;
const mdPreview = new (function () {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(t) {
    return t
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }
  function block(lines) {
    let html = '', list = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { if (list) { html += '</ul>'; list = null; } continue; }
      const bq = line.match(/^&gt;\s?(.*)/) || line.match(/^>\s?(.*)/);
      if (bq) { html += '<blockquote>' + inline(bq[1]) + '</blockquote>'; continue; }
      const h1 = line.match(/^#\s(.+)/), h2 = line.match(/^##\s(.+)/), h3 = line.match(/^###\s(.+)/);
      if (h1) { html += '<h1>' + inline(h1[1]) + '</h1>'; continue; }
      if (h2) { html += '<h2>' + inline(h2[1]) + '</h2>'; continue; }
      if (h3) { html += '<h3>' + inline(h3[1]) + '</h3>'; continue; }
      const li = line.match(/^[-*]\s?(.+)/) || line.match(/^\d+\.\s?(.+)/);
      if (li) {
        if (list !== 'ul') { html += '<ul>'; list = 'ul'; }
        html += '<li>' + inline(li[1]) + '</li>';
        continue;
      }
      if (list) { html += '</ul>'; list = null; }
      html += '<p>' + inline(line) + '</p>';
    }
    if (list) html += '</ul>';
    return html;
  }
  return { render: (md) => block(md.replace(/```([\s\S]*?)```/g, (_, c) => '<pre>' + esc(c) + '</pre>').split('\n').map((l) => esc(l).trim()).filter((l, i, a) => !(l === '' && a[i - 1] === ''))) };
})();

async function api(url, opts = {}) {
  const res = await fetch(BASE + url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erro || data.error || ('HTTP ' + res.status));
  return data;
}

async function checarSaude() {
  try {
    const r = await api('/api/health');
    $('#statusTxt').textContent = 'online';
    if (!r.tem_capa) $('#capaInfo').textContent = 'prompt (sem chave de imagem)';
  } catch {
    $('#statusTxt').textContent = 'offline';
  }
}

const passos = ['Validando tema', 'Criando conceito', 'Escrevendo o ebook', 'Montando copy e reels', 'Finalizando'];
function progresso(ativo) {
  $('#progresso').classList.toggle('oculto', !ativo);
  $('#btnGerar').disabled = ativo;
}
function setPasso(i) { $('#fill').style.width = ((i + 1) / passos.length) * 100 + '%'; $('#passoAtual').textContent = passos[i]; }

function mostrarErro(msg) { const e = $('#erro'); e.textContent = msg; e.classList.remove('oculto'); }
function esconderErro() { $('#erro').classList.add('oculto'); }

async function gerar() {
  esconderErro();
  const body = {
    tema: $('#tema').value.trim(),
    publico: $('#publico').value.trim(),
    objetivo: $('#objetivo').value.trim(),
    idioma: $('#idioma').value,
    gerarCapa: $('#gerarCapa').checked
  };
  if (!body.tema || !body.publico || !body.objetivo) { mostrarErro('Preencha tema, público e objetivo.'); return; }

  progresso(true);
  setPasso(0);
  const timer = setInterval(() => { const w = parseFloat($('#fill').style.width || 0); if (w < 90) $('#fill').style.width = Math.min(90, w + 6) + '%'; }, 1800);
  try {
    const r = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) });
    resultadoAtual = r;
    renderResultado(r);
  } catch (e) {
    mostrarErro(e.message);
  } finally {
    clearInterval(timer);
    progresso(false);
    setPasso(0);
  }
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderResultado(r) {
  const d = r.data;
  $('#resultado').classList.remove('oculto');
  $('#tituloEbook').textContent = d.ebook.titulo;
  $('#subtituloEbook').textContent = d.ebook.subtitulo;
  $('#mdEdit').value = d.ebook.conteudo_markdown;
  $('#mdPreview').innerHTML = mdPreview.render(d.ebook.conteudo_markdown);

  const L = d.copy_landing_page;
  $('#landingView').innerHTML = `
    <div class="landing-box">
      <div class="headline">${esc(L.headline)}</div>
      <div class="subheadline">${esc(L.subheadline)}</div>
      <h4>Dores do público</h4>
      <ul>${(L.dores_publico || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="cta-demo">${esc(L.chamada_para_acao)}</div>
    </div>`;

  $('#reelsView').innerHTML = (d.marketing_assets.roteiros_reels_tiktok || []).map((rl, i) => `
    <div class="reel">
      <span class="tag">REEL ${i + 1}</span>
      <p class="rot">Gancho (3s)</p><p>${esc(rl.gancho_3s)}</p>
      <p class="rot">Desenvolvimento</p><p>${esc(rl.desenvolvimento)}</p>
      <p class="rot">CTA</p><p>${esc(rl.cta)}</p>
    </div>`).join('') || '<p class="sub">Sem roteiros gerados.</p>';

  const ma = d.marketing_assets;
  const capaHtml = ma.capa_url
    ? `<img class="capa-img" src="${esc(ma.capa_url)}" alt="Capa gerada">`
    : '<p class="sub">Capa não gerada (nenhuma chave de imagem configurada). Use os prompts abaixo.</p>';
  $('#capaView').innerHTML = capaHtml + '<h4 style="margin:14px 0 8px;color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.5px">Prompts para Midjourney / Flux</h4>' +
    (ma.prompts_capa || []).map((p) => `<div class="prompt-block">${esc(p)}</div>`).join('');

  $('#jsonView').textContent = JSON.stringify(r, null, 2);
  $('#formCard').scrollIntoView({ behavior: 'smooth' });
}

function copiar(texto) {
  return navigator.clipboard.writeText(texto).then(() => {
    const b = $('#btnCopiarJson'); const t = b.textContent; b.textContent = 'Copiado!';
    setTimeout(() => { b.textContent = t; }, 1200);
  });
}

function baixar(nome, texto) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

$('#btnGerar').addEventListener('click', gerar);
document.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') gerar(); }));

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('ativo'));
  document.querySelectorAll('.pane').forEach((x) => x.classList.remove('ativo'));
  t.classList.add('ativo');
  $('#pane-' + t.dataset.tab).classList.add('ativo');
}));

$('#btnCopiarJson').addEventListener('click', () => copiar(JSON.stringify(resultadoAtual, null, 2)));
document.querySelector('[data-download="md"]').addEventListener('click', () => resultadoAtual && baixar(resultadoAtual.data.ebook.titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md', $('#mdEdit').value));
document.querySelector('[data-download="json"]').addEventListener('click', () => resultadoAtual && baixar(resultadoAtual.data.ebook.titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json', JSON.stringify(resultadoAtual, null, 2)));

$('#mdEdit').addEventListener('input', (e) => { $('#mdPreview').innerHTML = mdPreview.render(e.target.value); });

checarSaude();
