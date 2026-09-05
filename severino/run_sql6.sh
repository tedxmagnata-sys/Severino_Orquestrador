#!/bin/bash
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local < /root/severino/q6.sql 2>&1