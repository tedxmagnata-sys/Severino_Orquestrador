#!/bin/bash
echo "=== procurar auth.service compilado no dist ==="
docker exec postiz sh -c 'find /app -name "auth.service.js" 2>/dev/null | head -10'
echo "=== procurar no dist do backend ==="
docker exec postiz sh -c 'ls /app/apps/backend/dist/services/auth/ 2>/dev/null'