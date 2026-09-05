#!/bin/bash
echo "=== redirect URI do X ==="
docker exec postiz sh -c 'grep -n "X_URL\|integrations/social/x\|generateAuthLink" /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/x.provider.js 2>/dev/null | head -6'
echo "=== X_API_KEY e FACEBOOK_APP no env ==="
docker exec postiz sh -c 'env | grep -E "^X_|FACEBOOK" | awk -F= "{print \$1\"=\"(length(\$2)>0 ? \"SETO\" : \"VAZIO\")}"'
echo "=== FACEBOOK_APP_ID no env ==="
docker exec postiz env 2>/dev/null | grep -iE "FACEBOOK_APP" | sed 's/=.*/=***/'