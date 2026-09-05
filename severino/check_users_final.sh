#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "SELECT id, email, "providerName", activated, "isSuperAdmin" FROM "User";" 2>&1
echo "=== Organization ==="
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "SELECT id, name, slug FROM "Organization";" 2>&1