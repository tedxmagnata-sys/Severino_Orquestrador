#!/bin/bash
sleep 20
echo "=== status do container ==="
docker ps --filter name=postiz --format '{{.Names}} {{.Status}}'
echo "=== teste novamente ==="
curl -s -o /dev/null -w 'api -> HTTP %{http_code}\n' "https://postiz.btcweatherpanel.com/api/auth/can-register"
curl -s -o /dev/null -w 'auth -> HTTP %{http_code}\n' -L "https://postiz.btcweatherpanel.com/auth"
echo "=== porta interna 4010 ==="
curl -s -o /dev/null -w 'localhost:4010 -> HTTP %{http_code}\n' "http://127.0.0.1:4010/api/auth/can-register"