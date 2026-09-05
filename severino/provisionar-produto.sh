#!/usr/bin/env bash
# ============================================================
# provisionar-produto.sh — cria um NOVO micro-SaaS no ecossistema
# Uso: ./provisionar-produto.sh <slug> <nome> [porta]
#   ex: ./provisionar-produto.sh meuapp "Meu App" 3342
#
# Cria /root/severino/produtos/<slug>/ isolado (porta própria, PM2 próprio)
# NÃO toca no servidor.js nem no nginx automaticamente (passos manuais no fim).
# ============================================================
set -euo pipefail

BASE=/root/severino
TEMPLATE=$BASE/templates/produto-novo
SLUG="${1:?use: provisionar-produto.sh <slug> <nome> [porta]}"
NOME="${2:?use: provisionar-produto.sh <slug> <nome> [porta]}"
PORTA="${3:-3340}"

# Valida slug (só minúsculas, números, hífen)
if ! [[ "$SLUG" =~ ^[a-z0-9-]+$ ]]; then
  echo "❌ Slug inválido: use só minúsculas, números e hífen (ex: meu-app)."; exit 1
fi

# Porta livre?
if ss -tln 2>/dev/null | grep -q ":$PORTA "; then
  echo "❌ Porta $PORTA já em uso. Escolha outra (3340-3349)."; exit 1
fi

DEST=$BASE/produtos/$SLUG
if [ -d "$DEST" ]; then echo "❌ Já existe $DEST."; exit 1; fi

echo "🔧 Criando produto '$NOME' (slug=$SLUG, porta=$PORTA)..."

# 1) Copia template
cp -r "$TEMPLATE" "$DEST"
mkdir -p "$DEST/data"

# 2) Ajusta placeholder na landing
sed -i "s/{PRODUTO_NOME}/$NOME/g; s|{PRODUTO_DESCRICAO}|Descrição do $NOME — edite em public/index.html|g" "$DEST/public/index.html"

# 3) Inicia PM2 (fork, próprio — restart não derruba os outros)
cd "$DEST"
PORTA=$PORTA pm2 start app.js --name "produto-$SLUG" --update-env
pm2 save

echo "✅ Produto criado em $DEST"
echo ""
echo "──────────────────────────────────────────────"
echo "PRÓXIMOS PASSOS MANUAIS:"
echo "1) Edite $DEST/app.js (lógica do trial, validação, checkout)"
echo "2) Edite $DEST/public/index.html (sua landing)"
echo "3) Adicione o bloco nginx (subdomínio app.$SLUG.severinobot.com → :$PORTA)"
echo "   — snippet: $TEMPLATE/nginx.conf"
echo "   — arquivo: /etc/nginx/sites-enabled/severino (backup + nginx -t antes)"
echo "4) Expanda o SSL (NUNCA cert separado):"
echo "   certbot --nginx --cert-name severinobot.com --expand \\"
echo "     -d app.$SLUG.severinobot.com"
echo "   depois: certbot install --cert-name severinobot.com --nginx"
echo "5) Registre no catálogo: $BASE/ecosystem/produtos.json"
echo "   (slug, subdominio, porta $PORTA, checkout, ativacao.trial)"
echo "6) Confira: pm2 logs produto-$SLUG e curl http://127.0.0.1:$PORTA/api/health"
echo "──────────────────────────────────────────────"
