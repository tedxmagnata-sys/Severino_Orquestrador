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
    ports:
      - '127.0.0.1:4010:5000'
EOF
cd /root/postiz-app
docker compose up -d 2>&1 | tail -5
sleep 8
echo "=== teste https novo domínio ==="
curl -s -o /dev/null -w 'https://postiz.btcweatherpanel.com -> HTTP %{http_code}\n' "https://postiz.btcweatherpanel.com/api/auth/can-register"
curl -s -o /dev/null -w 'https://postiz.btcweatherpanel.com/auth -> HTTP %{http_code}\n' -L "https://postiz.btcweatherpanel.com/auth"