#!/bin/bash
echo "=== public.integrations.controller (rotas + auth) ==="
docker exec postiz sh -c 'grep -n "Controller\|@Post\|@Get\|publicApi\|CheckPolicies\|AuthorizationActions\|@UseGuards\|headers\|apiKey" /app/apps/backend/dist/apps/backend/src/public-api/routes/v1/public.integrations.controller.js' 2>/dev/null | head -30