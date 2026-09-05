#!/bin/bash
echo "=== quais providers têm CLIENT_ID/SECRET (valores) ==="
docker exec postiz sh -c 'env | grep -E "CLIENT_ID|CLIENT_SECRET" | awk -F= "{print \$1\"=\"(length(\$2)>0 ? \"SETO\" : \"VAZIO\")}"'
echo "=== procurar env de twitter/instagram esperadas no código ==="
docker exec postiz sh -c 'grep -rn "TWITTER_CLIENT\|X_CLIENT\|INSTAGRAM_CLIENT\|IG_CLIENT\|META_CLIENT" /app/apps/backend/src /app/apps/backend/dist --include=*.ts --include=*.js 2>/dev/null | head -8'