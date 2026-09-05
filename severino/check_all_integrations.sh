#!/bin/bash
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local -x <<'SQL'
SELECT * FROM "Integration";
SQL