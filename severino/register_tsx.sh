#!/bin/bash
echo "=== register.tsx (fluxo de registro do frontend) ==="
docker exec postiz sh -c 'cat /app/apps/frontend/src/components/auth/register.tsx' 2>/dev/null | head -120
