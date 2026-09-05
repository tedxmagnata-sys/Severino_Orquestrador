#!/bin/bash
echo "=== AuthChecker ==="
docker exec postiz sh -c 'grep -rn "comparePassword" /app/apps/backend/src --include=*.ts | grep -v node_modules | head'
echo "=== onde está definido ==="
docker exec postiz sh -c 'find /app -name "auth.checker.ts" 2>/dev/null; grep -rn "class AuthChecker\|comparePassword(" /app/apps/backend/src --include=*.ts 2>/dev/null | head -5'