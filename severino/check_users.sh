#!/bin/bash
echo "=== usuários no banco do postiz ==="
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "SELECT id, email, active FROM \"User\" ORDER BY createdat DESC LIMIT 5;" 2>&1
