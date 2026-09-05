#!/bin/bash
sleep 25
curl -s -o /dev/null -w 'api -> HTTP %{http_code}\n' "https://postiz.btcweatherpanel.com/api/auth/can-register"
curl -s -o /dev/null -w 'auth -> HTTP %{http_code}\n' -L "https://postiz.btcweatherpanel.com/auth"