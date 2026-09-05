#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "SELECT id, email, activated, "createdAt" FROM "User" ORDER BY "createdAt" DESC LIMIT 5;" 2>&1