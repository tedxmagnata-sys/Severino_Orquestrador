#!/bin/bash
echo "=== registro LOCAL com todos os campos ==="
curl -s -X POST "https://postiz.severino-btc.duckdns.org/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@climadobtc.com","name":"Admin Clima BTC","company":"Clima do BTC","password":"Severino#2026","provider":"LOCAL","providerToken":""}' | head -c 400
echo