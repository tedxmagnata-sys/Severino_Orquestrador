#!/bin/bash
set -e
cd /root/severino
sed -i 's|POSTIZ_API_URL=https://postiz.btcweatherpanel.com/api|POSTIZ_API_URL=https://postiz.btcweatherpanel.com/api/public/v1|' .env
grep -n POSTIZ .env