# 🗂️ ORGANIZAÇÃO — DOIS INFOPRODUTOS, UM VPS

> Criado em 06/Ago/2026 para separar as sessões de trabalho do opencode.
> Cada infoproduto tem sua própria sessão. Este documento evita conflitos.

## 📡 A ARQUITETURA ATUAL (CRÍTICO — não alterar sem ler isto)

```
                    ┌─────────────────────────────────┐
                    │         NGINX (:80/:443)         │
                    │   proxy reverso → localhost:3334  │
                    │  SSL único (5 domínios no cert)   │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────▼─────────────────┐
                    │  SERVIDOR NODE ÚNICO             │
                    │  /root/severino/servidor.js      │
                    │  porta 3334 · PM2 id="severino"  │
                    │  ✓ SERVE OS DOIS PRODUTOS        │
                    └───────────────┬─────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
┌────────▼─────────┐      ┌─────────▼─────────┐      ┌─────────▼─────────┐
│ BTCPANEL (sessão A)│      │ SEVERINO (sessão B)│      │ ECOSSISTEMA        │
│ btcweatherpanel.com│      │ severinobot.com     │      │ (automação 24/7)    │
│ /btc-weather-panel/│      │ /severino-ia/        │      │ porta 3335          │
└───────────────────┘      └───────────────────┘      └───────────────────┘
```

## 🗃️ ONDE CADA PRODUTO VIVE

### BTC Weather Panel — sessão que ajusta ele
| Item | Caminho |
|---|---|
| Arquivos do produto | `/root/btc-weather-panel/` (git próprio) |
| URL de acesso | `https://btcweatherpanel.com/btc-weather-panel/` |
| Quem edita | **SÓ a sessão do BTC** |

### Severino Vendedor IA — ESTA sessão
| Item | Caminho |
|---|---|
| Front principal | `/root/.openclaw/canvas/consultor.html` |
| Painel admin | `/root/.openclaw/canvas/admin.html` |
| Ebook | `/root/.openclaw/canvas/ebook-severino.html` |
| Script apresentação | `/root/.openclaw/canvas/SCRIPT_APRESENTACAO.md` |
| URL de acesso | `https://severinobot.com/` (raiz) e `/severino-ia/` |
| Dados (cadastros) | `/root/severino/data/vendedores/` |

### COMPARTILHADO (perigo de conflito!)
| Item | Caminho | Regra |
|---|---|---|
| **Servidor Node** | `/root/severino/servidor.js` | ⚠️ **NÃO editar a rota do outro produto.** Cada sessão edita SÓ as suas rotas |
| **Nginx** | `/etc/nginx/sites-enabled/severino` | ⚠️ Editar com backup; `nginx -t` antes de reload |
| **Certificado SSL** | `/etc/letsencrypt/live/severinobot.com/` | ⚠️ Um cert cobre os 5 domínios — nunca emitir cert separado por domínio |
| **PM2** | app `severino` | ⚠️ `pm2 restart severino` derruba **os dois** por 1s |

## ⛔ REGRAS DE OURO PARA AS DUAS SESSÕES

1. **Antes de editar `servidor.js`:** faça backup → `cp servidor.js servidor.js.pre-<data>-<produto>`
2. **NUNCA toque na rota do outro produto** no servidor:
   - Sessão BTC edita: rota `/btc-weather-panel/*` (linha ~969) e APIs do BTC
   - Sessão Severino edita: rota `/severino-ia/*` (linha ~1001), `/api/vendedor*`, `/` host-aware (linha ~995)
3. **NUNCA emita certbot separado** por domínio. Usar: `certbot --cert-name severinobot.com --expand -d <todos os 5 domínios>`
4. **Backup do nginx:** `cp /etc/nginx/sites-enabled/severino /root/severino/nginx_severino.bak` antes de mudar
5. **Após mexer no servidor:** `node --check servidor.js && pm2 restart severino`
6. **Git:** canvas tem `.git` (sessão Severino), btc-weather-panel tem `.git` (sessão BTC). Cada um commita no seu.

## 🔄 MAPA DE ROTAS DO SERVIDOR (para referência rápida)

| URL | Serve | Responsável |
|---|---|---|
| `/` + host severinobot.com | `consultor.html` | Severino |
| `/` + outros hosts | redirect → `/btc-weather-panel/` | BTC |
| `/severino-ia/*` | `canvas/*` | Severino |
| `/btc-weather-panel/*` | `/root/btc-weather-panel/*` | BTC |
| `/api/vendedor*`, `/api/vendedores*` | dados Severino | Severino |
| `/api/diagnostico` | dados BTC | BTC |
| `/ecosistema/`, `/api/ecosystem/` | porta 3335 | Ecossistema |

## ✅ ESTADO ATUAL (06/Ago/2026)
- `severinobot.com` no ar (raiz = Severino, SSL ok, idioma automático)
- `btcweatherpanel.com` no ar (cert expandido e corrigido após quebra)
- Servidor.js: versão 46350 bytes, sintaxe OK, PM2 online
- Backups: nginx_severino.bak + servidor.js.pre--manual

## 🚨 SE ALGO QUEBRAR
- **BTC quebrou:** sessão BTC restaura `/root/btc-weather-panel/` e rota dele no servidor
- **Severino quebrou:** esta sessão restaura `consultor.html`, `admin.html`, `servidor.js`
- **SSL quebrou (ambos):** rodar o `certbot --expand` com os 5 domínios (acima)
- **Dados:** backups diários em `/root/backups/severino-<data>.tar.gz`


## ⭐ NOVO (07/Ago/2026) — Multi-produto

Para criar NOVO micro-SaaS no ecossistema, leia **`/root/severino/MULTIPRODUTO.md`** (Fase A).
Resumo: cada produto roda isolado em porta/PM2 próprio; NUNCA edite o servidor.js; registre no `ecosystem/produtos.json`;
provisione com `bash /root/severino/provisionar-produto.sh <slug> <nome> [porta]`.
