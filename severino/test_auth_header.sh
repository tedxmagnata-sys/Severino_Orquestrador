#!/bin/bash
echo "=== testar com header sem Bearer ==="
curl -s -w '\nHTTP %{http_code}' -X GET "https://postiz.btcweatherpanel.com/api/public/v1/posts" \
  -H "Authorization: ee7d49ae16827e4b040c49630689fbc1eb34ea00e2e73ef9372eb7f440a5ee91"
echo

echo "=== verificar apiKey na Organization ==="
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -x -c 'SELECT id, name, "apiKey" FROM "Organization";'