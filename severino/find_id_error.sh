#!/bin/bash
docker exec postiz sh -c 'grep -B 5 -A 2 "integration id" /app/apps/backend/dist/apps/backend/src/public-api/routes/v1/public.integrations.controller.js' 2>/dev/null