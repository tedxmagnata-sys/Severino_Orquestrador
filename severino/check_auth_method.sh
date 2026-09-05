#!/bin/bash
echo "=== auth do public/v1 ==="
docker exec postiz sh -c 'grep -n "Auth\|auth\|apiKey\|API_KEY\|Bearer\|Authorization\|@UseGuards\|@CheckPolicies\|Guard" /app/apps/backend/dist/apps/backend/src/public-api/routes/v1/public.integrations.controller.js 2>/dev/null | head -20'
echo "=== ou ver se usa AGENT_API_KEY ==="
docker exec postiz sh -c 'grep -rn "AGENT_API_KEY" /app/apps/backend --include=*.js 2>/dev/null | head -5'