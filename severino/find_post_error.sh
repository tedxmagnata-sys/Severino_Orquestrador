#!/bin/bash
docker exec postiz sh -c 'grep -rn "All posts must have" /app/apps --include="*.js" --include="*.ts" 2>/dev/null | head -5'