# Template de micro-SaaS para o ecossistema Severino

Este template cria um NOVO produto isolado em sua própria porta/PM2.
NÃO edite o `servidor.js` — cada produto roda sozinho.

## Estrutura
```
produto-novo/
  app.js           → backend Node (porta própria, default 3340)
  public/index.html → landing page (ativa trial por e-mail)
  data/            → dados do produto (criar trials.json)
  nginx.conf       → snippet para adicionar no sites-enabled/severino
```

## Como usar (resumo)
1. `cp -r template <slug>`  → ex: `produto-meuapp`
2. Edite `app.js`: variável `PORTA` (use 334X livre) e lógica de trial/validação
3. Suba com PM2: `pm2 start app.js --name produto-<slug> -- --porta 334X`
4. Adicione o bloco nginx (subdomínio `app.<slug>.severinobot.com` → 127.0.0.1:334X)
5. `nginx -t && systemctl reload nginx`
6. Expanda o cert SSL (sempre com `--cert-name severinobot.com --expand`, NUNCA cert separado)
7. Registre no catálogo: `/root/severino/ecosystem/produtos.json` (slug, subdominio, porta, checkout, ativacao)

## Onde cada produto deve ficar
- Código: `/root/severino/produtos/<slug>/`
- Dados: `/root/severino/produtos/<slug>/data/`
- PM2: `produto-<slug>` (fork, memória própria — restart de um não derruba os outros)

## Integração com o orquestrador (porta 3335)
- O orquestrador chama `POST /api/trial` do produto (header `x-ecosystem: 1`) ao ativar trial
- Eventos: `lead.novo`, `venda.confirmada` etc. via `POST http://127.0.0.1:3335/api/ecosystem/evento`
- `produtos.json` centraliza checkout/plano/ativacao — retentor/cobrador já leem ele
