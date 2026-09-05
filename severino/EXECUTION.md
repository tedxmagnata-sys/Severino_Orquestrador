# SEVERINO VENDEDOR IA — EXECUTION.md (v2.0)
> Micro-SaaS autônoma de agente bot consultor de vendas, 24/7, princípios cristãos. Rode sem intervenção humana.

---

## 1. REGRAS CRÍTICAS (red lines — nunca violar)

1. **NUNCA** envolver-se com atividades imorais, desonestas ou ilegais (filtro ético obrigatório em toda entrada).
2. **SEMPRE** servir o cliente com o menor custo de LLM possível (modelo barato quando suficiente).
3. **NUNCA** expor segredos, chaves ou dados de clientes em respostas, logs públicos ou HTML client-side.
4. **SEMPRE** honrar a garantia: insatisfeito → reembolso automático, sem perguntas.
5. **NUNCA** intervir manualmente no fluxo quando o bot pode resolver — autonomia primeiro.
6. **SEMPRE** manter rate limiting e proteção de custo ativos (orçamento de tokens por usuário).
7. **NUNCA** deixar o servidor sem health check ativo.

## 2. PROJETO (WHAT)

**Missão:** ser o vendedor e consultor de vendas IA de pequenos negócios — atendimento 24/7 com excelência cristã (honestidade, paciência, respeito), treinado com os arquivos e produtos de cada cliente. Renda honra a Deus e abençoa quem precisa.

**Público:** pequenos comerciantes e prestadores de serviço que perdem vendas por demora ou falta de presença digital.

**Stack:**
- Servidor: Node.js (http nativo) — porta 3334
- Gerenciador: PM2 (`pm2 list` → app `severino`)
- Proxy: Nginx (443 SSL → 127.0.0.1:3334)
- Dados: JSON em `/root/severino/data/` (inclui `vendedores/vendedores.json` + pasta de arquivos por vendedor)
- Front: `/root/.openclaw/canvas/consultor.html` (single file, i18n PT/EN/ES)
- Autopiloto: `/root/severino/autopilot.js` (monitor + auto-recovery + reembolsos)

**Domínios:** `btcweatherpanel.com/severino-ia/` (produção) · `severino-btc.duckdns.org`

## 2.1 FUNIL DE VENDAS (5 etapas do cadastro)

| Etapa | Conteúdo | Dados |
|---|---|---|
| 1 🏪 | Seu negócio | nome, ramo, WhatsApp, redes |
| 2 📦 | Seus produtos | nome, preço, descrição (múltiplos) |
| 3 📚 | Treine o vendedor | upload de arquivos (PDF/DOCX/XLSX/CSV/TXT/MD/JSON/JPG/PNG/WEBP/MP4/MP3 — até 8MB, máx 12) + texto livre + links |
| 4 🎭 | Personalidade (100% ajustável) | nome do bot, tom de voz (cordial/formal/descontraído/cristão), idioma de atendimento, horário, regras de venda |
| 5 💳 | Plano | BÁSICO ou PRO × mensal/semestral/anual + add-ons de avatar/postagens + método de pagamento |

## 2.2 PLANOS E PREÇOS

| | BÁSICO (R$) | PRO (R$) |
|---|---|---|
| Mensal | 47 | 97 |
| Semestral | 240 (15% off) | 490 (15% off) |
| Anual | 420 (25% off) | 870 (25% off) |
| Garantia | 7 dias | 15 dias |

**Add-ons (PRO):** Avatar do vendedor +R$19/mês · Mensagens+Vídeos+Agendamento +R$39/mês
- **PRO inclui:** 2 vendedores, avatar, geração de mensagens/vídeos para redes sociais, agendamento de postagens, relatório semanal.
- **Básico:** 1 vendedor treinado, funil de perguntas, 3 idiomas, follow-up automático.

## 2.3 API DE VENDEDORES

- `POST /api/vendedor` — cadastro completo (JSON com arquivos em base64, limite 120MB). Salva arquivos em `data/vendedores/<id>/` e metadados em `data/vendedores/vendedores.json`.
- `GET /api/vendedores` — lista (header `x-admin-secret` = SECRET_KEY).
- `POST /api/vendedor/status` — atualiza status (header `x-admin-secret`).
- `GET /api/vendedores/arquivos/:id/:nome` — baixa arquivo de treino (header `x-admin-secret`; protegido contra path traversal).
- **Painel admin:** `https://btcweatherpanel.com/severino-ia/admin.html` — login com SECRET_KEY, stats, filtros por status, detalhes completos, ativar/suspender/reembolsar, download de arquivos. Fonte local: `admin.html`.

## 2.4 CONVITES E MODO TESTE (validação beta)

- **Link de convite:** `.../severino-ia/?convite=CODIGO` — mostra banner "Convite especial" e registra `conviteCode` no cadastro (visível no painel admin → Detalhes → Convite).
- **Modo teste (beta):** `.../severino-ia/?convite=beta-pro` — libera o plano PRO completo (avatar + conteúdo + agendamento) com **R$ 0**, marca `modoTeste:true` no cadastro e muda o botão para "🧪 Enviar cadastro de teste". Usado para validar a micro-SaaS com clientes parceiros e coletar feedback de desenvolvimento.

## 3. POR QUÊ (WHY)

- **Sustentabilidade:** Planos BÁSICO (R$47) e PRO (R$97), com semestral/anual (15/25% off) e add-ons (+R$19 avatar, +R$39 conteúdo) — margem confortável.
- **Zero-touch:** cadastro → treinamento com arquivos → ativação → monitoramento → cobrança → reembolso, tudo automático.
- **Confiança:** garantia de devolução automática (7 dias BÁSICO, 15 dias PRO) — confiança é o moat.
- **Missão:** atender com excelência cristã; caminho de aprendizado gratuito para quem não pode pagar ("ensine a pescar").

## 4. COMO (HOW) — Comandos Exatos

```bash
# Verificar estado
pm2 list
pm2 logs severino --lines 30

# Reiniciar servidor após deploy
pm2 restart severino

# Deploy do front (a partir da máquina local Windows)
scp -i "C:\Users\3\.ssh\id_ed25519" home.html root@187.127.42.146:/root/.openclaw/canvas/consultor.html

# Deploy do servidor
scp -i "C:\Users\3\.ssh\id_ed25519" servidor_atual.js root@187.127.42.146:/root/severino/servidor.js

# Testes de saúde
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3334/severino-ia/   # esperado: 200
curl -s http://127.0.0.1:3334/api/health                                     # esperado: {"ok":true,...}
curl -s http://127.0.0.1:3334/api/autopilot/status                            # estado do autopiloto
# Teste de cadastro de vendedor (via arquivo JSON — no PowerShell usar --data @arquivo.json)
curl -s -X POST http://127.0.0.1:3334/api/vendedor -H "Content-Type: application/json" --data @test.json
```

## 5. ARQUITETURA AUTÔNOMA — Agentes do Autopiloto

| Agente | Função | Gatilho |
|---|---|---|
| **Observador** | Health checks a cada 60s (servidor + automações de usuários) | timer |
| **Curador** | Auto-recovery: reinicia automações mortas, retenta falhas | detecção de falha |
| **Cobrador** | Gera cobranças, lembra vencidos, aciona reembolso automático | agendamento |
| **Aprendiz** | Coleta feedback, métricas de satisfação, sugere ajustes ao front | feedback do usuário |
| **Guardião de Custos** | Monitora tokens/API, bloqueia abuso, alerta orçamento | contador diário |
| **Linguista** | Aplica idioma (PT/EN/ES) em todas as respostas | preferência do usuário |

### Fluxo Zero-Touch do Cliente
```
Cadastro do vendedor (gratuito, 5 etapas: negócio → produtos → treino → personalidade → plano)
  → Upload de arquivos (catálogos, planilhas, fotos, vídeos) treina o bot
  → Escolhe plano: BÁSICO ou PRO × mensal/semestral/anual (+ add-ons de avatar/postagens)
  → Onboarding 100% via WhatsApp (bot guia passo a passo)
  → Provisionamento automático (vendedor IA + avatar + agendamento de posts no PRO)
  → Monitoramento + auto-recovery contínuo
  → Cobrança automática (cripto USDT/BTC ou Pix)
  → Insatisfeito? → Reembolso automático em 24h (caminho pré-aprovado)
```

## 6. VERIFICAÇÃO DE SUCESSO (critérios, não passos)

- `GET /api/health` responde `ok:true` em < 500ms — 100% do tempo monitorado.
- Nenhuma automação de usuário fica down > 5 min (auto-recovery ≤ 3 tentativas).
- Custo de LLM diário ≤ orçamento configurado (senão, Guardião de Custos reduz limites).
- Reembolsos processados em ≤ 24h do pedido.
- Nenhuma requisição sem filtro ético passa ao treinamento do vendedor.
- i18n: página inteira muda de idioma sem reload ao trocar PT/EN/ES.
- `POST /api/vendedor` aceita cadastro com até 12 arquivos e salva arquivos em disco.
- Upload rejeita formatos fora da lista e arquivos > 8MB (com mensagem clara).

## 7. ARMADILHAS COMUNS (atualizar a cada falha)

- **PM2 não restart** após editar `consultor.html`? Não precisa — arquivo é lido por requisição. Só restart se editar `servidor.js` ou `autopilot.js`.
- **`&&` falha no PowerShell**: usar `cmd1; if ($?) { cmd2 }` ou comandos separados.
- **`$(...)` e aspas aninhadas no PowerShell**: usar arquivos de teste via scp (`--data @test.json`) em vez de JSON inline no curl.
- **Upload muito grande**: limite de 120MB total no servidor e 8MB por arquivo no front — arquivos maiores dão erro claro.
- **JSON de dados corrompido**: autopilot faz backup automático de `data/*.json` a cada 6h e valida parse ao iniciar.
- **Base64 no banco**: nunca salvar `base64` no JSON — salvar em disco e guardar só metadados (nome/tamanho/ext).

## 8. MANUTENÇÃO (living document)

- Revisar mensalmente: remover regras que o agente já cumpre por padrão; adicionar pitfall a cada 2ª ocorrência da mesma falha (1ª vai para MEMORY.md).
- Cada alteração estrutural atualiza a versão no topo deste arquivo.
- `AGENTS.md` importa este arquivo (`See @EXECUTION.md`).

## 9. TRANSPARÊNCIA E MISSÃO

- Dashboard público de transparência: custos vs contribuições (meta: publicar no domínio).
- 100% dos lucros: sustentação + ajuda a quem precisa (doar tempo/tutoriais para caminho gratuito).
- Ética cristã guia decisões de produto: nenhuma ferramenta promove engano, imoralidade ou ilegalidade.
