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
