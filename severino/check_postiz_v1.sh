#!/bin/bash
echo "=== rotas public/v1 no build do backend ==="
docker exec postiz sh -c 'grep -rn "public/v1\|publicV1\|v1/posts\|/v1" /app/apps/backend/dist --include=*.js 2>/dev/null | grep -i "public\|post" | head -8'
echo "=== versão do postiz ==="
docker exec postiz sh -c 'grep -m1 "\"version\"" /app/package.json 2>/dev/null'
echo "=== rotas registradas (público) ==="
docker exec postiz sh -c 'grep -rn "Controller(\x27/public\x27\|Controller(\"/public" /app/apps/backend/src/api/routes --include=*.ts 2>/dev/null | head'