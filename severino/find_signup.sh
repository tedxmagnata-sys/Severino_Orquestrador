#!/bin/bash
echo "=== listar apps e packages ==="
docker exec postiz sh -c 'ls /app/apps/ 2>/dev/null; echo ---; ls /app/packages 2>/dev/null'
echo "=== procurar register/signup no backend ==="
docker exec postiz sh -c 'grep -rn "signup\|register" /app/apps/backend/src/controllers 2>/dev/null | head -8'
echo "=== rotas auth backend ==="
docker exec postiz sh -c 'find /app/apps/backend/src -path "*auth*" -name "*.ts" 2>/dev/null | head'
