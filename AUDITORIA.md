# Auditoria Adversarial — BTC Weather Panel (Fase 1)

> Data: 10/ago/2026. Método: auditoria adversarial de ponta a ponta do funil real no VPS.
> Objetivo: preparar o produto para os primeiros 10 pagantes (roadmap Fase 1).

## Resumo executivo

O ciclo **captura → trial → venda → status pago** funciona de ponta a ponta (testado E2E real).
Foram encontrados **2 BLOCKERs (1 corrigido, 1 exige ação manual)** e **1 bug MEDIUM (corrigido)**.
O ponto fraco estratégico NÃO é técnico — é **aquisição e conversão**: existem apenas 4 leads
no funil e **0 compras** em produção.

> ⚠️ **ATUALIZAÇÃO (10/08, pós-auditoria)**: e-mail SMTP Brevo parou de autenticar
> (`535 Authentication failed`). Últimos envios OK em 09/08; senha idêntica ao backup
> pré-Fase E → **senha revogada/expirada no painel Brevo**. Ação manual necessária
> (rotacionar senha SMTP em app.brevo.com e atualizar `SMTP_PASS` no `.env`).
> Impacto: captador, retentor (follow-up por e-mail) e cobrador.

---

## Fluxos auditados e resultado

### 1. Captura no site (dupla captura) — ✅ OK
- `app.btcweatherpanel.com` → `POST /api/trial` → gera código VIP7, grava em `licenses.json`, mostra tela do Telegram com deep link `t.me/bot?start=CODIGO`.
- Testado: código gerado e gravado corretamente.
- Rate limit: 30 req/min/IP em todas as rotas `/api/*` ✓.

### 2. Bot Telegram — ✅ OK (com ressalva)
- `/start CODIGO`, `/vincular CODIGO`, `/resgatar email`, `/status`, `/codigo`, `/notificacoes` validados contra `licenses.json` e `purchases.json`.
- `/start` e `/vincular` gravam `notifications.json` (vínculo chatId ↔ licenseCode) → o retentor usa isso para achar o Telegram do lead.
- `/codigo` protegido por `X-Admin-Secret` ✓.

### 3. Prospecção IG → CTA (prospector) — ❌ BLOCKER CORRIGIDO
- **Problema**: o prospector gerava o código com `gerarCodigo()` próprio e **não gravava no `licenses.json`**. O bot valida contra `licenses[codigo]` → usuário clicava no deep link e recebia "❌ Código Não Encontrado". O funil IG→Telegram estava quebrado de ponta a ponta.
- **Correção aplicada** (commit `XXXX`): o prospector agora gera o código via `POST /api/trial` local (127.0.0.1:3334) com header `x-ecosystem: 1` (grava no licenses.json e NÃO duplica o evento `trial.ativado`).
- **Testado**: chamada real → código gravado em `licenses.json` ✓ (limpo após teste).

### 4. E-mail captador — ✅ OK
- Envia convite único (1h após ativação) para leads com e-mail sem Telegram. Usa Brevo SMTP. Anti-spam (1x, não duplica).

### 5. Ciclo trial → pago (retentor + cobrador + Kiwify) — ✅ OK (testado E2E)
- Retentor: check-in dia 3, upsell dia 7, reativação dia 8 (1 mensagem, marca `expirado`).
- Cobrador: `venda.confirmada` marca lead `pago` + `comprouEm` + `renovacaoEm`; `tick.renovacao` avisa antes/depois do vencimento.
- Webhook Kiwify protegido por `SECRET_KEY` (401 sem secret) ✓; normaliza centavos → reais ✓.
- **Teste E2E real**: trial no site → webhook de compra mesmo e-mail → lead virou `pago` com `renovacaoEm` ✓. Dados de teste removidos.

### 6. Exposição webhook — ✅ OK
- `POST /api/purchase/webhook` alcançável via nginx `location /` → 3334, exige secret.

---

## Bugs encontrados

| Severidade | Problema | Status |
|---|---|---|
| **BLOCKER** | Prospector gerava código fora do `licenses.json` → deep link do bot falhava ("Código Não Encontrado") | ✅ Corrigido (via `/api/trial` local) |
| **BLOCKER** | SMTP Brevo `535 Authentication failed` — senha revogada/expirada (e-mails parados desde ~09/08) | 🔴 Exige ação manual (rotacionar senha no Brevo + atualizar `.env`) |
| **MEDIUM** | Retentor lia `plano.valor`, mas produtos.json tem `plano.preco` → preço sempre caía no fallback `R$47` | ✅ Corrigido (`precoDoProduto`) |

## Riscos / Observações (não-bugs)

| Risco | Nota |
|---|---|
| **Leads IG sem canal de contato** | O lead do prospector nasce sem e-mail/Telegram; só é contatável se o usuário clicar no bot. O retentor os pula corretamente (sem spam). Melhorar: na resposta do IG, pedir leve engajamento (ex: "segue pra DM") — ou aceitar como canal de 1-toque. |
| **Zero conversão atual** | 4 leads reais, 0 compras. Os 3 trials do site expiraram (dias 4-6) e nenhum virou pago. Necessário: pricing atrativo + oferta anual + a automação já ligada (retentor ativo). |
| **2 checkouts** | `ffphj4e` (mensal) é o padrão dos agentes; `vim8bDb` (anual) só aparece no bot expirado. Validar se ambos são intencionais e estão ativos na Kiwify. |
| **Preço não testado** | R$47/mês é hipótese. Rodar teste de preço (R$37 vs R$47 vs R$57) só com tráfego mínimo de validação. |

---

## Decisões de produto (a validar com dados de quem ativou trial)

- **ICP inicial (hipótese)**: investidor de cripto individual, BR, que acompanha BTC no celular e quer melhorar timing de entrada/saída sem análise técnica complexa. Persona já definida em `produtos.json` — alinhada.
- **Promessa central**: "sinais objetivos + análise diária do clima do Bitcoin no seu Telegram".
- **3 diferenciais**: (1) análise diária automática às 9h; (2) alertas em tempo real de mudança de clima; (3) sinais operacionais — tudo em português, sem complexidade.
- **Plano**: trial 7 dias (sem cartão) → R$47/mês ou anual com desconto. Paywall ideal: **final do trial** (usuário já viveu o valor).
- **AHA moment**: primeiro card diário recebido no Telegram (D+1).
- **Onboarding de ativação**: deep link → ativar código → `/vincular` → receber card (medir: % que chega ao card).
- **Métricas essenciais**: trial→pago ≥ 5%, tempo trial→pago, churn < 10%, CPL por origem.
- **O que validar ANTES de investir em aquisição**:
  1. % de trials que ativam o Telegram (chegam ao AHA moment).
  2. Conversão trial→pago real (agora 0%).
  3. Retenção pós-pago (alguém paga 2º mês?).
  4. CPL por canal (IG, e-mail, bot) com os primeiros 10 pagantes.

## Plano para os primeiros 10 usuários (custo ~zero)

1. **Ativar a automação existente** (já roda): retentor (D3/D7/D8) + captador (convite e-mail).
2. **Prospecção IG ativa**: responder TODOS os comentários de posts de terceiros sobre BTC (prospector em outros perfis, não só os nossos). Método: comentar com valor em perfis de educação financeira/crypto.
3. **Conteúdo orgânico**: 1 vídeo/dia (videasta) publicado em X+IG (observador) sobre análise do dia → tráfego para o app.
4. **Recrutamento direto**: comunidades de cripto (grupos BR de Telegram/WhatsApp, Reddit r/bitcoin BR) com oferta de trial.
5. **Convite por e-mail para os 3 trials expirados** (já têm e-mail) com oferta de reativação/anual.

## Prioridade de implementação (próximas ações)

1. ~~Corrigir prospector (BLOCKER)~~ ✅
2. ~~Corrigir preço retentor (MEDIUM)~~ ✅
3. 🔴 **Rotacionar senha SMTP Brevo** (ação manual) — sem isso, e-mail morreu.
4. ~~Validar checkouts Kiwify~~ ✅ (mensal `ffphj4e` e anual `vim8bDb` ativos, HTTP 200)
5. Reativação melhorada: retentor oferece mensal + anual (upsell D7 e reativação D8).
6. Definir preço final (A/B simples) e ativar campanha de recrutamento dos 3 leads expirados.
