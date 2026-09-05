#!/bin/bash
UP=$(curl -s -X POST 'https://postiz.btcweatherpanel.com/api/public/v1/upload' \
  -H 'Authorization: ee7d49ae16827e4b040c49630689fbc1eb34ea00e2e73ef9372eb7f440a5ee91' \
  -F 'file=@/root/severino/ecosystem/data/card_today.png')
IDPT=$(echo "$UP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
IMGPTH=$(echo "$UP" | grep -o '"path":"[^"]*"' | cut -d'"' -f4)
echo "id: $IDPT"
echo "path: $IMGPTH"
curl -s -w '\nHTTP %{http_code}' -X POST 'https://postiz.btcweatherpanel.com/api/public/v1/posts' \
  -H 'Authorization: ee7d49ae16827e4b040c49630689fbc1eb34ea00e2e73ef9372eb7f440a5ee91' \
  -H 'Content-Type: application/json' \
  -d "{\"shortLink\":true,\"date\":\"2026-08-08T10:00:00.000Z\",\"tags\":[{\"tag\":\"btc\"},{\"tag\":\"bitcoin\"}],\"posts\":[{\"integration\":{\"id\":\"cmshy3hgm0001ny6ng293kp4j\"},\"value\":[{\"content\":\"teste final com imagem #btc\",\"image\":[{\"id\":\"$IDPT\",\"path\":\"$IMGPTH\"}]}],\"settings\":{\"who_can_reply_post\":\"everyone\"}}]}"