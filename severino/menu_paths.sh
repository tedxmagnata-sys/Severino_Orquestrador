#!/bin/bash
docker exec postiz sh -c 'grep -n "path: \x27/\|name: t(" /app/apps/frontend/src/components/layout/top.menu.tsx' 2>/dev/null | head -60