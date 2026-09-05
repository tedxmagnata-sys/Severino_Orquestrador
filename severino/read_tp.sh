#!/bin/bash
docker exec postiz sh -c 'grep -n "@Get\|@Controller\|hidden\|isGeneral\|identifier" /app/apps/backend/src/api/routes/third-party.controller.ts' 2>/dev/null | head -20