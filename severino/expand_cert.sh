#!/bin/bash
set -e
cp /etc/nginx/sites-enabled/severino /root/severino/nginx_severino_pre_postiz_btc.bak
echo "backup_nginx_ok"
# expandir cert para incluir postiz.btcweatherpanel.com
certbot --nginx --cert-name severinobot.com --expand \
  -d severinobot.com -d www.severinobot.com \
  -d btcweatherpanel.com -d www.btcweatherpanel.com \
  -d severino-btc.duckdns.org -d postiz.severino-btc.duckdns.org \
  -d postiz.btcweatherpanel.com \
  --non-interactive --agree-tos
echo "cert_expandido_ok"
