#!/bin/bash
set -e
cat > /root/postiz-app/docker-compose.override.yaml <<'EOF'
version: '3.8'
services:
  postiz:
    environment:
      MAIN_URL: 'https://postiz.btcweatherpanel.com'
      FRONTEND_URL: 'https://postiz.btcweatherpanel.com'
      NEXT_PUBLIC_BACKEND_URL: 'https://postiz.btcweatherpanel.com/api'
      JWT_SECRET: 'btc-weather-panel-postiz-7f3a9c1e4b2d8a5f6c0e9d1a4b7c2e5f'
      X_API_KEY: '2P95VaBYzkbkHTEyH90LNBgmy'
      X_API_SECRET: 'tJq3qNaccrxZiBRQIO79v6g4jCSB8CqZyOlRqvHoZ62qrWA9OM'
      FACEBOOK_APP_ID: '1608231767585409'
      FACEBOOK_APP_SECRET: 'fe2c6bd63e14e2c249bcec088f26e717'
    ports:
      - '127.0.0.1:4010:5000'
EOF
cd /root/postiz-app
docker compose up -d 2>&1 | tail -4
sleep 15
echo "=== validação ==="
curl -s -o /dev/null -w 'api -> HTTP %{http_code}\n' "https://postiz.btcweatherpanel.com/api/auth/can-register"
curl -s -o /dev/null -w 'auth -> HTTP %{http_code}\n' -L "https://postiz.btcweatherpanel.com/auth"
docker exec postiz env 2>/dev/null | grep -E "^X_API|^FACEBOOK" | awk -F= '{print $1"=SETO"}'