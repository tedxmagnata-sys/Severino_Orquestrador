# ✅ TESTE DE VALIDAÇÃO — SEVERINO VENDEDOR IA (Fluxo 100% Automatizado)

> Data: 07/Ago/2026 · Escopo: 2 planos (Básico R$47 + Pro R$97) · Resultado: **APROVADO**
> Objetivo: provar que venda + configuração acontecem **sem interferência humana, 24/7 na nuvem**.

## 📈 RESULTADO

| Etapa | Básico (R$47) | Pro (R$97/semestral) |
|---|---|---|
| 1. Cadastro (formulário) | ✅ `ven_msjfq6360a94` | ✅ `ven_msjfq658c6y5` |
| 2. Pagamento Kiwify (webhook) | ✅ `compra_aprovada` | ✅ `compra_aprovada` |
| 3. Ativação automática | ✅ status `ativo` | ✅ status `ativo` |
| 4. Treinamento IA com materiais | ✅ LLM real (1.689 tokens) | ✅ LLM real (2.204 tokens) |
| 5. Entrega de acesso | ✅ link gerado | ✅ link gerado |
| 6. Notificação admin Telegram | ✅ disparada | ✅ disparada |

**Teste limpo após validação** — vendedores.json volta a `[]`, pastas de treino removidas.

## 🔄 FLUXO AUTOMATIZADO (0 humanos)

```
Cliente ──▶ preenche formulário (severinobot.com)
                │
                ▼
        POST /api/vendedor
        status = pendente_pagamento · salva email+whatsapp+materiais
                │
                ▼  (front redireciona ao checkout Kiwify do plano)
        Webhook Kiwify POST /api/purchase/webhook
        evento = compra_aprovada
                │
                ├─▶ match do vendedor por email (ou whatsapp)
                ▼
        status = ativo · pagoEm · ativoAte (30/180/365d)
                │
                ▼
        TREINAMENTO IA (vendedor_ai.js → OpenRouter LLM)
        lê materiais → gera contexto/prompt do vendedor → salva contexto.txt
                │
                ▼
        Entrega: link de acesso gerado
        https://severinobot.com/severino-ia/vendedor.html?id=<id>
                │
                ▼
        Notificações Telegram: admin (venda ativada) + cliente (acesso)
```

## 🛠️ O QUE FOI IMPLEMENTADO NESTA SESSÃO

| Arquivo | Mudança |
|---|---|
| `servidor.js` | Rota `/api/vendedor` agora salva **email** e status `pendente_pagamento`; webhook Kiwify ganhou branch **Severino** (detecta pelo nome do produto, faz match por email/whatsapp, ativa, treina e entrega sem humano) |
| `vendedor_ai.js` | **Novo módulo** — monta materiais (produtos+treino+documentos+personalidade), gera contexto via LLM (fallback determinístico se IA cair), salva `contexto.txt` |
| `servidor.js` | Rota `GET /api/vendedor/acesso/:id` — página pública do vendedor treinado |
| `vendedor.html` | **Nova página** de acesso do cliente (mostra vendedor, plano, treinamento e prévia do contexto) |
| `consultor.html` | Campo **e-mail** no passo 1 (obrigatório p/ ativação + entrega) + validação |

## 👤 PAINEL DE GESTÃO DO COMPRADOR (Fase 2 — validada)

O comprador recebe um **link de acesso seguro** (`id` + token único) e ganha um painel com 4 abas para manter o vendedor sempre excelente:

| Aba | O que faz |
|---|---|
| **👀 Visão geral** | Plano, vendedores, canais, validade, pago em, WhatsApp de atendimento |
| **🛠️ Ajustar** | Edita negócio, ramo, WhatsApp, e-mail, redes, **produtos** (add/remove), nome do bot, tom de voz, idioma, horário, **regras de venda** e **conhecimento do negócio** (texto + link) |
| **🧠 Treinar** | Retreina o vendedor com as novas informações (regenera contexto via LLM) + prévia do contexto |
| **💬 Conversar** | Testa o vendedor em tempo real (chat com a IA treinada, como se fosse um cliente) |

**Fluxo do painel:** GET (token) → dados de gestão → PUT (ajustar) → POST `/retreinar` → POST `/chat`. Tudo protegido por token; sem token só vê status público.

**Teste ponta-a-ponta (09/09 passos):**

| Passo | Resultado |
|---|---|
| Cadastro + webhook → link entregue com token | ✅ |
| GET com token (dados de gestão: 2 vendedores, 1 produto) | ✅ |
| GET sem token → não expõe dados | ✅ |
| PUT ajustar (marca, regras, produtos, bot) | ✅ |
| POST retreinar (novo contexto, 1.793 tokens) | ✅ |
| POST chat → respondeu usando o NOVO contexto (citou cupom BIA10 e frete grátis R$150) | ✅ |
| Chat sem token → 403 | ✅ |

**Implementação:**
- `servidor.js`: rotas `PUT /api/vendedor/acesso/:id` (ajustar), `POST .../retreinar`, `POST .../chat`, GET com validação de token
- `vendedor_ai.js`: `gerarTokenAcesso()`, `validarToken()` (aceita token completo ou prefixo 12 chars do link), `conversar()` (chat com contexto)
- `vendedor.html`: painel completo com abas + chat interativo

## 🚨 REGRAS DE SEGURANÇA IMPLEMENTADAS

- Webhook protegido por `SECRET_KEY` (401 sem ela) — ninguém gera ativação de graça
- Compra **sem cadastro prévio**: não ativa nada; registra alerta + notifica admin ("cliente pagou mas não cadastrou")
- Link de acesso com **token único por vendedor** — edição, retreino e chat exigem token (403 sem ele)
- LLM com orçamento diário (LLM_BUDGET_TOKENS_DIA) + fallback automático
- Backups criados antes de cada deploy (`.pre-validacao-*`, `.pre-painel-*`)

## 📌 PRÓXIMOS PASSOS PARA IR AO AR

1. **Criar produtos na Kiwify** e registrar os links (endpoint `POST /api/config/checkout` admin — já validado):
   - `KIWIFY_BASICO_MENSAL`, `KIWIFY_BASICO_SEMESTRAL`, `KIWIFY_BASICO_ANUAL`
   - `KIWIFY_PRO_MENSAL`, `KIWIFY_PRO_SEMESTRAL`, `KIWIFY_PRO_ANUAL`
2. **Configurar o webhook** na Kiwify → `https://severinobot.com/api/purchase/webhook?secret=<SECRET_KEY>`
   - Nomear produtos com "Severino" no nome (o sistema detecta automaticamente)
3. **Testar venda real** (R$0 via cupom) para confirmar o webhook real da Kiwify

## 🔗 ARQUIVOS CHAVE

- `/root/severino/servidor.js` → servidor (porta 3334, PM2 `severino`)
- `/root/severino/vendedor_ai.js` → treinamento IA + token + chat
- `/root/.openclaw/canvas/consultor.html` → front (novo campo email)
- `/root/.openclaw/canvas/vendedor.html` → **painel de gestão do comprador** (visão/ajustar/treinar/chat)
- `/root/severino/data/vendedores/` → cadastros + pastas de treino (contexto.txt)
- `/root/severino/data/events.jsonl` → evento `vendedor_ativo`, `vendedor_retreinado`
