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
    ports:
      - '127.0.0.1:4010:5000'
EOF
cd /root/postiz-app
docker compose up -d 2>&1 | tail -4
sleep 12
echo "=== validação após subir ==="
curl -s -o /dev/null -w 'postiz -> HTTP %{http_code}\n' "https://postiz.btcweatherpanel.com/api/auth/can-register"
docker exec postiz env 2>/dev/null | grep -c "^X_API" | xargs echo "vars X setadas:"