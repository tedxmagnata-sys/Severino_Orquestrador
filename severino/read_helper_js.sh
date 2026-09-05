#!/bin/bash
echo "=== node_modules @gitroom/helpers/auth ==="
docker exec postiz sh -c 'ls /app/node_modules/@gitroom/helpers/auth/ 2>/dev/null'
echo "=== conteudo do auth.service (compilado) ==="
docker exec postiz sh -c 'cat /app/node_modules/@gitroom/helpers/auth/auth.service.js 2>/dev/null' | head -60