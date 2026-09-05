#!/bin/bash
docker exec postiz sh -c 'sed -n "120,170p" /app/apps/frontend/src/components/launches/add.provider.component.tsx' 2>/dev/null