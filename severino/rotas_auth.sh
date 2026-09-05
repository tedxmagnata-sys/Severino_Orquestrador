#!/bin/bash
echo "=== rotas auth.controller.ts ==="
docker exec postiz sh -c 'grep -n "Controller\|Post\|Get(" /app/apps/backend/src/api/routes/auth.controller.ts' 2>/dev/null | head -20
echo "=== service de auth: como valida secret ==="
docker exec postiz sh -c 'grep -rn "JWT_SECRET\|jwt" /app/apps/backend/src/services/auth/auth.service.ts' 2>/dev/null | head -10
echo "=== como o frontend chama o backend (auth) ==="
docker exec postiz sh -c 'grep -rn "NEXT_PUBLIC_BACKEND_URL\|internalFetch" /app/apps/frontend/src/components/auth 2>/dev/null | head -8'
