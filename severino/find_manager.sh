#!/bin/bash
echo "=== twitter provider? ==="
docker exec postiz sh -c 'ls /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/ | grep -iE "twitter|x\.|x " | head'
echo "=== como o manager lista providers e esconde sem client id ==="
docker exec postiz sh -c 'grep -rn "CLIENT_ID\|clientId\|hidden\|identifiers\|isGeneral" /app/apps/backend/dist/apps/backend/src/services/auth/providers/oauth.provider.js 2>/dev/null | head -12'
echo "=== integration manager: lista providers ==="
docker exec postiz sh -c 'grep -rn "getSocialIntegrations\|clientId\|CLIENT_ID\|hidden" /app/apps/backend/dist/apps/backend/src/services/integrations/integration.manager.js 2>/dev/null | head -12'