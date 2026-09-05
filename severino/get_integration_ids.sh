#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -x -c "SELECT id, profile, \"internalId\", \"providerIdentifier\" FROM \"Integration\" WHERE \"deletedAt\" IS NULL;"