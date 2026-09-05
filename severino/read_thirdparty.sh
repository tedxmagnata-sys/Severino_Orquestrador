#!/bin/bash
docker exec postiz sh -c 'sed -n "90,200p" /app/apps/frontend/src/components/third-parties/third-party.component.tsx' 2>/dev/null