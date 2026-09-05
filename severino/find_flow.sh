#!/bin/bash
echo "=== onde fica o fluxo de conectar rede social (X, IG) ==="
docker exec postiz sh -c 'grep -rn "provider/connect\|/integrations/provider\|Connect" /app/apps/frontend/src/components --include=*.tsx 2>/dev/null | grep -iv "third" | head -15'
echo "=== pastas de integrações no frontend ==="
docker exec postiz sh -c 'ls /app/apps/frontend/src/components/ | head -30'