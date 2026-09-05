#!/bin/bash
echo "=== gerando hash bcrypt para Severino#2026 ==="
docker exec postiz sh -c 'node -e "const b=require(\"bcrypt\"); console.log(b.hashSync(\"Severino#2026\",10));"'