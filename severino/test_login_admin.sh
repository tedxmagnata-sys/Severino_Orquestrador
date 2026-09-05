#!/bin/bash
echo "=== login admin@climadobtc.com ==="
curl -s -X POST "https://postiz.severino-btc.duckdns.org/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@climadobtc.com","password":"Severino#2026","provider":"LOCAL"}' | head -c 400
echo