#!/bin/bash
echo "=== import de AuthChecker ==="
docker exec postiz sh -c 'head -30 /app/apps/backend/src/services/auth/auth.service.ts' 2>/dev/null | grep -n "AuthChecker\|import"
echo "=== procurar AuthChecker em todo o app ==="
docker exec postiz sh -c 'grep -rn "AuthChecker" /app/apps/backend/src 2>/dev/null | grep "import\|from" | head -5'