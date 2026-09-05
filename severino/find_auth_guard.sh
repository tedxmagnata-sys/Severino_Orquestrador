#!/bin/bash
echo "=== guard ou middleware de auth no public/v1 ==="
docker exec postiz sh -c 'grep -rn "Invalid API\|api-key\|x-api-key\|apiKey" /app/apps/backend/dist/apps/backend/src/public-api --include=*.js 2>/dev/null | head -15'
echo "=== procurar guard que valida chave ==="
docker exec postiz sh -c 'find /app/apps/backend/dist -name "*.js" -exec grep -l "Invalid API key" {} \; 2>/dev/null'