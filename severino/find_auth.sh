#!/bin/bash
echo "=== procurar config NextAuth no frontend ==="
docker exec postiz sh -c 'grep -rn "AUTH_SECRET\|NEXTAUTH_SECRET\|trustHost\|process.env.JWT" /app/apps/frontend/src 2>/dev/null | head -15'
echo "=== config auth.ts ==="
docker exec postiz sh -c 'find /app/apps/frontend/src -name "auth*" -o -name "*Auth*" 2>/dev/null | head'
echo "=== procurar GeneralOAuthFlow ==="
docker exec postiz sh -c 'grep -rn "GeneralOAuthFlow\|authConfig\|providers" /app/apps/frontend/src 2>/dev/null | head -10'
