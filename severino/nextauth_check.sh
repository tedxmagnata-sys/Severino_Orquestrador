#!/bin/bash
echo "=== next-auth no package.json? ==="
docker exec postiz sh -c 'grep -i "next-auth\|nextauth\|@auth" /app/apps/frontend/package.json 2>/dev/null'
echo "=== arquivos auth next ==="
docker exec postiz sh -c 'find /app/apps/frontend -name "*.ts" -path "*auth*" 2>/dev/null | head; find /app/apps/frontend -name "route.ts" -path "*auth*" 2>/dev/null | head'
echo "=== env completo container (chaves so) ==="
docker exec postiz sh -c 'env | cut -d= -f1 | sort'
