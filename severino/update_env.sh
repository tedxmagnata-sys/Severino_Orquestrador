#!/bin/bash
set -e
cd /root/severino
sed -i 's|POSTIZ_API_URL=https://postiz.severino-btc.duckdns.org/api|POSTIZ_API_URL=https://postiz.btcweatherpanel.com/api|' .env
grep -n POSTIZ .env
echo "env_ok"