# Seção NOVA (07/Ago/2026) — ECOSSISTEMA MULTI-PRODUTO (Fase A)

> Como criar um NOVO micro-SaaS no ecossistema SEM risco de conflito.
> Aplica-se a TODAS as sessões do opencode que forem adicionar produtos.

## Princípio central: CADA PRODUTO É ISOLADO

```
nginx (443, cert único)
 ├── app.btcweatherpanel.com ──► 3334 (servidor.js — LEGADO, não tocar)
 ├── app.<produto1>.severinobot.com ──► 334X (produto1 — PM2 "produto-<slug>")
 ├── app.<produto2>.severinobot.com ──► 334Y (produto2 — PM2 "produto-<slug>")
 └── severinobot.com/ecosistema ──► 3335 (orquestrador compartilhado)
```

- **NUNCA** edite o `servidor.js` para adicionar produto novo. Cada produto = processo próprio.
- `pm2 restart` de um produto NÃO derruba os outros (isolação por porta/processo).

## Como criar um produto novo (2 min)

```
bash /root/severino/provisionar-produto.sh <slug> <nome> [porta]
# ex: bash /root/severino/provisionar-produto.sh meuapp "Meu App" 3342
```

O script:
1. Cria `/root/severino/produtos/<slug>/` a partir do template
2. Sobe `pm2 produto-<slug>` (porta própria, env PORTA)
3. Imprime os passos manuais seguintes (nginx, SSL, catálogo)

## Passos manuais após provisionar (impressos pelo script)

1. Editar `app.js` (trial/validação/checkout do produto)
2. Editar `public/index.html` (landing)
3. **Nginx**: adicionar subdomínio `app.<slug>.severinobot.com` → `127.0.0.1:<porta>`
   - arquivo: `/etc/nginx/sites-enabled/severino` (sempre backup + `nginx -t` antes)
   - snippet: `/root/severino/templates/produto-novo/nginx.conf`
4. **SSL** (NUNCA cert separado): expandir o cert único
   ```
   certbot --nginx --cert-name severinobot.com --expand -d app.<slug>.severinobot.com
   certbot install --cert-name severinobot.com --nginx
   ```
5. **Catálogo**: registrar em `/root/severino/ecosystem/produtos.json`
   (slug, subdominio, porta, checkout Kiwify, plano, ativacao.trial/link)
6. Testar: `curl http://127.0.0.1:<porta>/api/health`

## Catálogo central produtos.json (Fase A)

- Um arquivo lista TODOS os produtos: `btcweather`, `severino-consultor-ia`, novos...
- Campos por produto: `id, slug, nome, url, subdominio, caminho, porta, pm2, status, plano, checkout, checkoutUrl, canal, persona, argumentos, ativacao`
- Os agentes (retentor/cobrador/conversor/onboarder) JÁ leem `produtos[lead.produto]` — cadastrar no catálogo já integra o produto ao funil, checkouts e sequências.
- Template de exemplo: `padrao-produto-novo` (porta 3340)

## Isolamento de dados

- Cada produto tem seus dados em `/root/severino/produtos/<slug>/data/`
- NÃO misturar no `purchases.json`/`funil.json` do btcweather
- O orquestrador compartilha o funil (campo `produto` distingue) — retentor segue cada lead pelo produto certo

## Git

- `ecosystem/` tem git próprio → commitar produtos.json e agentes lá
- `produtos/<slug>/` pode ter git próprio por sessão
- Template + provisioner vivem em `/root/severino/templates/` e `/root/severino/provisionar-produto.sh` (fora de git, no disco)
