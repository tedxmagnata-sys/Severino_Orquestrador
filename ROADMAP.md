# SeverinoBot.com — Roadmap para 100 leads pagantes

> Visão: plataforma de micro-SaaS + ferramentas de automação com IA rodando na VPS.
> O Severino (orquestrador) faz prospecção, marketing e venda de forma autônoma.
> Primeiros cases: **btcweatherpanel** (painel de clima do Bitcoin) e **severinovendedor** (assistente de venda).

## Princípio de escalagem

Cada fase termina com uma **meta alcançada**. Ao bater a meta, fazemos um **review** (o que converteu,
CPL real, tempo de ciclo) e escalamos o canal que provou resultado — nunca escalamos todos de uma vez.

Regra: **provar no pequeno → medir → escalar só o que converteu.**

---

## Fase 0 — Fundação (EM PRODUÇÃO) ✅
O que já existe e funciona:
- VPS com orquestrador de agentes (prospector, captador, nutridor, conversor, onboarder, retentor, cobrador, analista, estrategista, videasta, observador).
- Dupla captura no site (e-mail → Telegram) com deep link do bot.
- Prospeção IG via Graph API (comentário → CTA → código VIP7 → lead).
- Gerador de vídeos (MuAPI) + publicação automática no X e IG (Postiz).
- E-mail via Brevo (SMTP ativo).
- Checkout Kiwify (`https://pay.kiwify.com.br/ffphj4e`).
- Corte de custos LLM (Fase E).

**Status**: fundação sólida. Falta monetizar de verdade.

---

## Fase 1 — Monetização do case 1 (btcweatherpanel)
**Objetivo**: converter trials em pagantes. Hoje o trial existe mas o funil trial→pago está subutilizado.

### Ações
1. **Pricing definido**: plano mensal + anual (desconto para anual). Definir preço que cubra custo LLM + lucro.
2. **Automação de conversão** (orquestrador):
   - D-3 do fim do trial: alerta no bot (retentor) "seu teste termina em 3 dias".
   - D-1: alerta final + oferta de anuidade com desconto.
   - D+0 expirado: e-mail de recuperação (Brevo) + contador de acessos.
   - Cobrador ativo: follow-up em 3, 7, 15 dias com novos ângulos de valor.
3. **Validação da oferta**: testar 2 preços (A/B) e 2 CTAs na página de checkout.
4. **Métricas por lead**: qual origem converte mais (IG, e-mail, bot, site).

### Meta da fase
**10 pagantes recorrentes** (primeiros pagos reais).

### KPI
- Trial→pago ≥ 5%
- CPL (custo por lead) = 0 (orgânico) ou < preço do plano
- Churn < 10% no primeiro mês

---

## Fase 2 — Segundo case (severinovendedor)
**Objetivo**: ativar a segunda ferramenta como produto independente.
O que é: assistente de venda/conversão com IA (vendedor_ai.js já existe no VPS).

### Ações
1. **Definir o que o severinovendedor faz**: script de venda, qualificação de leads, resposta automática no WhatsApp/Telegram? (definir escopo do produto).
2. **Landing page própria** + dupla captura igual ao btcweather.
3. **Trial gratuito** com captura de e-mail/Telegram (mesmo padrão).
4. **Orquestrador**: agentes de venda (qualificador → conversor) plugados no funil.

### Meta da fase
**10 pagantes** do severinovendedor (2º case provado).

### KPI
- Mesmos KPIs da Fase 1, por produto.

---

## Fase 3 — Máquina de prospecção escalável
**Objetivo**: trocar volume de prospecção por leads qualificados, usando o que já existe.

### Ações
1. **Expandir canais de prospecção** (prospectar onde o público crypto/empreendedor está):
   - IG (já ativo) → otimizar: responder TODOS os comentários em posts de nicho de terceiros (não só os nossos).
   - X (Twitter): prospector de menções a keywords (bitcoin, automação, ia).
   - YouTube: comentários em vídeos de crypto/IA.
   - Reddit: threads de r/bitcoin, r/btc, r/brasil.
2. **Conteúdo orgânico automatizado**:
   - Videasta gera vídeos diários; Observador publica no X/IG.
   - Postiz agenda conteúdo de autoridade (dicas, análises).
3. **Prospeção e-mail B2B** (opt-in): coletar e-mails de quem comenta/interage → captador envia sequência.
4. **Escala do IG**: múltiplas contas/redes quando o CPL provar.

### Meta da fase
**30 novos pagantes** (total 50).

### KPI
- Leads/dia por canal
- CPL médio
- Conversão por origem (para alocar esforço)

---

## Fase 4 — Vitrine/plataforma severinobot.com
**Objetivo**: transformar a página simples em um hub de produtos.

### Ações
1. **Página principal** severinobot.com: catálogo das ferramentas (btcweather, vendedor, + próximos).
2. **Página de cada produto** com: descrição, preço, trial, depoimentos (quando houver).
3. **Dashboard do Severino** (admin): funil, receita, leads por origem — acessível via bot ou página.
4. **Estrutura multi-produto**: produtos.json já existe; criar a vitrine consumindo ele.
5. **Onboarding unificado**: um bot (o atual) atende todos os produtos com /vincular.

### Meta da fase
**20 novos pagantes** (total 70).

### KPI
- Conversão de visitante→trial no site ≥ 2%
- Tempo de ativação < 5 min (do clique ao trial)

---

## Fase 5 — Lançamento de novos micro-SaaS (catálogo)
**Objetivo**: novos produtos baratos de criar (reciclam a infra).

Ideias (avaliar viabilidade técnica + demanda):
- **Auto-bio / posts**: gerador de bios e legendas com IA.
- **Relatório diário**: card do BTC já existe — virar produto "alerta de mercado" para outras criptos.
- **Bot de vendas** como serviço: o próprio severinovendedor para terceiros.

### Regra
- Só lançar novo produto se o case anterior provou trial→pago ≥ 5%.
- Novo produto deve reciclar: captura, bot, funil, checkout, e-mail.

### Meta da fase
**30 novos pagantes** (total 100). 🎯

---

## Fase 6 — Escala pós-100
**Objetivo**: acelerar sem perder margem.

1. **Escalar o canal campeão** (o que tiver melhor CPL) com orçamento controlado.
2. **Tráfego pago** (Meta Ads) só com prova de CPL e pixel de conversão instalado.
3. **Programa de indicação**: crédito/desconto por lead indicado (referral).
4. **Retenção**: jornada pós-venda (onboarder → retentor → cross-sell entre produtos).
5. **Automação do Severino** evolui: cada novo lead alimenta o next-best-action.

### Meta da fase
**Meta semestral**: 500 pagantes, MRR ≥ R$ X (definir com o pricing).

---

## Métricas-mestre (acompanhar SEMPRE)

| Métrica | Onde | Alvo |
|---|---|---|
| Trial→pago | funil.json / checkout | ≥ 5% |
| CPL | origem do lead | < preço do plano |
| Tempo trial→pago | funil | < 7 dias |
| Churn mensal | cobrador | < 10% |
| MRR | dashboard | crescente |

## Sequência de execução sugerida (próximos 30 dias)

| Semana | Fase | Foco |
|---|---|---|
| 1 | 1 | Pricing + automação de conversão (retentor D-3/D-1, cobrador) + métricas |
| 2 | 1 | A/B de oferta, validar 10 pagantes |
| 3 | 2 | Ativar severinovendedor (escopo + landing + trial) |
| 4 | 2-3 | Prospecção multicanal + 1º batch de conteúdo |
