/**
 * 🎣 Captador — ponte e-mail → Telegram (dupla captura).
 *
 * Quando o lead ativa o trial pelo site e deixa só o e-mail (sem Telegram),
 * este agente envia UM convite por e-mail com:
 *   - amostra do sinal diário (prova de valor)
 *   - link direto do bot com o código embutido (?start=CODIGO → auto-vincular)
 *   - instrução /vincular como alternativa manual
 *
 * Regras anti-spam:
 *   - envia só uma vez (marca conviteEmail com timestamp)
 *   - se o lead já tem telegramId (vinculou pelo site/bot), não envia
 *   - espera o retentorInicio estar definido (trial ativado)
 */
const funil = require('../funil');
const canais = require('../canais');
const produtos = require('../produtos.json');

const BOT_USERNAME = 'btcweatherpanel_bot'; // username real do bot (getMe)
const GAP_HORAS = 1; // envia o convite ~1h após a ativação, pra não assustar

function lerFunil() {
  return funil.listLeads();
}

function upsert(lead, patch) {
  funil.upsertLead({ leadId: lead.leadId, ...patch });
}

function templateConvite(lead, info) {
  const nome = (lead.nome || '').trim();
  const sauda = nome ? `Oi, ${nome}!` : 'Oi!';
  const trialCode = lead.trialCode || '';
  const linkBot = `https://t.me/${BOT_USERNAME}`;
  // Deep link: Telegram envia "/start CODIGO" quando o usuário toca no link.
  const linkStart = `${linkBot}?start=${trialCode}`;
  const checkout = (info && info.checkoutUrl) || 'https://pay.kiwify.com.br/ffphj4e';

  const texto = `${sauda} 👋

Vi que você ativou o teste do ${info && info.nome ? info.nome : 'BTC Weather Panel'} pelo site, mas ainda não conectou o Telegram. É lá que você recebe o que interessa:

📊 Card diário com análise do clima do Bitcoin (preço, tendência, RSI, Fear & Greed)
📡 Sinais operacionais quando o cenário muda
🌦️ Alertas em tempo real de mudança na previsão

Pra conectar é só 1 clique (o código já vem preenchido):

👉 ${linkStart}

Se preferir, os 3 passos manuais:
1) Abra ${linkBot}
2) Toque em Iniciar
3) Envie: /vincular ${trialCode}

Código do seu teste: ${trialCode}

Qualquer dúvida, é só responder este e-mail. 👊

— Severino`;

  return texto;
}

async function processar(evento) {
  const acoes = [];

  if (evento.tipo !== 'tick.captura') {
    return { agente: 'captador', acao: 'tipo não tratado', novosEventos: [] };
  }

  const info = produtos.btcweather;
  const leads = lerFunil().filter((l) => {
    if (l.status !== 'vip') return false;          // só trial ativo
    if (!l.email) return false;                    // precisa de e-mail
    if (l.telegramId) return false;                // já tem Telegram
    if (l.conviteEmail) return false;              // já convidado
    if (!l.retentorInicio) return false;           // precisa ter começado o trial
    return true;
  });

  for (const lead of leads) {
    // Espera GAP_HORAS após a ativação do trial antes de mandar o convite.
    const inicio = new Date(lead.retentorInicio).getTime();
    if (Date.now() - inicio < GAP_HORAS * 3600000) continue;

    const assunto = 'BTC Weather Panel — receba seus sinais no Telegram 📲';
    const texto = templateConvite(lead, info);
    try {
      const ok = await canais.enviarEmail(lead.email, assunto, texto);
      if (ok) {
        upsert(lead, { conviteEmail: new Date().toISOString(), conviteEmailCanal: 'email' });
        acoes.push(`${lead.leadId}:convite-email-ok`);
      } else {
        acoes.push(`${lead.leadId}:convite-falhou-envio`);
      }
    } catch (e) {
      acoes.push(`${lead.leadId}:erro(${e.message})`);
    }
  }

  return {
    agente: 'captador',
    acao: acoes.length ? 'captura: ' + acoes.join(', ') : 'nada a convidar',
    novosEventos: []
  };
}

module.exports = { processar };