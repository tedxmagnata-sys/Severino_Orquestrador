#!/bin/bash
docker exec postiz sh -c 'sed -n "140,175p" /app/apps/backend/dist/libraries/nestjs-libraries/src/database/prisma/posts/posts.service.js' 2>/dev/null