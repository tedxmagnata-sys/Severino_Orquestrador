#!/bin/bash
echo "=== restante das tabelas + User ==="
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "\dt" 2>&1 | tail -20
echo "=== User table ==="
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "\d \"User\"" 2>&1 | head -25