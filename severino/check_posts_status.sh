#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -x -c "SELECT id, status, type, date, "createdAt" FROM "Post" ORDER BY "createdAt" DESC LIMIT 5;"