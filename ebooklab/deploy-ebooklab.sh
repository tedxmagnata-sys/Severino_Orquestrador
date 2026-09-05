#!/bin/bash
# =============================================================================
#  EbookLab — Deploy na VPS (Hostinger) com domínio próprio
#  Rota: https://ebooklab.severinobot.com  (raiz do subdomínio)
#  - /root/ebooklab + PM2 app "ebooklab" (porta 3336)
#  - Cria site nginx dedicado para o subdomínio (com server_name)
#  - Emite certificado SSL via certbot (Let's Encrypt)
#  - BASE_PATH vazio = app servido na raiz do domínio
#
#  Uso (como root na VPS):
#    1. Aponte o DNS: ebooklab  A  <ip-da-vps>
#    2. scp a pasta do app para /tmp/ebooklab na VPS
#    3. bash /tmp/ebooklab/deploy-ebooklab.sh
#    4. edite /root/ebooklab/.env (LLM_API_KEY, ADMIN_SECRET, KIWIFY_*)
#    5. pm2 restart ebooklab
# =============================================================================
set -euo pipefail

APP_DIR="/root/ebooklab"
PORT="${LEADBOOK_PORT:-3336}"
DOMAIN="${LEADBOOK_DOMAIN:-ebooklab.severinobot.com}"
NGINX_SITE="/etc/nginx/sites-available/ebooklab"
NGINX_LINK="/etc/nginx/sites-enabled/ebooklab"
SRC_DIR="${SRC_DIR:-/tmp/ebooklab}"
EMAIL="${LEADBOOK_EMAIL:-admin@${DOMAIN}}"

echo "==> [1/7] Verificando Node.js e PM2..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
node -v

echo "==> [2/7] Copiando arquivos para ${APP_DIR}..."
mkdir -p "${APP_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "${SRC_DIR}/" "${APP_DIR}/"
else
  cp -r "${SRC_DIR}/." "${APP_DIR}/"
fi
chmod -R a+rX "${APP_DIR}"

echo "==> [3/7] Criando .env se não existir..."
if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  echo "Criado ${APP_DIR}/.env — edite e preencha LLM_API_KEY e ADMIN_SECRET."
fi
# Garante BASE_PATH vazio (raiz do subdomínio)
sed -i '/^BASE_PATH=/d' "${APP_DIR}/.env"
echo "BASE_PATH=" >> "${APP_DIR}/.env"

echo "==> [4/7] Subindo via PM2..."
cd "${APP_DIR}"
pm2 start server.js --name ebooklab --time || pm2 restart ebooklab --time
pm2 save

echo "==> [5/7] Criando site nginx para ${DOMAIN}..."
cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
EOF
ln -sfn "${NGINX_SITE}" "${NGINX_LINK}"
nginx -t && nginx -s reload

echo "==> [6/7] SSL via Let's Encrypt (certbot)..."
if command -v certbot >/dev/null 2>&1; then
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect
else
  echo "[AVISO] certbot não instalado. Instale com:"
  echo "  apt-get install -y certbot python3-certbot-nginx"
  echo "  certbot --nginx -d ${DOMAIN} --redirect"
fi

echo "==> [7/7] Estado..."
pm2 list | grep ebooklab || true

echo ""
echo "================================================================"
echo "  PRONTO! Acesse: https://${DOMAIN}/"
echo "  Próximos passos:"
echo "   1. Edite ${APP_DIR}/.env (LLM_API_KEY + ADMIN_SECRET + KIWIFY_*)"
  echo "   2. pm2 restart ebooklab"
echo "   3. Teste: curl -s https://${DOMAIN}/api/health"
echo "  Rollback do nginx:"
echo "     rm -f ${NGINX_LINK} && nginx -t && nginx -s reload"
echo "================================================================"
