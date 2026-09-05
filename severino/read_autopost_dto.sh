#!/bin/bash
docker exec postiz sh -c 'cat /app/apps/backend/dist/libraries/nestjs-libraries/src/dtos/autopost/autopost.dto.js' 2>/dev/null | head -80