#!/bin/bash
echo "=== x.provider: credenciais ==="
docker exec postiz sh -c 'grep -n "CLIENT_ID\|CLIENT_SECRET\|redirect\|authUrl\|getConfig\|process.env" /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/x.provider.js 2>/dev/null | head -15'
echo ""
echo "=== instagram.provider: credenciais ==="
docker exec postiz sh -c 'grep -n "CLIENT_ID\|CLIENT_SECRET\|redirect\|authUrl\|process.env\|META\|IG_" /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/instagram.provider.js 2>/dev/null | head -15'