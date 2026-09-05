#!/bin/bash
echo "=== esperado para twitter/x no código ==="
docker exec postiz sh -c 'grep -rn "TWITTER_\|X_" /app/apps/backend/dist/apps/backend/src/services/auth/providers/oauth.provider.js 2>/dev/null | grep -i client | head -5'
echo "=== provider twitter no integration manager ==="
docker exec postiz sh -c 'grep -rn "TWITTER_CLIENT_ID\|TWITTER_CLIENT_SECRET\|process.env.TWITTER" /app/apps --include=*.js --include=*.ts 2>/dev/null | head -6'
echo "=== provider instagram/meta ==="
docker exec postiz sh -c 'grep -rn "META_CLIENT_ID\|META_CLIENT_SECRET\|INSTAGRAM_CLIENT\|IG_CLIENT" /app/apps --include=*.js --include=*.ts 2>/dev/null | head -6'