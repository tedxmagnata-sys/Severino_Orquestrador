#!/bin/bash
echo "=== public.controller.ts (endpoints públicos) ==="
docker exec postiz sh -c 'grep -n "Controller\|Post(\|Get(\|publicApi\|@Use" /app/apps/backend/src/api/routes/public.controller.ts' 2>/dev/null | head -25
echo "=== api-key/rotate ==="
docker exec postiz sh -c 'sed -n "245,270p" /app/apps/backend/src/api/routes/users.controller.ts' 2>/dev/null