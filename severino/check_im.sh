#!/bin/bash
docker exec postiz sh -c 'grep -rn "list" /app/apps/backend/src/api/routes/integrations.controller.ts 2>/dev/null | head -10'
echo "=== IntegrationManager ==="
docker exec postiz sh -c 'grep -rn "isGeneral\|CLIENT_ID\|hidden\|getIntegrations\|list(" /app/apps/backend/src/services/integrations/integration.manager.ts 2>/dev/null | head -20'