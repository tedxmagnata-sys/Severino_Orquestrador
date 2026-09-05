#!/bin/bash
set -e
echo "=== testar criacao de post via API ==="
curl -s -w '\nHTTP %{http_code}' -X POST 'https://postiz.btcweatherpanel.com/api/public/v1/posts' \
  -H 'Authorization: ee7d49ae16827e4b040c49630689fbc1eb34ea00e2e73ef9372eb7f440a5ee91' \
  -H 'Content-Type: application/json' \
  -d '{"type":"draft","posts":[{"identifier":"x","value":[{"text":"teste automacao #bitcoin"}]}]}'
echo