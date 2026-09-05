#!/bin/bash
# =============================================================================
#  LeadBook Engine v1.0 — Deploy no VPS Hostinger
#  Rota: severinobot.com/leadbook  (mesmo domínio, caminho /leadbook)
#  - /root/leadbook + PM2 app "leadbook" (porta 3336)
#  - Insere location /leadbook/ no site nginx existente (com backup)
#  - NÃO cria cert SSL novo (o cert único já cobre severinobot.com)
#  - NÃO toca nas rotas do servidor.js do Severino
#
#  Uso (como root na VPS):
#    1. scp a pasta leadbook para /tmp/leadbook na VPS
#    2. bash /tmp/leadbook/deploy.sh
#    3. edite /root/leadbook/.env (LLM_API_KEY, ADMIN_SECRET)
#    4. pm2 restart leadbook
# =============================================================================
set -euo pipefail

APP_DIR="/root/leadbook"
PORT="${LEADBOOK_PORT:-3336}"
BASE_PATH="${LEADBOOK_BASE_PATH:-/leadbook}"
NGINX_SITE="/etc/nginx/sites-enabled/severino"
SRC_DIR="${SRC_DIR:-/tmp/leadbook}"

echo "==> [1/6] Verificando Node.js e PM2..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
node -v

echo "==> [2/6] Copiando arquivos para ${APP_DIR}..."
mkdir -p "${APP_DIR}"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "${SRC_DIR}/" "${APP_DIR}/"
else
  cp -r "${SRC_DIR}/." "${APP_DIR}/"
fi
chmod -R a+rX "${APP_DIR}"

echo "==> [3/6] Criando .env se não existir..."
if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  echo "Criado ${APP_DIR}/.env — edite e preencha LLM_API_KEY e ADMIN_SECRET."
fi
# Garante o base path correto
if ! grep -q "^BASE_PATH=" "${APP_DIR}/.env"; then
  echo "BASE_PATH=${BASE_PATH}" >> "${APP_DIR}/.env"
fi

echo "==> [4/6] Subindo via PM2..."
cd "${APP_DIR}"
pm2 start server.js --name leadbook --time || pm2 restart leadbook --time
pm2 save

echo "==> [5/6] Configurando nginx (location ${BASE_PATH}/ -> :${PORT})..."
if [ ! -f "${NGINX_SITE}" ]; then
  echo "[ERRO] Site nginx ${NGINX_SITE} não encontrado. Deploy manual do location necessário."
  exit 1
fi
cp "${NGINX_SITE}" "${NGINX_SITE}.bak-leadbook-$(date +%Y%m%d)"

python3 - <<'PYEOF'
import os, sys
PORT = os.environ.get('LEADBOOK_PORT', '3336')
BASE_PATH = os.environ.get('LEADBOOK_BASE_PATH', '/leadbook')
p = os.environ.get('NGINX_SITE', '/etc/nginx/sites-enabled/severino')
src = open(p, encoding="utf-8").read()
marker = "# >>> LEADBOOK >>>"
if marker in src:
    print("LEADBOOK: location já presente, nada a fazer")
    sys.exit(0)
if "location / {" not in src:
    print("LEADBOOK: [ERRO] não achei 'location / {' para inserir — insira manualmente:")
    print(f"""location {BASE_PATH}/ {{
    proxy_pass http://127.0.0.1:{PORT};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}}""")
    sys.exit(1)
block = f"""{marker}
location {BASE_PATH}/ {{
    proxy_pass http://127.0.0.1:{PORT};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}}
"""
src = src.replace("location / {", block + "location / {")
open(p, "w", encoding="utf-8").write(src)
print("LEADBOOK: location inserido antes de 'location / {'")
PYEOF

nginx -t && nginx -s reload

echo "==> [6/6] Estado..."
pm2 list | grep leadbook || true

echo ""
echo "================================================================"
echo "  PRONTO! Acesse: https://severinobot.com${BASE_PATH}/"
echo "  Próximos passos:"
echo "   1. Edite ${APP_DIR}/.env (LLM_API_KEY + ADMIN_SECRET)"
echo "   2. pm2 restart leadbook"
echo "   3. Teste: curl -s https://severinobot.com${BASE_PATH}/api/health"
echo "  Rollback do nginx (se necessário):"
echo "     cp ${NGINX_SITE}.bak-leadbook-* ${NGINX_SITE} && nginx -t && nginx -s reload"
echo "================================================================"
