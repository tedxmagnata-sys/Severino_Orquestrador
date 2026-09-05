#!/bin/bash
echo "=== login tedxmagnata@gmail.com ==="
curl -s -X POST "https://postiz.severino-btc.duckdns.org/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"tedxmagnata@gmail.com","password":"Severino#2026","provider":"LOCAL"}' | head -c 400
echo