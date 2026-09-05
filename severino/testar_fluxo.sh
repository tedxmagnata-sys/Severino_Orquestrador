#!/bin/bash
echo "=== POST /api/lead ==="
curl -s -X POST https://btcweatherpanel.com/api/lead \
  -H 'Content-Type: application/json' \
  -d '{"email":"teste-prospeccao@example.com","nome":"Teste Prospeccao","telegram":"@teste"}'
echo
echo "=== POST /api/trial ==="
curl -s -X POST https://btcweatherpanel.com/api/trial \
  -H 'Content-Type: application/json' \
  -d '{"source":"teste-prospeccao"}'
echo
echo "=== lead gravado? ==="
grep -o 'teste-prospeccao[^"]*' /root/severino/ecosystem/leads.json | head -2
echo "=== limpar lead de teste ==="
sed -i '/teste-prospeccao/d' /root/severino/ecosystem/leads.json
echo "removido"
