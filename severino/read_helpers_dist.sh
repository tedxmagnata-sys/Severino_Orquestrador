#!/bin/bash
echo "=== helpers auth.service compilado ==="
docker exec postiz sh -c 'cat /app/apps/backend/dist/libraries/helpers/src/auth/auth.service.js' 2>/dev/null | head -80