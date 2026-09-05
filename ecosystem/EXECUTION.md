# ECOSSISTEMA SEVERINO — EXECUTION.md (v1.0)
> Máquina de vendas IA 24/7 de info-produtos, rodando no mesmo VPS, com agentes de IA que conversam entre si. Começa com o **BTC Weather Panel** e abre espaço para o **SeverinoConsultorIA**.

---

## 1. RED LINES (herdadas de EXECUTION.md — nunca violar)

1. Ética cristã: nenhuma mensagem enganosa, imoral ou ilegal (filtro obrigatório do Guardião em toda saída).
2. Menor custo de LLM possível (modelo barato por padrão; modelo forte só quando necessário).
3. Nunca expor segredos/chaves/dados de clientes em logs públicos ou HTML client-side.
4. Garantia honrada: insatisfeito → reembolso automático, sem perguntas.
5. Autonomia primeiro (bot resolve; humano só se não houver caminho automático).
6. Rate limiting + orçamento de tokens/dia sempre ativos (Guardião de Custos).
7. Nunca deixar fila de eventos ou servidor sem health check ativo.

---

## 2. O QUE JÁ EXISTE NO VPS (base atual)

- **Servidor:** `servidor.js` (PM2 `severino`, porta 3334, nginx 443). Já tem: `/api/trial`, `/api/license/*`, `/api/lead`, `/api/weather/config`, autopilot integrado (health, reembolsos, custos, backups).
- **Agentes atuais** (`/root/severino/ecosystem/agents/`): `analista`, `captador`, `conversor`, `onboarder`, `qualificador`, `retentor` — **scripts simples por cron** (mensagens fixas, pontuação por palavras). Não usam LLM, não conversam entre si.
- **Cron:** onboarder 9:30 · retentor 10:00 · analista/gestor_leads 8:00 · notifier daily 9:00 · notifier clima a cada minuto · watchdog 1min · backup 3h.
- **PM2:** `severino` (app principal) + `maestro` (workspace de outro produto — NÃO faz parte da máquina de vendas).
- **Canais:** Telegram bot (`telegram_bot.js`), e-mail (notifier), WhatsApp (`whatsapp`), webhook Kiwify (`purchase_webhook.js`).
- **Dados:** `/root/severino/data/` (licenses, leads via gestor, notifications, autopilot_state) e `/root/severino/ecosystem/` (leads.json, events.json, pending_codes.json).
- **Produtos:** `btcweatherpanel.com` (maduro) · `btcweatherpanel.com/severino-ia/` (SeverinoConsultorIA — em teste/validação, outra sessão do opencode).

---

## 3. ARQUITETURA ALVO

### 3.1 O que muda no conceito
Os agentes deixam de ser scripts isolados e viram **unidades de IA com papel claro, que se comunicam por um barramento de eventos** — como uma esteira de vendas onde cada agente registra o que fez e o orquestrador roteia para o próximo.

### 3.2 Componentes (novos, em `/root/severino/ecosystem/`)

| Componente | Arquivo | Função |
|---|---|---|
| **Orquestrador** | `orquestrador.js` (PM2 novo `ecosistema`) | Loop 24/7: lê eventos novos da fila, roteia ao agente certo, aplica timeouts/max-hops, auto-recovery. |
| **Barramento de eventos** | `queue/events.jsonl` + `queue/pendentes.json` | Fila única. Todo agente lê/posta eventos `{id, ts, tipo, origem, alvo, produto, payload, estado}`. |
| **Serviço de IA** | `ia.js` | Wrapper LLM único (provedor/modelo via `.env`). Escolhe modelo barato/forte. Retry, timeout, fallback. |
| **Registro de produtos** | `produtos.json` | Cada info-produto: id, nome, preço/plano, checkout Kiwify, canal, persona, argumentos, link de acesso. |
| **Painel de comando** | `/root/.openclaw/canvas/ecosistema.html` (ou admin) | Fila de eventos, estado dos agentes, leads, KPIs, custo LLM, decisões recentes ("por quê"). |
| **API do ecossistema** | rotas em `servidor.js` | `GET/POST /api/ecosystem/*` (eventos, produtos, agentes, status). Protegida por `X-Admin-Secret`. |

### 3.3 Agentes (papéis + mensagens que postam)

| Agente | Papel | Eventos que posta |
|---|---|---|
| **Estrategista** | Decide o que divulgar, para quem e quando; monta campanhas | `campanha.nova`, `mensagem.publica`, `rota.produto` |
| **Captador** | Atrai tráfego → gera leads (redes, formulários, bot, parcerias) | `lead.novo` |
| **Qualificador** | Pontua e rotula o lead (frio/morno/quente + tema: btcweather vs consultoria) | `lead.qualificado` |
| **Nutridor** | Educa e relaciona (e-mail/Telegram/WhatsApp) até o lead pedir oferta | `msg.enviada`, `lead.quente` |
| **Conversor** | Conversa de venda 1:1 (LLM), tira dúvidas, envia oferta/checkout | `venda.proposta`, `venda.confirmada` |
| **Onboarder** | Entrega o produto (ativa trial/VIP, envia acesso, guia o cliente) | `onboarding.ok` |
| **Retentor** | Pós-venda, upsell, renovação, evita churn | `followup.vencido`, `renovacao.pendente` |
| **Analista** | Lê KPIs (leads, conversão, receita, custo, engajamento) e fecha o ciclo | `relatorio.diario`, `sugestao.campanha` |
| **Cobrador** | Cobranças, garantia/reembolso automático | `reembolso.pedido`, `cobranca.enviada` |
| **Guardião** | Ética + custos: filtra toda saída, monitora tokens/dia, bloqueia abuso | `bloqueio.abuso`, `alerta.orçamento` |
| **Observador** | Health checks (já existe no autopilot — fundir) | `health.agent`, `health.servidor` |

### 3.4 Como os agentes conversam (exemplo real — btcweather)

```
Postiz/n8n (redes) ──► Captador posta lead.novo
  └► Qualificador posta lead.qualificado (quente/btcweather)
     └► Nutridor envia 2-3 conteúdos (msg.enviada)
        └► Conversor conversa 1:1; cliente aceita trial → venda.proposta
           └► Onboarder ativa /api/trial → onboarding.ok
              └► Retentor agenda upsell p/ plano R$47 → venda.confirmada (webhook Kiwify)
                 └► Cobrador registra → Analista gera relatorio.diario → Estrategista ajusta campanha
```

Regra: **agentes não se chamam diretamente** — postam eventos; o Orquestrador roteia. Isso garante rastreabilidade, resiliência e testes.

### 3.5 Config (`.env` — novos itens)
```
LLM_PROVIDER=openrouter|openai|anthropic|...
LLM_API_KEY=...
LLM_MODEL_BARATO=...   (padrão do Conversor/Nutridor)
LLM_MODEL_FORTE=...    (Estrategista/Analista quando precisar)
LLM_BUDGET_TOKENS_DIA=100000   (Guardião)
```

---

## 4. PLANO PASSO A PASSO

### FASE 0 — FUNDAÇÃO (1–2 dias)
- [ ] `produtos.json`: registrar `btcweather` (preços R$47/mês, Kiwify, trial 7d) e `severino-consultor-ia` (plano atual em teste).
- [ ] `ia.js`: wrapper LLM (provedor/modelo via `.env`), retry/timeout/fallback, contador de tokens.
- [ ] Barramento de eventos: `queue/events.jsonl` + `queue/pendentes.json` + função `postar()`/`ler()` (idempotente por `event.id`).
- [ ] Rotas `/api/ecosystem/*` em `servidor.js` (eventos, produtos, agentes, status) protegidas.
- [ ] Guardião mínimo (éxito + custo) no `ia.js`/orquestrador.
- **Entregável:** orquestrador PM2 `ecosistema` sobe, posta/consome eventos de exemplo.

### FASE 1 — NÚCLEO DE VENDAS btcweather (3–5 dias)
- [ ] Estrategista + Captador + Qualificador + Nutridor + Conversor (LLM) ligados ao barramento.
- [ ] Onboarder ativando trial via `POST /api/trial` e entregando sinais (reusa o que já está no ar).
- [ ] Retentor básico (follow-up pós-trial).
- [ ] Painel de comando básico (`ecosistema.html`): fila, agentes, leads, decisões.
- **Entregável:** lead entra no funil (formulário/bot/redes) e sai com trial ativado, 100% rastreado no barramento.

### FASE 2 — DIVULGAÇÃO 24/7 (2–3 dias)
- [ ] Postiz + n8n (pacote local `postiz-templates-package`): Analista gera conteúdo → Estrategista agenda posts automáticos.
- [ ] Sequências de e-mail e WhatsApp (Nutridor) com frequência controlada (anti-spam).
- [ ] Trilho de mensagens: boas-vindas → educação → oferta → follow-up.
- **Entregável:** tráfego contínuo com conteúdo 100% gerado pelos agentes.

### FASE 3 — VENDAS & COBRANÇA (2–3 dias)
- [ ] Webhook Kiwify (`purchase_webhook.js`) → evento `venda.confirmada` no barramento.
- [ ] Conversor integra checkout e pós-venda automático.
- [ ] Cobrador: garantia/reembolso automático + avisos de vencimento.
- **Entregável:** venda paga → entrega + cobrança + garantia sem humano.

### FASE 4 — MULTI-PRODUTO (2–3 dias)
- [ ] Qualificador decide o produto certo por lead (btcweather vs SeverinoConsultorIA).
- [ ] Conversor/Onboarder paramétricos por produto (lêem `produtos.json`).
- [ ] Integração com o funil do SeverinoConsultorIA (5 etapas) já existente.
- **Entregável:** um lead pode receber oferta de 1 ou mais produtos, roteado por IA.

### FASE 5 — OTIMIZAÇÃO & TRANSPARÊNCIA (contínuo)
- [ ] Ciclo fechado: Analista → Estrategista (A/B de mensagens, ajuste de campanhas).
- [ ] Dashboard público de transparência (custos vs contribuições).
- [ ] Revisão mensal do plano (living document) — registrar armadilhas.

---

## 5. CRITÉRIOS DE SUCESSO (KPIs)

- Fila de eventos nunca parada > 5 min (24/7) — Observador monitora.
- Lead quente respondido em < 1 min.
- Custo LLM/dia ≤ orçamento (Guardião reduz limite se estourar).
- Trial → venda paga ≥ meta (definir na Fase 3 com baseline real).
- 1ª venda Kiwify no período da Fase 3.
- 100% das mensagens passam pelo Guardião (ética).
- Sem vazamento de chaves/dados em logs públicos.

---

## 6. ARMADILHAS COMUNS (atualizar a cada falha)

- **Custo LLM fora de controle** → Guardião obrigatório em toda chamada `ia.js`.
- **Loop infinito entre agentes** → Orquestrador com `max_hops` e timeout por evento.
- **Mensagem duplicada em retry** → idempotência por `event.id` (postar() ignora ids já vistos).
- **Vazamento de dado de cliente em log** → filtro no Guardião + nunca logar payload bruto.
- **`&&`/`$(...)` quebram no PowerShell** → usar scripts via pipe (`Get-Content -Raw | ssh "cat > /tmp/x.sh && bash /tmp/x.sh"`).
- **PM2 não restart após mudar front** → front é lido por requisição; restart só para `servidor.js`/agentes.

---

## 7. TRANSPARÊNCIA E MISSÃO

100% dos lucros: sustentação + ajuda a quem precisa. Ética cristã guia decisões: nenhuma ferramenta promove engano, imoralidade ou ilegalidade. Dashboard público de custos vs contribuições é meta do ecossistema.
