#!/bin/bash
echo "=== .env dentro do container (/app/.env) ==="
docker exec postiz sh -c 'ls -la /app/.env 2>/dev/null && grep -iE "JWT_SECRET|FRONTEND_URL|NEXT_PUBLIC_BACKEND_URL|MAIN_URL" /app/.env 2>/dev/null | sed "s/=.*/=***/"'
echo "=== can-register ==="
curl -s -o /dev/null -w 'HTTP %{http_code}\n' "https://postiz.severino-btc.duckdns.org/api/auth/can-register"
echo "=== register endpoint direto ==="
curl -s -X POST "https://postiz.severino-btc.duckdns.org/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@climadobtc.com","name":"Admin","password":"Severino#2026"}' | head -c 300
echo
