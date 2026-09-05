const fs = require('fs');
const path = require('path');

const ECO = '/root/severino/ecosystem';
const LEADS = path.join(ECO, 'leads.json');

function readLeads() {
  try { return JSON.parse(fs.readFileSync(LEADS, 'utf8')); }
  catch { return []; }
}
function writeLeads(data) {
  fs.writeFileSync(LEADS, JSON.stringify(data, null, 2));
}

function scoreLead(lead) {
  let s = 0;
  const txt = ((lead.nome || '') + ' ' + (lead.email || '') + ' ' + (lead.telefone || '') + ' ' + (lead.fonte || '')).toLowerCase();
  if (txt.includes('btc') || txt.includes('bitcoin') || txt.includes('cripto')) s += 2;
  if (txt.includes('trader') || txt.includes('investidor')) s += 2;
  if (txt.includes('weather') || txt.includes('painel')) s += 1;
  if (lead.email) s += 1;
  if (lead.telefone) s += 1;
  if (lead.fonte === 'whatsapp' || lead.fonte === 'telegram') s += 1;
  return Math.min(5, s);
}

async function qualificar() {
  const leads = readLeads();
  const updated = leads.map(lead => {
    if (lead.status !== 'novo') return lead;
    const score = scoreLead(lead);
    let status = 'frio';
    if (score >= 4) status = 'quente';
    else if (score >= 2) status = 'morno';
    return { ...lead, score, status };
  });
  writeLeads(updated);
  return { ok: true, total: updated.length, quentes: updated.filter(x => x.status === 'quente').length };
}

async function run() {
  const res = await qualificar();
  console.log(JSON.stringify(res, null, 2));
}

if (require.main === module) run();
module.exports = { qualificar, readLeads, writeLeads };
