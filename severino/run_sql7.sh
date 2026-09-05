#!/bin/bash
docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local -x < /root/severino/q7.sql 2>&1