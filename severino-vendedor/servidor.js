/**
 * 🦾 SEVERINO VENDEDOR IA — Servidor de validação (Fase 1-2)
 * Porta 3334. Zero dependências. API de vendedores + conversa treinada.
 *
 * Rotas do painel (vendedor.html):
 *   GET  /api/vendedor/acesso/:id          -> dados do vendedor (dono ou cliente)
 *   PUT  /api/vendedor/acesso/:id          -> salva ajustes (dono)
 *   POST /api/vendedor/acesso/:id/retreinar -> gera contexto com a IA (dono)
 *   POST /api/vendedor/acesso/:id/chat      -> conversa usando o treino (cliente/dono)
 *
 * Admin:
 *   GET  /api/admin/vendedores             -> lista todos (header x-admin-secret)
 *
 * Teste rápido:
 *   GET  /api/health
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ia = require('./ecossistema/ia.js');
const porkbun = require('./ecossistema/porkbun.js');

const PORT = parseInt(process.env.PORT || '3334', 10);
const ADMIN_SECRET = ia.env('ADMIN_SECRET', 'severino-admin');
const KIWIFY_WEBHOOK_SECRET = ia.env('KIWIFY_WEBHOOK_SECRET', '');
const KIWIFY_CHECKOUT_URL = ia.env('KIWIFY_CHECKOUT_URL', '');
const DADOS_LICENCA = {
  PLANO: 'Severino Vendedor IA',
  NOME: 'SEVERINO',
  EMAIL: ia.env('LICENCA_EMAIL', ''),
  TIPO: 'mensal'
};
const DATA_FILE = path.join(__dirname, 'data', 'vendedores.json');
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const FRONT = path.join(__dirname, 'vendedor.html');
const ATENDIMENTO = path.join(__dirname, 'atendimento.html');
const VENDA = path.join(__dirname, 'venda.html');

// ===== Persistência =====
function lerVendedores() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}
function salvarVendedores(v) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(v, null, 2));
}
function lerUm(id) {
  const v = lerVendedores();
  return v[id] || null;
}
function salvarUm(id, dados) {
  const v = lerVendedores();
  v[id] = dados;
  salvarVendedores(v);
}

// ===== Sistema do vendedor (comportamento da IA) =====
function montarSistema(v) {
  const p = v.personalidade || {};
  const nomeBot = p.nomeBot || 'Severino';
  const negocio = v.negocio || 'Negócio';
  const ramo = v.ramo || '';
  const idioma = p.idiomaAtend || 'pt';
  const horario = p.horario || '24h';
  const regras = p.regras || 'Sempre ser honesto, nunca inventar preço ou prazo.';

  const produtos = (v.produtos || []).map((x, i) =>
    `${i + 1}. ${x.nome}${x.preco ? ' — R$ ' + x.preco : ''}${x.desc ? ' · ' + x.desc : ''}`
  ).join('\n') || 'Nenhum produto cadastrado ainda.';

  const treino = v.treino?.texto || '';
  const linkRef = v.treino?.linkRef || '';

  return [
    `Você é ${nomeBot}, vendedor IA de ${negocio}${ramo ? ' (' + ramo + ')' : ''}.`,
    `Atende ${horario}. Idioma do atendimento: ${idioma}.`,
    '',
    '## PRODUTOS (valores oficiais — use exatamente estes):',
    produtos,
    '',
    '## CONHECIMENTO DO NEGÓCIO (fonte de verdade):',
    treino || 'Nenhum conhecimento extra informado.',
    linkRef ? `\n## FONTE DE REFERÊNCIA: ${linkRef}` : '',
    '',
    '## REGRAS DE VENDA:',
    regras,
    '',
    '## REGRAS DE HONESTIDADE (obrigatórias, nunca quebre):',
    '- SÓ responda com base nas informações acima. NUNCA invente preço, desconto, promoção, política, serviço, horário ou endereço.',
    '- Se a resposta NÃO estiver no conhecimento/produtos/regras, responda: "Deixa eu confirmar com o responsável e já te retorno" e não chute.',
    '- Nunca afirmar que existe um serviço que não está listado. Nunca prometer prazos, frete ou condições que não estão escritos.',
    '- Se o cliente perguntar algo que contradiz o conhecimento (ex.: um serviço que o negócio disse que não faz), corrija educadamente.',
    '',
    '## COMPORTAMENTO:',
    '- Seja cordial, paciente e direto. Não faça spam.',
    '- Qualifique o cliente com poucas perguntas (necessidade, urgência, orçamento).',
    '- Ao final, sempre ofereça o próximo passo claro (pedido, agendamento, contato humano).'
  ].filter(Boolean).join('\n');
}

// Monta o "contexto treinado" (regenerado a cada mudança do dono)
function gerarContexto(v) {
  const sistema = montarSistema(v);
  const contexto = [
    `Negócio: ${v.negocio || ''}`,
    `Ramo: ${v.ramo || ''}`,
    `WhatsApp: ${v.whatsapp || ''}`,
    '',
    `Nome do vendedor: ${v.personalidade?.nomeBot || 'Severino'}`,
    `Tom de voz: ${v.personalidade?.tomVoz || 'cordial'}`,
    `Idioma: ${v.personalidade?.idiomaAtend || 'pt'}`,
    `Horário: ${v.personalidade?.horario || '24h'}`,
    '',
    'Produtos:',
    (v.produtos || []).map(p => `- ${p.nome}${p.preco ? ' (R$ ' + p.preco + ')' : ''}${p.desc ? ': ' + p.desc : ''}`).join('\n') || '- nenhum',
    '',
    'Regras:',
    v.personalidade?.regras || 'Sempre ser honesto.',
    '',
    'Conhecimento:',
    v.treino?.texto || '',
    v.treino?.linkRef ? 'Ref: ' + v.treino.linkRef : ''
  ].filter(Boolean).join('\n');
  return contexto;
}

// ===== Leads (aviso ao dono) =====
function lerLeads() {
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); }
  catch { return []; }
}
function salvarLeads(l) {
  fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
  fs.writeFileSync(LEADS_FILE, JSON.stringify(l, null, 2));
}
const INTENCAO = /\b(quero|gostaria|pode|posso|vou|agend|comprar|quanto|valor|pre[çc]o|endere[çc]o|funciona|dispon[ií]vel|marcar|reservar|pedir|levar|pagamento|pix|cart[aã]o|boleto|desconto|entrega|retirar)\b/i;
const CONTATO = /(\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4})|\b(whatsapp|zap|telefone|contato|meu n[úu]mero|te passo|chamar)\b/i;

// Detecta interesse real de compra/contato: tem intenção OU deixou contato
function ehLeadQuente(pergunta, historico) {
  const tudo = historioParaTexto(historico) + ' ' + pergunta;
  return INTENCAO.test(tudo) || CONTATO.test(tudo);
}
function historioParaTexto(h) {
  return (Array.isArray(h) ? h : []).map(m => m?.content || '').join(' ');
}

function registrarLead(v, id, pergunta, historico, resposta) {
  const leads = lerLeads();
  const jaExiste = leads.find(l => l.vendedorId === id && l.status === 'novo' && Date.now() - l.criadoEm < 120000);
  if (jaExiste) return jaExiste;
  const lead = {
    id: 'lead-' + Date.now().toString(36),
    vendedorId: id,
    vendedor: v.negocio,
    contatoExtraido: extrairContato(historico, pergunta),
    resumo: historioParaTexto(historico) + ' | ' + pergunta + ' | ' + resposta,
    criadoEm: Date.now(),
    status: 'novo'
  };
  leads.push(lead);
  salvarLeads(leads);
  return lead;
}
function extrairContato(historico, pergunta) {
  const tudo = historioParaTexto(historico) + ' ' + pergunta;
  const m = tudo.match(/(\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4})/);
  return m ? m[1] : '';
}

// ===== HTTP server =====
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function authDono(v, token) {
  return v && v.token && token && token === v.token;
}

http.createServer(async (req, res) => {
  const raw = req.url.split('?')[0];
  const q = new URL(req.url, 'http://x').searchParams;
  const method = req.method;

  // CORS simples (local)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ===== Health =====
  if (method === 'GET' && raw === '/api/health') {
    return json(res, 200, { ok: true, produto: 'severino-vendedor', versao: '0.1.0', porta: PORT });
  }

  // ===== Admin: lista vendedores =====
  if (method === 'GET' && raw === '/api/admin/vendedores') {
    if (req.headers['x-admin-secret'] !== ADMIN_SECRET) return json(res, 401, { ok: false, error: 'Não autorizado' });
    const v = lerVendedores();
    const lista = Object.entries(v).map(([id, d]) => ({
      id, negocio: d.negocio, whatsapp: d.whatsapp, treinado: !!d.treinado,
      criadoEm: d.criadoEm, status: d.status || 'ativo'
    }));
    return json(res, 200, { ok: true, total: lista.length, vendedores: lista });
  }

  // ===== Admin: leads =====
  if (method === 'GET' && raw === '/api/admin/leads') {
    if (req.headers['x-admin-secret'] !== ADMIN_SECRET) return json(res, 401, { ok: false, error: 'Não autorizado' });
    const leads = lerLeads();
    return json(res, 200, { ok: true, total: leads.length, leads });
  }

  // ===== Auto-cadastro do vendedor (checkout próprio) =====
  if (method === 'POST' && raw === '/api/vendedor') {
    const body = await parseBody(req);
    const negocio = String(body.negocio || '').trim();
    const email = String(body.email || '').trim();
    const whatsapp = String(body.whatsapp || '').trim();
    if (!negocio || !email || !whatsapp) {
      return json(res, 400, { ok: false, error: 'Preencha nome do negócio, e-mail e WhatsApp.' });
    }
    const id = 'v' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
    const token = crypto.randomBytes(6).toString('hex');
    const vendedor = {
      id,
      token,
      criadoEm: new Date().toISOString(),
      status: 'pendente',
      plano: 'Assinatura',
      qtdVendedores: 1,
      canais: ['whatsapp'],
      pagoEm: null,
      ativoAte: null,
      negocio,
      ramo: String(body.ramo || '').trim(),
      whatsapp,
      email,
      redes: String(body.redes || '').trim() || '',
      produtos: Array.isArray(body.produtos) ? body.produtos.filter(p => p && p.nome) : [],
      personalidade: {
        nomeBot: body.nomeBot || 'Severino',
        tomVoz: body.tomVoz || 'cordial',
        idiomaAtend: body.idiomaAtend || 'pt',
        horario: body.horario || '24h',
        regras: body.regras || 'Sempre ser honesto, nunca inventar preço ou prazo.'
      },
      treino: Array.isArray(body.treino) ? { texto: body.treino.join('\n'), linkRef: '' } : { texto: '', linkRef: '' },
      contexto: null,
      treinado: false,
      treinadoEm: null
    };
    const todos = lerVendedores();
    todos[id] = vendedor;
    salvarVendedores(todos);
    console.log(`[cadastro] novo vendedor ${id} — ${negocio} (${email})`);
    return json(res, 201, {
      ok: true,
      id,
      token,
      aguardandoPagamento: true,
      checkout_url: KIWIFY_CHECKOUT_URL || null,
      painel: `/painel.html?id=${id}&t=${token}`,
      message: 'Cadastro criado. Finalize o pagamento para ativar o vendedor.'
    });
  }

  // ===== Acesso do vendedor =====
  const mAccess = raw.match(/^\/api\/vendedor\/acesso\/([^/]+)$/);
  const mRetreino = raw.match(/^\/api\/vendedor\/acesso\/([^/]+)\/retreinar$/);
  const mChat = raw.match(/^\/api\/vendedor\/acesso\/([^/]+)\/chat$/);
  const id = (mAccess || mRetreino || mChat)?.[1];
  const token = q.get('t') || '';

  // ===== Webhook Kiwify: confirma pagamento e ativa vendedor =====
  if (method === 'POST' && raw === '/api/webhook/kiwify') {
    const body = await parseBody(req);
    // Valida secret se estiver configurado no .env
    if (KIWIFY_WEBHOOK_SECRET) {
      const header = req.headers['x-kiwify-signature'] || req.headers['authorization']?.replace('Bearer ', '') || '';
      if (header !== KIWIFY_WEBHOOK_SECRET) return json(res, 401, { ok: false, error: 'Falha na autenticação' });
    }
    const event = body.EventName || body.event || '';
    const email = body.CustomerEmail || body.customer_email || body.Customer?.email || '';
    const tx = body.TransactionID || body.transaction_id || body.OrderId || '';
    const valor = body.Product?.ProductValue || body.product_value || body.Purchase?.original_offer_price || 0;

    console.log(`[kiwify] event=${event} email=${email} tx=${tx}`);

    // Acha o vendedor pelo email cadastrado
    const todos = lerVendedores();
    const alvo = Object.entries(todos).find(([, d]) => (d.email || '').toLowerCase() === String(email).toLowerCase());
    if (!alvo) {
      // Pode ser compra ainda sem vendedor: registra em espera
      return json(res, 200, { ok: true, status: 'sem-vendedor', event });
    }
    const [vid, vd] = alvo;
    if (/paid|approved|completed|confirmed/i.test(event) && !vd.pagoEm) {
      vd.pagoEm = new Date().toISOString();
      vd.ativoAte = new Date(Date.now() + 30 * 86400000).toISOString();
      vd.status = 'ativo';
      vd.transacao = tx;
      vd.valorPago = Number(valor) || vd.valorPago || 0;
      salvarUm(vid, vd);
      console.log(`[kiwify] ✅ vendedor ${vid} ativado (${valor})`);
    } else if (/cancel|refund|chargeback/i.test(event)) {
      vd.status = 'suspenso';
      vd.ativoAte = null;
      salvarUm(vid, vd);
      console.log(`[kiwify] ⛔ vendedor ${vid} suspenso`);
    }
    return json(res, 200, { ok: true, event });
  }

  if (id && mAccess) {
    const v = lerUm(id);
    if (!v) return json(res, 404, { ok: false, error: 'Vendedor não encontrado.' });
    const dono = authDono(v, token);
    const pago = !!v.pagoEm && (!v.ativoAte || new Date(v.ativoAte) > new Date());

    // Não está pago: mostra só o checkout (pra dono) ou aviso (pra cliente)
    if (!pago) {
      if (dono) {
        return json(res, 200, {
          ok: false,
          aguardandoPagamento: true,
          error: 'Aguardando confirmação do pagamento.',
          checkout_url: KIWIFY_CHECKOUT_URL || null
        });
      }
      return json(res, 200, { ok: false, aguardandoPagamento: true, error: 'Vendedor indisponível no momento.' });
    }

    const publico = {
      ok: true,
      id,
      dono,
      negocio: v.negocio, ramo: v.ramo, whatsapp: v.whatsapp,
      plano: v.plano || 'Assinatura', qtdVendedores: v.qtdVendedores || 1,
      canais: v.canais || ['whatsapp'],
      pagoEm: v.pagoEm || null, ativoAte: v.ativoAte || null,
      nomeBot: v.personalidade?.nomeBot || 'Severino',
      treinado: !!v.treinado, treinadoEm: v.treinadoEm || null,
      contexto: dono ? (v.contexto || gerarContexto(v)) : (v.contexto || gerarContexto(v)),
      produtos: dono ? (v.produtos || []) : [],
      personalidade: dono ? (v.personalidade || {}) : {},
      treino: dono ? (v.treino || {}) : {}
    };
    return json(res, 200, publico);
  }

  // ===== Salvar ajustes (dono) =====
  if (id && mRetreino) {
    const v = lerUm(id);
    if (!v) return json(res, 404, { ok: false, error: 'Vendedor não encontrado.' });
    if (!authDono(v, token)) return json(res, 401, { ok: false, error: 'Token inválido.' });

    v.contexto = gerarContexto(v);
    v.treinado = true;
    v.treinadoEm = new Date().toISOString();
    salvarUm(id, v);
    return json(res, 200, {
      ok: true,
      contexto: v.contexto,
      treinadoEm: v.treinadoEm,
      tokens: ia.estimarTokens(v.contexto)
    });
  }

  // ===== Conversa (cliente ou dono) =====
  if (id && mChat) {
    const v = lerUm(id);
    if (!v) return json(res, 404, { ok: false, error: 'Vendedor não encontrado.' });
    const body = await parseBody(req);
    const pergunta = String(body.pergunta || '').trim();
    if (!pergunta) return json(res, 400, { ok: false, error: 'Mensagem vazia.' });

    // Se ainda não treinou (donos novos), gera contexto na hora
    if (!v.contexto) {
      v.contexto = gerarContexto(v);
      v.treinado = true;
      v.treinadoEm = new Date().toISOString();
      salvarUm(id, v);
    }

    const historico = Array.isArray(body.historico) ? body.historico.slice(-10) : [];
    const sistema = montarSistema(v);

    // Respostas consideradas lixo no modelo free (OpenRouter free pool ~ rotativo)
    function respostaInvalida(t) {
      const x = String(t || '').trim();
      if (!x) return true;
      if (x.length < 3) return true;
      if (/^(user safety|error|erro|n\/a|na\/|nan|undefined|null)\b/i.test(x)) return true;
      return false;
    }

    try {
      let r = await ia.perguntar({
        sistema,
        mensagens: [...historico, { role: 'user', content: pergunta }],
        modelo: 'barato',
        agente: 'severino-chat'
      });

      // Fallback: se o free devolveu lixo, tenta o modelo forte
      let tentouForte = false;
      if (respostaInvalida(r.texto)) {
        tentouForte = true;
        r = await ia.perguntar({
          sistema,
          mensagens: [...historico, { role: 'user', content: pergunta }],
          modelo: 'forte',
          agente: 'severino-chat-forte'
        });
      }

      // Avisa o dono quando o cliente demonstra interesse real (lead quente)
      if (ehLeadQuente(pergunta, historico)) {
        registrarLead(v, id, pergunta, historico, r.texto);
      }

      return json(res, 200, { ok: true, resposta: r.texto, modelo: r.modelo, fallback: tentouForte });
    } catch (e) {
      return json(res, 500, { ok: false, error: 'Erro na IA: ' + e.message });
    }
  }

  // ===== Salvar ajustes (dono) — PUT =====
  if (id && method === 'PUT' && raw.endsWith('/acesso/' + id)) {
    const v = lerUm(id);
    if (!v) return json(res, 404, { ok: false, error: 'Vendedor não encontrado.' });
    if (!authDono(v, token)) return json(res, 401, { ok: false, error: 'Token inválido.' });
    const body = await parseBody(req);

    v.negocio = body.negocio ?? v.negocio;
    v.ramo = body.ramo ?? v.ramo;
    v.whatsapp = body.whatsapp ?? v.whatsapp;
    v.email = body.email ?? v.email;
    v.redes = body.redes ?? v.redes;
    v.produtos = Array.isArray(body.produtos) ? body.produtos : v.produtos;
    v.personalidade = { ...(v.personalidade || {}), ...(body.personalidade || {}) };
    v.treino = { ...(v.treino || {}), ...(body.treino || {}) };
    v.treinado = false; // precisa retreinar
    salvarUm(id, v);
    return json(res, 200, { ok: true, message: 'Ajustes salvos. Treine o vendedor para aplicar.' });
  }

  // ===== Painel (front) =====
  if (raw === '/painel' || raw === '/painel.html' || raw === '/vendedor.html' || raw === '/') {
    if (!fs.existsSync(FRONT)) return json(res, 404, { ok: false, error: 'Front não encontrado.' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(FRONT));
  }

  // ===== Widget de atendimento (cliente final) =====
  if (raw === '/atendimento' || raw === '/atendimento.html' || raw === '/widget') {
    if (!fs.existsSync(ATENDIMENTO)) return json(res, 404, { ok: false, error: 'Widget não encontrado.' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(ATENDIMENTO));
  }

  // ===== Página de venda (landing p/ checkout Kiwify) =====
  if (raw === '/venda' || raw === '/venda.html' || raw === '/landing') {
    if (!fs.existsSync(VENDA)) return json(res, 404, { ok: false, error: 'Página não encontrada.' });
    let html = fs.readFileSync(VENDA, 'utf8');
    html = html.split('{{CHECKOUT}}').join(KIWIFY_CHECKOUT_URL || '#');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // ===== Página de cadastro em 5 passos (consultor) =====
  if (raw === '/consultor' || raw === '/consultor.html' || raw === '/cadastro') {
    const CONSULTOR = path.join(__dirname, 'consultor.html');
    if (!fs.existsSync(CONSULTOR)) return json(res, 404, { ok: false, error: 'Página não encontrada.' });
    let html = fs.readFileSync(CONSULTOR, 'utf8');
    html = html.split('{{CHECKOUT}}').join(KIWIFY_CHECKOUT_URL || '#');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // ===== Domínio próprio (Porkbun) =====
  if (method === 'POST' && raw === '/api/dominio/verificar') {
    const body = await parseBody(req);
    const dominio = String(body.dominio || '').trim().toLowerCase();
    if (!dominio) return json(res, 400, { ok: false, error: 'Informe um domínio.' });
    const safe = dominio.replace(/[^a-z0-9.-]/g, '');
    const dominioFinal = safe.includes('.') ? safe : safe + '.com';
    try {
      const r = await porkbun.verificar(dominioFinal);
      return json(res, 200, { ok: true, ...r });
    } catch (e) {
      const msg = e.message || '';
      if (/invalid tld|unsupported tld|unknown tld/i.test(msg)) {
        return json(res, 200, { ok: false, error: 'TLD não suportado pela API (use .com, .net, .org). .com.br requer registro manual.', disponivel: false });
      }
      return json(res, 200, { ok: false, error: msg, mensagem: 'Erro ao consultar. API Porkbun não configurada?' });
    }
  }

  if (method === 'POST' && raw === '/api/dominio/comprar') {
    const body = await parseBody(req);
    const dominioRaw = String(body.dominio || '').trim().toLowerCase();
    const dominio = (dominioRaw.replace(/[^a-z0-9.-]/g, '').includes('.') ? dominioRaw.replace(/[^a-z0-9.-]/g, '') : dominioRaw.replace(/[^a-z0-9.-]/g, '') + '.com');
    const vId = String(body.vendedorId || '');
    const dados = {
      firstName: String(body.nome || '').trim(),
      email: String(body.email || '').trim(),
      address1: String(body.endereco || '').trim(),
      city: String(body.cidade || '').trim(),
      state: String(body.estado || '').trim(),
      zip: String(body.cep || '').trim(),
      country: 'BR',
      phone: String(body.telefone || '').trim()
    };
    if (!dominio || !dados.email || !dados.firstName) return json(res, 400, { ok: false, error: 'Domínio, nome e e-mail obrigatórios.' });
    try {
      const r = await porkbun.comprar(dominio, dados);
      if (r.sucesso && vId) {
        const v = lerUm(vId);
        if (v) {
          v.dominioProprio = { dominio, compradoEm: new Date().toISOString(), orderId: r.orderId };
          salvarUm(vId, v);
        }
      }
      return json(res, 200, { ok: true, ...r, mensagem: 'Domínio registrado! Configure o DNS agora.' });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  if (method === 'POST' && raw === '/api/dominio/dns') {
    const body = await parseBody(req);
    const dominio = String(body.dominio || '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, '');
    const alias = String(body.alias || '').trim();
    if (!dominio) return json(res, 400, { ok: false, error: 'Domínio obrigatório.' });
    try {
      const r = await porkbun.criarCname(dominio, alias);
      return json(res, 200, { ok: true, ...r, mensagem: 'DNS configurado! ' + (alias || '@') + '.' + dominio + ' → vendedor.severinobot.com' });
    } catch (e) {
      return json(res, 200, { ok: false, error: e.message });
    }
  }

  if (method === 'GET' && raw.startsWith('/api/dominio/status/')) {
    const vId = raw.split('/api/dominio/status/')[1];
    if (!vId) return json(res, 400, { ok: false });
    const v = lerUm(vId);
    return json(res, 200, { ok: true, dominio: v?.dominioProprio || null });
  }

  return json(res, 404, { ok: false, error: 'Rota não encontrada.' });
}).listen(PORT, () => {
  console.log('🦾 SEVERINO VENDEDOR IA — validação');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 http://localhost:${PORT}/            (painel do vendedor)`);
  console.log(`🏥 http://localhost:${PORT}/api/health  (teste)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});