#!/bin/bash
echo "=== @gitroom/helpers auth.service ==="
docker exec postiz sh -c 'cat /app/packages/helpers/src/auth/auth.service.ts 2>/dev/null || find /app -path "*helpers/auth*" -name "*.ts" -exec cat {} \; 2>/dev/null' | head -60