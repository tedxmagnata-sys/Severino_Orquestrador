# Handoff: Severino Consultor IA

## Para o novo agente
Este é um info-produto separado do BTC Weather Panel. Ambos compartilham o mesmo VPS mas são projetos independentes.

## Acesso ao VPS
- IP: 187.127.42.146
- Usuário: root
- SSH Key: `C:\Users\3\.ssh\id_ed25519`
- Comando: `ssh -i C:\Users\3\.ssh\id_ed25519 root@187.127.42.146`

## URLs
- Produção: `https://btcweatherpanel.com/severino-ia/`
- BTC Weather Panel (projeto irmão): `https://btcweatherpanel.com/btc-weather-panel/`

## Infraestrutura (compartilhada)
- Servidor Node.js: `/root/severino/servidor.js` (porta 3334, PM2 id: "severino")
- Nginx: proxy reverso 80/443 → localhost:3334
- SSL: Let's Encrypt — certificado cobre severino-btc.duckdns.org, btcweatherpanel.com, www.btcweatherpanel.com

## Rota do Severino Consultor IA
No servidor Node.js, a rota `/severino-ia/*` mapeia para arquivos em `/root/.openclaw/canvas/`
Exemplo: `https://btcweatherpanel.com/severino-ia/` → `/root/.openclaw/canvas/consultor.html`

## Arquivos do Projeto
Diretório base: `/root/.openclaw/canvas/`
- `consultor.html` — Página principal (formulário de diagnóstico multi-etapas com plano de vendas)
- `apresentacao.html` — Apresentação do serviço
- `apresentacao-cliente.html` — Apresentação voltada para cliente
- `convite.html` — Página de convite
- `demo-didi.html` — Demo de assistente (Didi)
- `devocional.html` — Página devocional
- `index.html` — Página index
- `onboarding.html` — Onboarding do cliente
- `proposta-didi.html` — Proposta do assistente Didi
- `automacao/` — Subdiretório de automação
- `btc-weather-panel/` — Subdiretório do BTC Weather Panel (projeto irmão)

## Estado Atual
O consultor.html é uma Single Page Application (SPA) de formulário de diagnóstico com 5 etapas:
1. Perfil do usuário (nome, área, ramo, WhatsApp)
2. Habilidades (o que gosta/não gosta de fazer)
3. Dores (o que consome tempo, procrastinação, o que automatizaria)
4. Impacto (horas/dia perdidas, dinheiro perdido, objetivo)
5. Resultado com diagnóstico gerado por IA + escolha de plano (Essencial R$97, Profissional R$197, Completo R$347)

O formulário inclui funis de vendas: order bump (Setup Expresso), down-sell, e CTA com 3 dias grátis. Para convidados especiais, oferece 30 dias grátis.

O front-end faz POST para `/api/diagnostico` no mesmo servidor Node.js.

## Observações
- O servidor Node.js principal (`severino`) serve tanto o BTC Weather Panel quanto o Severino Consultor IA. Não mexa nas rotas do BTC Weather Panel.
- Para testar mudanças no servidor, execute: `pm2 restart severino`
- Para ver logs: `pm2 logs severino --lines 20 --nostream`

## Nota (29/Jul/2026)
A rota /severino-ia/ foi corrigida. Agora funciona corretamente: https://btcweatherpanel.com/severino-ia/ retorna 200 OK.
O servidor foi reiniciado (PM2 restart severino).
