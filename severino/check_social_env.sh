#!/bin/bash
echo "=== variáveis de providers sociais no container ==="
docker exec postiz env 2>/dev/null | grep -iE "TWITTER|X_CLIENT|INSTAGRAM|META|CLIENT_ID|CLIENT_SECRET|REDIRECT" | sed 's/=.*/=***/'
echo "=== todas as env com CLIENT ==="
docker exec postiz env 2>/dev/null | grep -i "client" | sed 's/=.*/=***/'
echo "=== exemplo de env do repositório ==="
docker exec postiz sh -c 'grep -iE "TWITTER|INSTAGRAM|X_CLIENT" /app/apps/backend/src/config.ts 2>/dev/null | head'