#!/bin/bash
docker exec postiz-postgres psql -U postiz-user -d postiz-db-local -x -c '\d "Post"' | head -40