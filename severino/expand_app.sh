#!/bin/bash
set -e
cp /etc/nginx/sites-enabled/severino /root/severino/nginx_severino_pre_app.bak
certbot --nginx --cert-name severinobot.com --expand \
  -d severinobot.com -d www.severinobot.com \
  -d btcweatherpanel.com -d www.btcweatherpanel.com \
  -d severino-btc.duckdns.org -d postiz.severino-btc.duckdns.org \
  -d postiz.btcweatherpanel.com -d app.btcweatherpanel.com \
  --non-interactive --agree-tos 2>&1 | tail -6
echo "cert_ok"