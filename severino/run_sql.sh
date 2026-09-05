#!/bin/bash
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local < /root/severino/q1.sql 2>&1
echo "=== Organization ==="
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local < /root/severino/q2.sql 2>&1