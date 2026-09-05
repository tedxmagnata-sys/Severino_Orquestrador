# ⚠️ AVISO PARA A SESSÃO DO BTC WEATHER PANEL
## Mudança de infraestrutura compartilhada (06/Ago/2026)

> Leia este arquivo antes de mexer em servidor, nginx ou SSL.
> Doc completo de organização: `/root/severino/ORGANIZACAO_VPS.md`

---

O VPS agora serve **2 infoprodutos no mesmo servidor Node (porta 3334, PM2 id="severino")**:

| | BTC Weather Panel | Severino Vendedor IA |
|---|---|---|
| Domínio | btcweatherpanel.com | severinobot.com |
| Arquivos | `/root/btc-weather-panel/` | `/root/.openclaw/canvas/` |
| Rota | `/btc-weather-panel/*` | `/severino-ia/*` e `/` (raiz) |

## 🔴 O que mudou e afeta você

### 1. Nginx
- `server_name` agora inclui `severinobot.com`, `www.severinobot.com` e o block do **Postiz**
- Backups: `/root/severino/nginx_severino.bak` e `/root/severino/nginx_severino_pre_postiz_btc.bak`
- Se for mexer no nginx: `nginx -t` antes do reload

### 2. Certificado SSL é ÚNICO (cobre 7 domínios)
- Arquivo do cert: `/etc/letsencrypt/live/severinobot.com/`
- Cobre: `severinobot.com`, `www.severinobot.com`, `btcweatherpanel.com`, `www.btcweatherpanel.com`, `severino-btc.duckdns.org`, `postiz.severino-btc.duckdns.org`, **`postiz.btcweatherpanel.com`**, **`app.btcweatherpanel.com`**
- ⛔ **NUNCA emitir certbot separado** para btcweatherpanel.com, postiz ou qualquer subdomínio — isso quebrou o SSL antes e foi corrigido.
- Comando correto se precisar renovar/expandir:
  ```
  certbot --nginx --cert-name severinobot.com --expand \
    -d severinobot.com -d www.severinobot.com \
    -d btcweatherpanel.com -d www.btcweatherpanel.com \
    -d severino-btc.duckdns.org -d postiz.severino-btc.duckdns.org \
    -d postiz.btcweatherpanel.com -d app.btcweatherpanel.com
  ```
  Depois rode `certbot install --cert-name severinobot.com --nginx` para instalar no server block.

### 2.5 Painel do cliente (app.btcweatherpanel.com)
- **Acesso:** `https://app.btcweatherpanel.com` — painel mobile onde o cliente consulta licença (`/api/license/validate`) ou ativa teste grátis (`/api/trial`)
- Arquivo: `/root/btc-weather-panel/app.html`
- Rota no `servidor.js` (host-aware): quando `Host: app.btcweatherpanel.com` → serve `app.html` (backup: `servidor.js.pre-app-*`)
- nginx serve `app.btcweatherpanel.com` no block principal 443 → proxy `127.0.0.1:3334`
- Deploy: só enviar novo `app.html` + `pm2 restart severino`

### 3. Postiz (self-hosted, divulgação X/IG)
- **Acesso:** `https://postiz.btcweatherpanel.com/auth/login`
- Login: `tedxmagnata@gmail.com` / senha definida na sessão
- ⚠️ **Não usar botões Google/GitHub** no login (OAuth não configurado → erro `flowName=GeneralOAuthFlow`). Usar e-mail + senha (provider LOCAL).
- Docker em `/root/postiz-app/` — override em `docker-compose.override.yaml` define `MAIN_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL` = `https://postiz.btcweatherpanel.com`, porta `127.0.0.1:4010:5000`
- nginx faz proxy de `postiz.btcweatherpanel.com` (e `postiz.severino-btc.duckdns.org` como fallback) para `127.0.0.1:4010`
- `.env` do severino: `POSTIZ_API_URL=https://postiz.btcweatherpanel.com/api`

### 4. Rota `/` no servidor.js virou host-aware
- `severinobot.com` (e www) → serve `consultor.html`
- `btcweatherpanel.com` e demais → redireciona para `/btc-weather-panel/` (seu comportamento está intacto)
- Se editar a rota `/` (linha ~995), **preserve essa lógica de host**.

### 5. PM2 restart derruba os dois por ~1s
- O app `severino` serve ambos os produtos. `pm2 restart severino` pisca os dois (normal, 1s).

### 6. Documento de organização
- `/root/severino/ORGANIZACAO_VPS.md` — leia antes de qualquer mudança em servidor/nginx/SSL.

## ✅ Seu produto BTC: status testado (06/Ago/2026)
- `https://btcweatherpanel.com/` → 200
- `https://btcweatherpanel.com/btc-weather-panel/` → 200
- `https://postiz.btcweatherpanel.com/auth` → 200
- `https://app.btcweatherpanel.com` → 200 (painel do cliente)
- SSL válido (Let's Encrypt, expira 03/Nov/2026, renovação automática)

## 🚨 Se o SSL do BTC quebrar de novo
1. Confirme se alguém emitiu cert separado → NÃO faça isso
2. Re-expanda o cert único com o comando acima
3. `nginx -t && nginx -s reload`
