#!/bin/bash
echo "=== endpoints publicos do Postiz ==="
for e in "/api/public/v1" "/public/v1" "/api/health" "/api/ws" "/api/admin"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://postiz.btcweatherpanel.com$e")
  echo "$e -> $code"
done
echo "=== ver como gerar API key (docs no código) ==="
docker exec postiz sh -c 'grep -rn "public/v1\|API_KEY\|api-key\|publicApi" /app/apps/backend/src/api/routes --include=*.ts 2>/dev/null | head -10'