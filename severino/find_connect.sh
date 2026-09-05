#!/bin/bash
echo "=== procurar onde conecta novas redes sociais ==="
docker exec postiz sh -c 'grep -rn "Connect\|Add Channel\|addNew\|onAdd\|ConnectProvider\|providers.manager" /app/apps/frontend/src/components/calendar --include=*.tsx 2>/dev/null | head -15'
echo "=== procurar lista de providers disponíveis no frontend ==="
docker exec postiz sh -c 'grep -rn "getAvailableIntegrations\|available\|identifiers\|third-party" /app/apps/frontend/src/components --include=*.tsx 2>/dev/null | head -15'