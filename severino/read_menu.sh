#!/bin/bash
docker exec postiz sh -c 'sed -n "100,175p" /app/apps/frontend/src/components/layout/top.menu.tsx' 2>/dev/null