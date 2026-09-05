#!/bin/bash
echo "=== teste login/registro direto no container (porta 4200) ==="
curl -s -o /dev/null -w 'frontend /auth -> HTTP %{http_code}\n' http://127.0.0.1:4200/auth
echo "=== teste chamada API de registro ==="
curl -s -X POST http://127.0.0.1:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@climadobtc.com","password":"Severino#2026","name":"Admin Clima BTC"}' 2>&1 | head -c 300
echo
echo "=== teste se NEXT_PUBLIC_BACKEND_URL acessível via https ==="
curl -s -o /dev/null -w 'https postiz /api -> HTTP %{http_code}\n' https://postiz.severino-btc.duckdns.org/api/
