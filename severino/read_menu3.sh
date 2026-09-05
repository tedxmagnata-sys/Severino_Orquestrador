#!/bin/bash
docker exec postiz sh -c 'grep -n "firstMenu\|mainMenu\|name:" /app/apps/frontend/src/components/layout/top.menu.tsx' 2>/dev/null | head -30
echo "=== começo do arquivo ==="
docker exec postiz sh -c 'sed -n "1,40p" /app/apps/frontend/src/components/layout/top.menu.tsx' 2>/dev/null