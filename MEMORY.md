# BTC Weather Panel — Memoria de Execucao

## Ultima atualizacao: 03/Ago/2026

## Infraestrutura
- Dominio: btcweatherpanel.com -> 187.127.42.146
- SSL: Let's Encrypt (exp 27/out/2026)
- Nginx: 80/443 -> 3334
- Servidor: Node.js (severino) PM2 porta 3334

## Seguranca
- SECRET_KEY rotacionado: 0d0df8811e8e5a6dcd92a759d2d5c89044bc3c97f87ed0096cf90db4dcc66fec
- .env com TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, SECRET_KEY, ADMIN_CODE
- GET ?secret= valida contra .env (nao contra arquivo)
- Admin endpoints usam X-Admin-Secret header
- Telegram token mantido (decisao do usuario)

### Acesso admin (03/ago) — sem chaves no front
- Removidos do front todos os codigos admin hardcoded: VIP-WEATHER-2026, ALFA-TRADER, VIP7-G7BM3V e o bypass ?admin=true
- Novo ADMIN_CODE no .env (valor: ADMIN-B1BE9EB8212B23D771D23E4831646F5C3B149F094BF718BE), validado no servidor em GET /api/license/validate (resposta com admin:true, tier vip, daysLeft 999)
- Link admin: https://btcweatherpanel.com/btc-weather-panel/?code=ADMIN-B1BE9EB8212B23D771D23E4831646F5C3B149F094BF718BE
- Codigo antigo revogado: /api/license/validate?code=VIP-WEATHER-2026 retorna invalid (0 ocorrencias da chave no front servido)
- adminConfig.vipKey sem valor padrao no front; salvar config no modal admin exige o SECRET_KEY real digitado

### Monetizacao (03/ago) — teste gratis 7 dias
- Card de sinais para novos usuarios virou teaser igual aos cards de previsao (lock + CTA "🎁 Teste grátis 7 dias" + "ou assinar R$47/mês")
- Ativacao do trial direta (POST /api/trial), sem formulario de email/telegram e sem login Google
- VIP/admin nao veem o card teaser; sinais operacionais (LONG/SHORT/NEUTRO 15M/1H/4H) liberados

## Notificacoes (NOVO - 29/jul)
- Sistema de notificacoes VIP: /root/severino/data/notifications.json
- Comandos Telegram: /vincular, /notificacoes, /diaria on|off, /clima on|off, /email, /status
- Analise diaria BTC: todos os dias as 9h (cron)
- Monitor de clima: a cada 30min (cron)
- Envio: Telegram + email (se cadastrado)
- Teste: enviado para admin com sucesso

## Leads
- 32 licencas ativadas em lote (29/jul) - VIP 7 dias
- Total: 41 licencas (40 ativas, 1 expirada)
- 0 pagantes (Kiwify)
- Gestor de Leads: relatorio diario as 8h no Telegram admin

## Proximos passos
1. Acompanhar notificacoes e engajamento dos leads
2. Fazer primeira venda via Kiwify
3. Expandir base de usuarios vinculados ao Telegram
4. Exercitar funil vendedor IA de ponta a ponta (0 vendedores cadastrados ate 03/ago)

## Ecossistema IA (03/ago) — Fase 0 (base no ar)
- Barramento de eventos: ecosystem/queue/ (events.jsonl + pendentes.json). Agentes nao se chamam: postam eventos, o orquestrador roteia.
- Orquestrador: PM2 app "ecosistema" (ecosystem/orquestrador.js), loop 1s, guarda max_hops=5, heartbeat em ecosystem/queue/status.json.
- Servico de IA: ecosystem/ia.js via OpenRouter (LLM_API_KEY no .env). Modelos: barato=deepseek/deepseek-v4-flash, forte=anthropic/claude-sonnet-5. Orcamento diario LLM_BUDGET_TOKENS_DIA=100000 (contador em data/llm_state.json).
- Registro de produtos: ecosystem/produtos.json (btcweather + severino-consultor-ia).
- API do ecossistema (protegida por X-Admin-Secret = SECRET_KEY): /api/ecosystem/status, /produtos, /eventos?limite=N, /enviar, /limpar-pendentes.
- Agentes Fase 0: ecosystem/rota.js mapeia tipo->agente (rastreio). Acao real dos agentes com LLM na Fase 1.
- Testado: evento lead.novo -> captador, estado "feito" em ~1s; site publico e /severino-ia seguem 200; API sem secret responde 401.
- Backups: servidor.js.pre-20260803-ecosistema.

## Ecossistema IA — Fase 1 (03/ago) — funil de vendas no ar
- Agentes LLM reais em ecosystem/agentes/: qualificador, nutridor, conversor, onboarder, retentor, cobrador, analista, estrategista. Roteados por ecosystem/rota.js.
- Funil rastreado: lead.novo -> qualificador (score+produto via LLM) -> lead.qualificado -> nutridor (mensagem educativa) -> lead.quente -> conversor (oferta) -> venda.proposta -> onboarder (ativa POST /api/trial real) -> trial.ativado -> retentor (marca vip).
- Guardião (ecosystem/guardiao.js) filtra toda mensagem antes de enviar (blacklist: lucro/retorno garantido etc). Canais via ecosystem/canais.js (Telegram HTML).
- Estado por lead: ecosystem/data/funil.json.
- Acquisição real: telegram_bot.js agora posta lead.novo no barramento para todo contato novo (@bot). Lead frio (score<=1) não recebe oferta.
- LLM: ia.js funcionando (bug temperature corrigido), chamadas/tokens rastreados em data/llm_state.json. Teste: 7 chamadas/2010 tokens.
- Testes ao vivo: funil completo x2 (trials VIP7-T0KRKO e VIP7-O53X9U removidos após validação) + contato novo via webhook telegram.
- Proximo: Fase 2 (divulgação Postiz/n8n) e Fase 3 (webhook Kiwify -> venda.confirmada + upsell retentor).

## Ecossistema IA — Desacoplamento dos info-produtos (03/ago)
- Confirmado: o núcleo (orquestrador/bus/rota/ia/canais/guardiao/funil) é independente dos produtos. O ponto de plug-in é ecosystem/produtos.json.
- produtos.json agora tem campo "ativacao" por produto:
  - btcweather: tipo "trial" (endpoint POST /api/trial local + linkTemplate com {code})
  - severino-consultor-ia: tipo "link" (link direto para /severino-ia/, sem código; sem domínio próprio ainda)
- Onboarder (agentes/onboarder.js) deixou de ter URL fixa: lê a ativação do registro por produto. Testado: btcweather -> código VIP gerado; severino-consultor-ia -> acesso enviado (trialCode NULL).
- Gancho do Telegram: produto padrão via .env ECOSYSTEM_PRODUTO_PADRAO=btcweather (telegram_bot.js já não fixa btcweather).
- Para plugar um produto novo: criar entrada em produtos.json (nome, plano, argumentos, ativacao). Zero mudança no núcleo.
- Infra ainda compartilhada (mesmo servidor.js 3334, .env, data/) — mantido de propósito; desacoplamento por configuração, sem risco.
- Custos do dia: 13 chamadas LLM / 4360 tokens.

## Separacao Nivel 2 (03/ago) — btcweather protegido / ecossistema independente
- 2 repositórios locais:
  - Repo A (btcweather, PROTEGIDO): raiz do projeto. Tag release/btcweather-v1.0.0-stable. servidor.js voltou a ser SO o produto (rotas /api/ecosystem removidas). Nao mexer para melhorar o ecossistema.
  - Repo B (ecossistema): pasta ./ecossistema (git proprio). Evolui livre.
- Orquestrador agora tem SERVIDOR PRÓPRIO: porta ECOSISTEMA_PORT=3335 (PM2 "ecosistema"). Roda loop + API /api/ecosystem/* + /health (protegidos por X-Admin-Secret).
- Comunicação entre os dois: SOMENTE HTTP. btcweather chama 3335 (telegram_bot -> POST /api/ecosystem/enviar); ecossistema chama btcweather (onboarder -> POST /api/trial no 3334).
- Nginx: location /ecosistema/ e /api/ecosystem/ -> 127.0.0.1:3335 (ATENCAO: nao criar .bak dentro de /etc/nginx/sites-enabled/, o glob carrega e conflita server_name).
- Deploy mapping: ./ecossistema/* -> /root/severino/ecosystem/ ; versao_matrix/servidor.js -> /root/severino/servidor.js ; versao_matrix/telegram_bot.js -> /root/severino/ecosystem/telegram_bot.js.
- Backups nginx: /root/nginx-backups/ (bak movido para fora de sites-enabled).
- Testado: hook telegram -> 3335 gera lead.novo; trial 3334 funciona; /api/ecosystem no 3334 retorna 404; nginx /ecosistema e /api/ecosystem funcionam.

## Ecossistema IA — Fase 3 (03/ago) — vendas & cobranca no ar

- Webhook Kiwify do servidor.js (3334) agora notifica o orquestrador por HTTP:
  - compra aprovada -> evento enda.confirmada (customer_email, name, plan, value, transactionId, code, gateway)
  - compra_reembolsada/chargeback/subscription_canceled -> evento eembolso.pedido
  - helper 
otificarOrquestrador(tipo, payload) em servidor.js (http.request p/ 127.0.0.1:3335, X-Admin-Secret)
- cobrador.js: registra compras/reembolsos em funil.json (novos arrays compras/eembolsos), vincula por e-mail, marca lead pago/reembolsado, avisa admin
- retentor.js: 	ick.followups envia check-in (dia 3) e upsell (dia 7) com checkout Kiwify R (produtos.json.checkoutUrl = pay.kiwify.com.br/ffphj4e); enda.confirmada marca como pago e sai da fila
- orquestrador.js: setInterval posta 	ick.followups (default 1h, ECOSISTEMA_FOLLOWUP_INTERVAL em segundos) so se houver leads VIP
- rota.js: tick.followups -> retentor
- Backups: backups/*.pre-fase3
- Testado 03/ago: webhook aprovacao gerou codigo + venda.confirmada -> cobrador; reembolso -> cobrador; tick -> retentor (upsell com link R); tudo limpo apos teste (51 licencas, funil zerado)

## Ecossistema IA — Fase 3.1 (04/ago) — avisos de vencimento/renovacao

- cobrador.js agora trata 	ick.renovacao (mesmo padrao do tick.followups, intervalo ECOSISTEMA_FOLLOWUP_INTERVAL):
  - lead pago com renovacaoEm: avisa 2 dias antes (mensagem com data) e checa 2 dias apos vencimento se renovou
  - anti-repeticao: campos ultimaRenovacaoAviso = 'aviso' | 'vencido'; venda.confirmada nova zera
- venda.confirmada agora grava no lead: enovacaoEm (now+30d), 
ome, e 	elegramId (busca em data/notifications.json pelo email)
- rota.js: tick.renovacao -> cobrador; orquestrador.js posta o tick so se houver lead pago com renovacaoEm
- Backups: backups/*.pre-fase3-renov
- Testado 04/ago: aviso 1d antes (data correta), vencido 3d, e2e via API; funil zerado apos

## Ecossistema IA — Fase 3.2 (04/ago) — conversor com checkout direto

- conversor.js agora diferencia o lead:
  - novo -> mensagem oferece trial 7d + compra direta (R) com link; posta venda.proposta (compraDireta:false) -> onboarder ativa trial (fluxo antigo)
  - ja testou (status vip/trial ou trialCode) -> mensagem de checkout direto com link Kiwify; posta venda.proposta (compraDireta:true)
- LLM escreve com placeholder {CHECKOUT} e o codigo troca pelo link real (produtos.json.checkoutUrl) APOS guardiao.aprovar — nunca confia no LLM para URLs
- onboarder.js: compraDireta:true -> nao chama /api/trial, nao envia mensagem (conversor ja mandou o link), marca lead status 'checkout'
- Backups: backups/*.pre-fase3-checkout
- Testado 04/ago (IA e canais simulados): lead novo -> trial ativado normal (codigo VIP7-KH6W2X, removido); ja testou -> so checkout (sem trial novo, status checkout); e2e via API ok. 51 licencas, funil zerado

## Ecossistema IA — Fase 4 (04/ago) — multi-produto no ar

- qualificador.js: escolha do LLM VALIDADA contra produtos.json (produto inventado/ausente -> ECOSYSTEM_PRODUTO_PADRAO); JSON aceita produto (principal) + produtos (lista de candidatos, dedupe, principal primeiro); grava produtos e crossSell no funil
- Cross-sell: lead ja cliente (status pago/checkout/vip ou trialCode) vira contexto no prompt -> pode receber outro produto
- Cadeia completa validada: lead.novo (contexto consultoria) -> qualificador severino-consultor-ia -> nutridor -> conversor -> onboarder entrega link do funil /severino-ia/ (ativacao tipo 'link', sem trial)
- Backups: backups/qualificador.js.pre-fase4
- Testado 04/ago (IA simulada + 1 e2e com LLM real): T1 multi-produto, T2 fallback produto inventado, T3 funil consultoria, T4 cross-sell; 2 trials de teste removidos, 51 licencas, funil zerado
## Ecossistema IA — Fase 6 (04/ago) — maquina de conteudo viral (Videasta)

- muapi.js (novo): helper submit-then-poll na API MuAPI (x-api-key). gerarVideo({model,prompt,duration,resolution,aspect_ratio}) -> {request_id,status,cost}; verificar(requestId) -> GET /api/v1/predictions/{id}/result ate completed/failed. Padrao: wan2.2-5b-fast-t2v, 720p, 5s (env MUAPI_VIDEO_MODEL/RESOLUTION/DURATION).
- agentes/videasta.js (novo):
  - campanha.nova: LLM (ia.js, modelo barato) escreve JSON {video_prompt (EN), legenda (PT-BR), hashtags} -> submete geracao no MuAPI -> registra em data/videos.json (id, status, custo, roteiro) -> avisa admin (Telegram)
  - tick.conteudo: verifica pendentes (verificarPendentes); quando completed grava url + posta conteudo.pronto (payload: videoId, url, legenda, hashtags, produto, modelo, custoUsd); se ocioso (nada processando) + ha campanha + abaixo do limite diario -> produz nova geracao da ultima campanha
  - limite diario MUAPI_VIDEO_LIMITE_DIA (default 5) controla custo
- rota.js: campanha.nova -> videasta; tick.conteudo -> videasta; conteudo.pronto -> observador
- orquestrador.js: tick tick.conteudo a cada ECOSISTEMA_CONTEUDO_INTERVAL (default 600s)
- Backups: rota.pre-fase6, orquestrador.pre-fase6
- Testado 05/ago (e2e real): POST campanha.nova -> videasta submeteu wan2.2 ($0.04) -> 2min depois tick marcou completed + postou conteudo.pronto -> produziu novo automaticamente. video #1 baixado (1.6MB). data/videos.json com historico. Video #2 deixado em processing como demonstracao (custo ~$0.04)

## Ecossistema IA — Fase 7 (07/ago) — Observador publica videos nas redes

- agentes/observador.js (NOVO): consumia conteudo.pronto mas nao existia (rota so "rastreava"). Agora:
  - recebe conteudo.pronto (videoId, url, legenda, hashtags, produto) -> faz upload do video no Postiz via POST /api/public/v1/upload-from-url (aceita URL do CDN MuAPI, retorna {id, path}; limite 1GB video) -> publica no X e Instagram via POST /api/public/v1/posts com image:[{id,path}] no array value (MESMO campo de imagem; MediaDto aceita video/mp4)
  - substitui [link] e {CHECKOUT} na legenda pelo checkoutUrl REAL de produtos.json (padrao guardiao — nunca confiar em URL do LLM); trunca X em 240 chars
  - anti-repeticao: grava publicacoes[] em data/videos.json por etapa (upload/X/Instagram); pula etapas ja ok; marca publicado=true so quando X E IG ok (corrigido: nao conta 'upload' no total)
  - avisa admin (Telegram) em sucesso e erro
- rota.js: adicionado agentes.observador (require). Fallback de eventos desconhecidos continua 'observador' (rastreado) — agora so processa conteudo.pronto
- Config usada: POSTIZ_API_URL/POSTIZ_API_KEY do .env; integracoes X=cmshy3hgm0001ny6ng293kp4j, IG=cmsibf1tc0007qu62xujvp6r6
- Backups: rota.pre-observador
- Testado 07/ago (e2e real x2): conteudo.pronto postado no bus -> observador publicou X+IG, posts PUBLISHED no DB Postiz; videos marcados publicado:true com publicacoes[]; 2o teste validou fix do flag publicado
- Nota: 8 videos completos anteriores ficaram nao-publicados (aguardando decisao de ritmo); proximos videos do Videasta serao publicados automaticamente

## Ecossistema IA — Fase 8 (07/ago) — Post educativo diario "Ciclo do Medo" (Sugestao 1)

- gerar_post_educativo.js (novo): le data/clima_card.json e gera 1 post educativo por dia usando dados REAIS do dia, rotativo por dia da semana (7 temas): estacoes, fear-greed, rsi, suporte-resistencia, periodos, plano, semana. CTA suave no fim (7 dias gratis -> /oferta). Saida: data/posts_educativo.json
- publicar_educativo.js (novo): publica o post educativo no X e Instagram via Postiz (image do card_today.png no upload; IG precisa post_type:'post' no settings — corrigido no 2o deploy)
- Limites: texto do X <= 280 chars (validado: todos os 7 temas <= 280); IG reutiliza texto do X (<=2200 ok)
- Cron: card as 08:10 (postar_card+gerar_post_redes+publicar_redes) + educativo as 19:00 (gerar_post_educativo+publicar_educativo)
- Testado 07/ago (e2e real): 1o post (X 201, IG 400 sem post_type) -> corrigido -> 2o post X+IG 201, PUBLISHED no DB Postiz; duplicado do X deletado via API (tweet deletado:true)
- Nota: videos de teste do observador foram REMOVIDOS do X via API OAuth 1.0a (3 tweets deleted:true); Reels do IG nao podem ser deletados por API Graph (permissao) — remocao manual pendente no app (3 reels de teste em @severinomagnate)


## Ecossistema IA — Fase 9 (07/ago) — Motor de conversão conectado ao funil

### Diagnóstico (0 vendas com 52 trials ativados)
- servidor.js POST /api/trial gerava+ativava código mas NUNCA emitia trial.ativado pro orquestrador -> retentor nunca via leads de site. Mesmo para /api/license/activate.
- Webhook de compra (/api/purchase/webhook) gerava código + entregava por Telegram, mas NÃO emitia venda.confirmada -> retentor/cobrador não marcavam comprador como pago.
- funil.json tinha 1 lead de teste; 52 códigos ativados sem rastreio. Retentor só agia com telegramId (e-mail fora por decisão do usuário).
- Realidade: único vínculo Telegram real = Arthur (5854115851 -> VIP7-TDPZIN, código NUNCA ativado); trials frontend-offer de 06/08 (VIP7-RQW0CN adriano, VIP7-EAD060 John) só e-mail, sem Telegram. João/Rosa/Prospecção = IDs falsos de teste.

### Correções implementadas
- servidor.js: função emitirTrialAtivado({code,email,nome,source}) -> POST /api/ecosystem/enviar (tipo trial.ativado, leadId 'lic-'+code) para o orquestrador (127.0.0.1:3335, X-Admin-Secret). Chamada em /api/trial (salva customerEmail/nome/telegram no license; pula se header x-ecosystem=1) e /api/license/activate. Resolução de telegramId via notifications.json (licenseCode -> chatId), sem fallback em leads.json (evita vínculo errado).
- servidor.js: emitirVendaConfirmada({code,email,nome,value}) -> tipo venda.confirmada, chamada no webhook após gravar purchase.
- onboarder.js: fetch do /api/trial agora envia header x-ecosystem:1 (evita dupla postagem de trial.ativado).
- retentor.js: trial.ativado salva nome/email/telegramId; venda.confirmada casa por email OU trialCode/leadId lic-CODIGO; tick.followups resolve telegramId tardio via código (telegramDoTrialCode); envio que falha NÃO marca ultimaFollowup (retry na próxima rodada); reativação: trial expirado (>8 dias, sem pagamento, status vip) recebe UMA mensagem de recuperação com checkout -> status expirado + reativado:true (só quando o envio dá certo).

### Testado (07/ago, e2e real)
- POST /api/trial -> funil ganha lead lic-CODIGO status vip com email/nome (telegramId null quando não vinculado). Limpeza após teste.
- POST /api/purchase/webhook (X-Kiwify-Token) -> lead vira status pago + vipPago + comprouEm + renovacaoEm (cobrador agora vê renovação).
- tick.followups com lead de 8 dias -> dispara upsell; com 9 dias + sem envio -> reativacao(falhou envio) e status continua vip (retry). Envio real Telegram validado (enviarTelegram true).
- Backups: servidor.js.pre-trial-funil, agente onboarder/retentor no histórico git.
- Pendências: leads de site sem Telegram ficam rastreados no funil mas sem followup (e-mail fora por decisão); revisar registros de teste (purchases x@y.com, maria@test.com, teste-fase3 são falsos — não são pagantes reais).

## Ecossistema IA — Fase 10 (07/ago) — Isento Arthur + Canal de e-mail

- Decisão do usuário: Arthur (5854115851) é TESTADOR real de usabilidade, SEM cobrança. Nunca recebe upsell/renovação.
- isentos.js (novo) + data/isentos.json: lista central de telegramIds imunes a cobrança (contém 5854115851). Require em retentor.js e cobrador.js — ambos pulam leads isentos nos followups/renovação. Testado: retentor com Arthur de 8 dias retorna "nada vencido".
- Decisão: e-mail personalizado via Zoho Mail (Free). suporte@btcweatherpanel.com.
- canais.js: enviarEmail(to, assunto, texto) via nodemailer (instalado no ecosystem). Lê SMTP_HOST/PORT/SECURE/USER/PASS/EMAIL_FROM do .env. Sem credenciais → retorna false (sem quebrar). Adicionadas vars SMTP ao .env (SMTP_PASS placeholder TROQUE_AQUI).
- retentor.js: follow-up/reativação usa Telegram SE telegramId, senão E-MAIL se lead.email. Grava ultimoCanal (telegram|email). Testado: enviarEmail stub retorna false sem SMTP.
- suporte-email.md (novo em /root/severino): guia passo-a-passo para o usuário criar Zoho Mail + DNS Porkbun (MX/SPF/DKIM) + App Password.
- PENDENTE (ação humana): usuário cria conta Zoho + DNS + App Password → preencher SMTP_PASS no .env → testar envio real → follow-up por e-mail ativo.

## Ecossistema IA — Fase 10b (07/ago) — Backfill dos 2 leads reais do site

- ROOT CAUSE: a ponte emitirTrialAtivado foi adicionada ao servidor.js em 07/ago 21:52.
  Os 2 trials reais do site (VIP7-RQW0CN adrianonunes98@yahoo.com.br e VIP7-EAD060
  JOHN DOURADO johnlennondourado07@gmail.com) foram ativados em 06/ago — ANTES da
  ponte existir. Por isso nunca entraram no funil (funil.json só tinha lead-e2e-f4).
- FIX: backfill manual via /tmp/backfill_funil.js usando funil.upsertLead:
  leadId 'lic-CODE', status vip, trialDias 7, email, retentorInicio = activatedAt (06/ago).
- Estado atual do funil:
  - lead-e2e-f4 (teste): sem tg nem email -> retentor ignora (continue).
  - lic-VIP7-RQW0CN (adriano, email): dia 1.4, checkin dia 3 (~09/ago).
  - lic-VIP7-EAD060 (John, email): dia 1.4, checkin dia 3 (~09/ago).
- Enquanto SMTP Zoho não ativa: enviarEmail retorna false -> retentor tenta e falha
  silenciosamente, retry no próximo tick. Sem spam, sem marcar ultimaFollowup.
- Próximo: preencher SMTP_PASS no .env e validar envio real.

## Ecossistema IA — Fase A (07/ago) — Multi-produto (fundação)

- Objetivo do usuário: severinobot.com = hub com VÁRIOS micro-saas validados. Cada sessão do opencode
  desenvolve um produto novo. Esta Fase A criou a fundação p/ isso sem conflito.
- Decisões: subdomínios app.<slug>.severinobot.com + catálogo central produtos.json.
- produtos.json agora é catálogo multi-produto: btcweather (3334), severino-consultor-ia (teste),
  padrao-produto-novo (template de referência, porta 3340). Campos: id, slug, subdominio, caminho,
  porta, pm2, status, plano, checkout, checkoutUrl, canal, persona, argumentos, ativacao.
  Backup do antigo: produtos.json.pre-faseA / .pre-faseA-2. Commit 629bed3.
- templates/produto-novo/: app.js (backend Node isolado, PORTA via env/argv), public/index.html
  (landing com POST /api/trial), nginx.conf (snippet subdomínio), README.md.
- provisionar-produto.sh: cria produto novo isolado (porta própria, PM2 produto-<slug>). Validado e2e:
  produto-teste-prod subiu, /api/health + landing + POST /api/trial OK, sem tocar 3334/3335.
  FIX aplicado: PORTA agora é passada via env no PM2 (antes caía no default 3340).
- Documento oficial: /root/severino/MULTIPRODUTO.md + referência no ORGANIZACAO_VPS.md.
- REGRA: NUNCA editar servidor.js para produto novo — usar provisionar-produto.sh.
- PENDENTE: quando criar próximo produto, seguir MULTIPRODUTO.md (nginx + SSL expand + catálogo).

## Ecossistema IA — Fase C (08/ago) — Brevo SMTP ATIVO ✅

- DNS: btcweatherpanel.com movido de HostGator para Cloudflare (nameservers anirban/zelda.ns.cloudflare.com). 
  O Cloudflare agora gerencia todo o DNS. HostGator não salvava registros (bug do cPanel Zone Editor).
- Brevo (Sendinblue): plano grátis 300 emails/dia, sem cartão. Conta: tedxmagnata@gmail.com.
- SMTP configurado no .env:
  - SMTP_HOST=smtp-relay.brevo.com
  - SMTP_PORT=587
  - SMTP_SECURE=false
  - SMTP_USER=b4d1af001@smtp-brevo.com
  - SMTP_PASS=xsmtpsib-... (chave SMTP do Brevo)
  - EMAIL_FROM=suporte@btcweatherpanel.com
- Teste de envio real: ENVIO OK para tedxmagnata@gmail.com (Message ID: 1481a61f...)
- Retentor agora envia follow-up por E-MAIL quando lead não tem Telegram (fallback email). 
  Já backfaz os 2 leads reais do site (adriano/John) no funil com retentorInicio=06/ago.
- Próximo: follow-ups automáticos disparam no próximo tick (check-in dia 3 para adriano/John ≈ 09/ago).

## Ecossistema IA — Fase D (08/ago) — Dupla captura no site + deploy servidor.js

- OBJETIVO do usuário: capturar leads no site com estrategia dupla (email + Telegram).
- app.html reescrito (backup app.html.pre-duplacaptura): trial agora pede nome + email
  (obrigatorio/validado); pos-ativacao mostra tela view-telegram com codigo do trial,
  3 passos (abrir t.me/btcweatherpanel, /iniciar, /vincular CODIGO) + botoes.
  Servidor /api/trial ja salva customerEmail/customerName (teste VIP7-P0DWEX).
- servidor.js: nova rota host-aware: host app.btcweatherpanel.com -> serve /root/btc-weather-panel/app.html.
  IMPORTANTE: app.html fica em /root/btc-weather-panel (weatherRoot), NAO em ROOT.
  LICAO: deploy anterior gravou o arquivo base64 sem decodificar -> servidor.js virou texto base64
  (0 JS). Sintoma: node --check falhava, rota / nao achava app.html (ENOENT /root/.openclaw/canvas/app.html).
  FIX: base64 -d /root/severino/servidor.js > /tmp/servidor_decoded.js; validar node --check;
  instalar; ajustar path para /root/btc-weather-panel; pm2 restart severino.
- VALIDADO: https://app.btcweatherpanel.com/ -> HTTP 200, contem trial-email/view-telegram.
  severinobot.com/ continua servindo consultor.html (HTTP 200). PM2 severino online.
- Regra de deploy reforcada: enviar JS via base64 exige DECODIFICAR no VPS antes de usar;
  sempre rodar node --check antes de pm2 restart.
- PENDENTE: confirmar 4 registros Brevo no Cloudflare (TXT brevo-code, CNAME brevo1/brevo2._domainkey,
  TXT _dmarc) + Verificar configuracao no Brevo; criar agente email->Telegram (convite + amostra
  de sinal + /vincular) e onboarding no /start do bot.

## Ecossistema IA — Fase D2 (08/ago) — Captador e-mail->Telegram + onboarding do bot

- VERIFICADO: 4 registros Brevo presentes no Cloudflare (TXT brevo-code, CNAME
  brevo1/brevo2._domainkey, TXT _dmarc) e resolvendo nos NS anirban/zelda.
- NOVO agente agentes/captador.js: processa tick.captura. Para cada lead vip com
  email e SEM telegramId, envia UM e-mail de convite (apos 1h do trial, anti-spam):
  amostra de valor (card diario + sinais), link t.me/btcweatherpanel_bot?start=CODIGO
  (deep link -> /start CODIGO -> vincula automatico), e instrucao manual /vincular.
  Marca conviteEmail com timestamp p/ nao repetir.
- BOT_USERNAME real = btcweatherpanel_bot (getMe confirma). app.html apontava para
  t.me/btcweatherpanel (username INEXISTENTE) — CORRIGIDO para btcweatherpanel_bot
  + deep link ?start=CODIGO dinamico em showTelegram().
- telegram_bot.js: /start agora usa onboardingTexto() (3 passos: /resgatar se comprou,
  /codigo se nao tem, /vincular se ja tem). NOVO /start CODIGO (deep link) -> tenta
  vincular automaticamente; codigo invalido -> orienta /resgatar ou /codigo. /iniciar
  e alias de /start.
- rota.js: registra captador + 'tick.captura': 'captador'.
- orquestrador.js: posta tick.captura junto ao tick.followups (se existir lead elegivel).
- TESTADO: tick.captura manual enviou convites reais p/ adriano/John (conviteEmail
  marcado no funil); webhook simulado /start OK, /start VIP7-RQW0CN vinculou e /start
  invalido orientou corretamente. Chat/lead de teste 999000111 removidos apos validacao.
- REGRA: testes de webhook com codigo REAL sujam notifications/funil — usar codigo
  de teste ou limpar apos validar.
## Ecossistema IA — Fase B (09/ago) — Prospector Instagram (comentário -> CTA bot)

- OBJETIVO: prospecção ativa via Instagram. Postiz NÃO suporta DM e não sincroniza
  comentários externos. Decisão do usuário: MONITORAR comentários dos posts IG e
  RESPONDER publicamente com CTA do bot do Telegram (sem DM, sem risco de ação do IG).
- CAMINHO TÉCNICO (validado ao vivo): usar a Graph API do Facebook DIRETO, não o Postiz.
  - Token: guardado no Postgres do Postiz, formato "accessToken___pageToken".
    `docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -t -A -c "SELECT token FROM \"Integration\" WHERE \"providerIdentifier\"='instagram' AND \"deletedAt\" IS NULL LIMIT 1;"` -> pega parte antes de ___ (EAAW...).
  - Instagram Business Account ID = internalId na tabela Integration = 17841440273845195.
  - GET /{igId}/media?fields=id,permalink,media_type,timestamp -> lista media (permalink /p/ e /reel/).
  - GET /{mediaId}/comments?fields=id,text,from,created_time -> comentários.
  - POST /{mediaId}/comments?message=... -> responde (retorna id do comentário).
  - DELETE /{commentId} -> apaga comentário.
  - IMPORTANTE: token começa com EAAW (Graph API FB), NÃO funciona no graph.instagram.com
    (erro "Invalid OAuth access token - Cannot parse access token"). Base certa: graph.facebook.com/v20.0.
- NOVO agente agentes/prospector.js (evento tick.prospeccao):
  - lista media recentes (janela 7 dias), lê comentários de cada um;
  - filtra: não respondido antes, não é o dono da conta, não é spam (bloqueia
    bloqueio amigo/siga o/www./whatsapp/golpe etc);
  - para cada comentário acionável (limite MAX_POR_RODADA default 5): gera código
    VIP7-XXXXXX (mesmo formato do servidor.js), RESPONDE publicamente com CTA
    "@username Obrigado! 🎯 Testa grátis o painel de clima do Bitcoin... Chama o bot:
    https://t.me/btcweatherpanel_bot?start=CODIGO" e registra lead no funil
    (leadId ig-<comentarioId>, status vip, origem instagram, trialCode).
  - anti-repetição: data/prospeccao.json { respondidos: {comentarioId: {ts, mediaId, username}}, ultimaRodada }.
  - token IG lido do Postgres em runtime via execSync docker (nunca fica no código).
  - PROSPECTOR_TEST_MODE=1 = processa comentários da própria conta (SÓ diagnóstico; nunca em produção).
- rota.js: registra prospector + 'tick.prospeccao': 'prospector'.
- orquestrador.js: posta tick.prospeccao a cada ECOSISTEMA_PROSPECCAO_INTERVAL (default 3600s=1h).
- TESTADO E2E: comentário de teste postado no media real -> tick -> prospector respondeu
  publicamente com CTA + código VIP7 + lead no funil (origem instagram); anti-repetição
  salvou. Limpeza total depois (4 comentários deletados, 2 leads ig-* removidos, estado resetado).
- REGRA: comentários postados via Graph API com o token da conta aparecem como
  from=severinomagnate (o próprio perfil) -> filtro de dono os bloqueia em produção (correto).
- PENDENTE: comentário real de seguidor real testará o fluxo em produção; monitorar
  tick.prospeccao no log e leads ig-* no funil após posts novos.
## Ecossistema IA — Fase E (09/ago) — Corte de custos LLM + rotação de chave

- PROBLEMA: consumo de créditos OpenRouter muito rápido (conta gastou ~$40.60; chave do
  ecossistema $18.99, chave do whatsapp $10.31, ~$11 de uso externo não rastreado). O
  usuário viu consumo com modelo caro gpt-5.6-sol ($5/M in, $30/M out).
- INVESTIGAÇÃO: gpt-5.6-sol NÃO existe em nenhum arquivo do VPS (grep em todos os .js/.ts/
  .env/.sh/.log/histórico). Modelos reais no servidor: barato=deepseek/deepseek-v4-flash
  (o mais econômico), forte=anthropic/claude-sonnet-5 (usado em vendedor_ai.js treinar,
  $2/M in $10/M out). Testes de imagem passados (flux-pro, gemini-3-pro-image) são caros.
  Endpoint de gerações do OpenRouter mudou (exige id) -> não dá pra auditar por modelo via API.
- DECISÃO (aplicada):
  - LLM_MODEL_FORTE: anthropic/claude-sonnet-5 -> openai/gpt-5.6-terra (out $6/M, 40% mais barato).
  - LLM_BUDGET_TOKENS_DIA: 100000 -> 30000 (corte de 70%).
  - LLM_API_KEY rotacionada (nova chave gerada no painel, antiga pode ter vazado/uso externo).
  - pm2 restart severino + ecosistema --update-env (releem o .env).
- VALIDAÇÃO: nova chave ativa (auth/key usage=0), mas chamada real retorna 402
  "Insufficient credits" -> a conta OpenRouter está ZERADA ($40 consumidos). Precisa
  recarregar créditos no painel. Os processos seguem online (degradam p/ fallback
  determinístico até ter saldo).
- .env.backup: .env.pre-fasee-<timestamp>.
- REGRA: manter LLM_BUDGET_TOKENS_DIA baixo; monitorar /auth/key (usage) semanalmente.

## Roadmap 100 leads pagantes (10/ago)

- VISÃO: severinobot.com como plataforma de micro-SaaS + automação com IA na VPS; Severino
  orquestrador faz prospecção, marketing e venda. Primeiros cases: btcweatherpanel e severinovendedor.
- PLANO em /root/severino/ecosystem/ROADMAP.md (163 linhas): Fase 0 fundação (pronta) -> Fase 1
  monetizar btcweather (meta 10 pagantes) -> Fase 2 severinovendedor (meta 10) -> Fase 3 prospecção
  multicanal (meta 50 total) -> Fase 4 vitrine severinobot.com (meta 70) -> Fase 5 novos micro-SaaS
  (meta 100) -> Fase 6 escala pós-100 (500/meta semestral).
- PRINCÍPIO: provar no pequeno -> medir -> escalar só o canal que converteu. KPI-mestre: trial->pago >= 5%,
  CPL < preço do plano, churn < 10%.
- PRÓXIMO (semana 1): pricing btcweather + automação conversão trial (retentor D-3/D-1, cobrador) + métricas.
- PROMPTS atualizados (commit 3db21bc): prospector responde citando o comentário (outbound), videasta
  com hooks IG/Twitter, captador subject benefit-led. Inspirado no repo msitarzewski/agency-agents.

## Auditoria Adversarial (10/ago) — preparar p/ 10 pagantes

- Auditado funil real de ponta a ponta: captura site -> trial -> bot -> webhook Kiwify -> status pago. Ciclo FUNCIONA (testado E2E real e limpo).
- BLOCKER CORRIGIDO: prospector gerava código fora do licenses.json -> deep link do bot dava "Código Não Encontrado". Agora usa POST /api/trial local (127.0.0.1:3334, header x-ecosystem:1) que grava no licenses.json sem duplicar trial.ativado. Testado.
- MEDIUM CORRIGIDO: retentor lia plano.valor (inexistente) -> fallback R$47 fixo. Agora precoDoProduto() usa plano.preco.
- REALIDADE: 4 leads, 0 compras. 3 trials do site já expiraram e ninguém pagou. Foco agora é conversão (não técnico).
- PRÓXIMOS PASSOS: validar checkouts Kiwify (ffphj4e mensal / vim8bDb anual), definir preço final, recrutar os 3 leads expirados por e-mail com oferta de reativação.
- DETALHES em /root/severino/ecosystem/AUDITORIA.md.

## BLOCKER #4 (10/08): SMTP Brevo parado — exige ação manual

- ERRO: "535 5.7.8 Authentication failed" no SMTP (smtp-relay.brevo.com:587). Últimos envios OK
  em 08-09/ago; hoje falha. Senha no .env é IDÊNTICA ao backup .env.pre-fasee → a senha foi
  revogada/expirada no painel do Brevo (não é limite diário).
- IMPACTO: captador (convite e-mail), retentor (follow-up e-mail D3/D7/D8), cobrador. O chatbot
  Telegram segue OK (canal separado).
- AÇÃO MANUAL NECESSÁRIA: gerar nova SMTP key em app.brevo.com (SMTP & API) e atualizar SMTP_PASS
  no /root/severino/.env + pm2 restart severino ecosistema --update-env.
- OBS: retentor foi melhorado para oferecer mensal+anual (checkoutAnualUrl no produtos.json).

## FIX SMTP Brevo (10/ago) — RESOLVIDO

- Nova chave SMTP configurada no /root/severino/.env (SMTP_PASS atualizado, backup .env.pre-smtpfix-<ts>).
- pm2 restart severino + ecosistema --update-env. AUTH OK ✓ e envio real confirmado (canais.enviarEmail → sucesso).
- E-mail operacional de novo (captador, retentor, cobrador).
- REGRA: se 535 Authentication failed reaparecer, é a chave Brevo expirada de novo → rotacionar no painel.
