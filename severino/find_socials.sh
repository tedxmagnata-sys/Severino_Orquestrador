#!/bin/bash
echo "=== procurar providers sociais (twitter, instagram) no build ==="
docker exec postiz sh -c 'find /app/apps/backend/dist -path "*integration*social*" -name "twitter*" -o -path "*social*" -name "instagram*" 2>/dev/null | head'
echo "=== listar providers sociais ==="
docker exec postiz sh -c 'ls /app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/social/ 2>/dev/null | head -40'
echo "=== procurar uso de CLIENT_ID para decidir mostrar provider ==="
docker exec postiz sh -c 'grep -rn "clientId\|CLIENT_ID\|isGeneral\|hidden" /app/apps/backend/dist/apps/backend/src/services/auth/providers/providers.manager.js 2>/dev/null | head -10'