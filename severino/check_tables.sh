#!/bin/bash
echo "=== tabelas no banco ==="
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "\dt" 2>&1 | head -40