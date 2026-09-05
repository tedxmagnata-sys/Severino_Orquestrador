#!/bin/bash
echo "=== variáveis usadas pelo x.provider (todas) ==="
docker exec postiz sh -c 'grep -on "process.env.[A-Z_]*" /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/x.provider.js 2>/dev/null | sort -u'
echo "=== X_CLIENT ou OAUTH2? ==="
docker exec postiz sh -c 'grep -n "CLIENT_ID\|CLIENT_SECRET\|X_CLIENT\|oauth2" /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/x.provider.js 2>/dev/null | head'