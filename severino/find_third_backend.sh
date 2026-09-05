#!/bin/bash
echo "=== rota GET /third-party no backend ==="
docker exec postiz sh -c 'grep -n "third-party\|thirdParty\|ThirdParty" /app/apps/backend/src/api/routes/integrations.controller.ts 2>/dev/null | head -10'
echo "=== procurar lista de third parties ==="
docker exec postiz sh -c 'grep -rn "third-party" /app/apps/backend/src --include=*.ts 2>/dev/null | grep -i "get\|list\|controller" | head -10'