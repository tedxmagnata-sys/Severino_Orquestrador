#!/bin/bash
echo "=== instagram standalone provider: credenciais ==="
docker exec postiz sh -c 'grep -n "process.env\|CLIENT_ID\|CLIENT_SECRET\|redirect" /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/instagram.standalone.provider.js 2>/dev/null | head -12'