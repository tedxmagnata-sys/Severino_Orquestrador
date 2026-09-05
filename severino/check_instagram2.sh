#!/bin/bash
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local -x <<'SQL'
SELECT id, profile, name, "providerIdentifier", "deletedAt" FROM "Integration" WHERE "providerIdentifier" = 'instagram' ORDER BY "createdAt" DESC;
SQL