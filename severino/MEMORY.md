# MEMORY.md - Long-term Memory

## Bino (Marcelo Costa)
- Dono deste workspace
- Contato via WhatsApp: +559181940000
- Foco em negócio e resultados
- Estilo direto, sem enrolação

## Serviços e Infra
- Contabo Cloud VPS 20 NVMe (Customer ID 14882036)
  - IP: 194.233.75.232
  - Location: Singapore 3 (SIN)
  - Email cadastrado: tedxmagnata@gmail.com

## Projetos Ativos

### 🦾 Severino Consultor (iniciado 2026-07-04)
- Projeto principal de monetização
- Funil de diagnóstico → ferramentas IA → assinatura recorrente
- Doc completa: `projetos/severino-consultor/README.md`
- Modelo: 3 planos (R$97/197/347 mês) + 3 dias teste grátis + 7 dias bônus pós-pagamento
- Servidor local: `node C:\Users\3\SEVERINO\servidor.js` (porta 3334)
- Deploy em Produção (VPS Hostinger): `187.127.42.146` (porta 80)
  - Processo PM2: `severino` (rodando em `/root/severino/servidor.js`)
  - Painel WhatsApp: `http://187.127.42.146/painel-whatsapp`
  - Funil de Diagnóstico: `http://187.127.42.146/consultor.html`
  - Acesso SSH: Integrado via chave local `id_ed25519`
- Auto-allowlist: adiciona WhatsApp automaticamente, restart em lote a cada 2h
- Stack: HTML/CSS/JS + Node.js (local & VPS), WhatsApp Web.js (via Baileys na nuvem)
- Bino decidiu: Severino resolve o básico sozinho; Bino entra só pra escalar/precificar

### 🎫 Programa de Cases Fundadores (iniciado 2026-07-04)
- 3 convites ativos por vez, validade 3 dias cada
- Convidado: 30 dias grátis no Básico (a partir de R$ 97/mês depois)
- Progressão: Básico → Profissional → Completo (sobe quando dominar)
- Créditos: resultados documentados + indicações = mais dias grátis + novas ferramentas
- **Regra de convite**: só distribui quem está usando o Severino (contratou Básico ou autorizado pelo Maestro/Bino)
- Ao desistir, libera 1 novo convite por vez
- Link: `http://localhost:3334/convite.html?code=***`
- Link consultor convidado: `http://localhost:3334/consultor.html?convite=***`
- Order bump (Setup Expresso +R$ 47) e down-sell implementados no funil
- Bino é cristão, valores alinhados com a fé (1 Coríntios 10:31)

## Timeline
- **2026-07-08 (noite)**: Configuração de credenciais OpenRouter no VPS (`.env`). Implementação de Whitelist de Assinantes ativos do devocional na instância `jornada-fe` para evitar interações não autorizadas. Adição de mecanismos antibanimento e simulação humana de digitação (status `composing` no Baileys) com aumento de intervalo dinâmico de disparo para 10-25 segundos.
- **2026-07-08 (tarde)**: Princípios e Caráter Cristão adicionados oficialmente à SOUL.md e sincronizados com o VPS. Proposta de Info-produto "Devocional Diário no WhatsApp" (Jornada de Fé) elaborada para testes práticos de monetização automatizada 24/7.
- **2026-07-08**: Deploy em produção concluído no VPS Hostinger (`187.127.42.146`). Arquivos estáticos (canvas) e painel-whatsapp migrados. Servidor ajustado para rodar na porta 80. Inicialização configurada com PM2 para rodar 24h/dia.
- **2026-07-04 (noite)**: Programa de Cases Fundadores estruturado. Convite com validade 3 dias, 30 dias grátis no Básico, order bump + down-sell, sistema de progressão e créditos. Regra: só cliente ativo ou Maestro distribui convite. Bino declarou fé cristã como base do projeto.
- **2026-07-03**: Primeira interação. Contabo VPS suspenso por débito de $17.65. Email de account recovery redigido para support@contabo.com.