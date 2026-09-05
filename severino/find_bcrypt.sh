#!/bin/bash
echo "=== procurar compare/hash no build do backend ==="
docker exec postiz sh -c 'find /app -path "*auth*" -name "*.js" 2>/dev/null | grep -i helper | head'
echo "=== grep bcrypt/compare em helpers ==="
docker exec postiz sh -c 'grep -rln "bcrypt\|compareSync\|hashSync" /app/packages /app/node_modules/@gitroom 2>/dev/null | head -10'