#!/bin/bash
docker exec postiz sh -c 'sed -n "88,140p" /app/apps/backend/src/api/routes/integrations.controller.ts' 2>/dev/null