#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -c "\d "User"" 2>&1 | head -30