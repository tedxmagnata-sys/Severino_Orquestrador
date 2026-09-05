#!/bin/bash
echo "=== atualizando senha ==="
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local < /root/severino/q3.sql 2>&1