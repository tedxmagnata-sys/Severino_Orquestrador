#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -x -c "SELECT id, state, error FROM \"Post\" ORDER BY \"createdAt\" DESC LIMIT 3;"