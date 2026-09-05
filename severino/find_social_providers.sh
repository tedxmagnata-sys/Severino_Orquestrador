#!/bin/bash
echo "=== procurar providers sociais no frontend ==="
docker exec postiz sh -c 'grep -rln "twitter\|instagram\|provider" /app/apps/frontend/src/components/integrations --include=*.tsx 2>/dev/null | head'
echo "=== lista de providers do IntegrationManager ==="
docker exec postiz sh -c 'ls /app/apps/frontend/src/components/integrations/ 2>/dev/null'
echo "=== procurar onde lista providers para adicionar ==="
docker exec postiz sh -c 'grep -rln "GetProviders\|providers.manager\|getSocialIntegrations\|integrations/available" /app/apps/frontend/src --include=*.tsx 2>/dev/null | head -8'