#!/bin/bash
echo "=== rota /integrations/list no backend ==="
docker exec postiz sh -c 'grep -rn "integrations/list\|/integrations" /app/apps/backend/src/api/routes/integrations.controller.ts 2>/dev/null | head -10'
echo "=== como decide quais providers mostrar (client id check) ==="
docker exec postiz sh -c 'grep -rn "GITHUB_CLIENT_ID\|CLIENT_ID\|hidden\|isGeneral\|providers.manager" /app/apps/backend/src/api/routes/integrations.controller.ts 2>/dev/null | head -15'