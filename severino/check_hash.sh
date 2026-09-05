#!/bin/bash
echo "=== hash de senha no backend ==="
docker exec postiz sh -c 'grep -n "bcrypt\|compare\|hash" /app/apps/backend/src/services/auth/auth.service.ts' 2>/dev/null | head -15