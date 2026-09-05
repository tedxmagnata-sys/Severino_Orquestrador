#!/bin/bash
echo "=== getPosts no controller ==="
docker exec postiz sh -c 'grep -A 20 "getPosts\|getActiveIntegrations" /app/apps/backend/dist/apps/backend/src/public-api/routes/v1/public.integrations.controller.js' 2>/dev/null | head -40
echo "=== como cria post ==="
docker exec postiz sh -c 'grep -A 30 "createPost" /app/apps/backend/dist/apps/backend/src/public-api/routes/v1/public.integrations.controller.js' 2>/dev/null | head -40