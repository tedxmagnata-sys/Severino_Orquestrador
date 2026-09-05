#!/bin/bash
echo "=== menu lateral / navegação no frontend ==="
docker exec postiz sh -c 'grep -rn "Integrations\|integrations\|Connect\|Sites\|Calendars" /app/apps/frontend/src/components/layout --include=*.tsx 2>/dev/null | head -20'