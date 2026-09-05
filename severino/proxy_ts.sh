#!/bin/bash
echo "=== proxy.ts (config NextAuth) ==="
docker exec postiz sh -c 'cat /app/apps/frontend/src/proxy.ts' 2>/dev/null
echo ""
echo "=== procurar secret env usage ==="
docker exec postiz sh -c 'grep -rn "NEXTAUTH_SECRET\|AUTH_SECRET\|AUTH_URL\|AUTH_TRUST" /app/apps/frontend/ 2>/dev/null | head'
