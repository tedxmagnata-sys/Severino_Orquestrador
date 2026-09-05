#!/bin/bash
docker exec postiz sh -c 'sed -n "40,100p" /app/apps/frontend/src/components/layout/top.menu.tsx' 2>/dev/null