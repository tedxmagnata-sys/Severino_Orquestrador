#!/bin/bash
echo "=== env do container postiz (secrets ocultos) ==="
docker exec postiz sh -c 'env' | grep -iE 'SECRET|URL|NEXTAUTH|PORT' | sed 's/=.*/=***/'
echo
echo "=== .env real dentro do container ==="
docker exec postiz sh -c 'ls -la ../../.env 2>/dev/null; grep -iE "JWT_SECRET|FRONTEND_URL|NEXT_PUBLIC_BACKEND_URL|NEXTAUTH|AUTH_" ../../.env 2>/dev/null | sed "s/=.*/=***/"'
