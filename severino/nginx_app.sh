#!/bin/bash
set -e
# 1. Adicionar app.btcweatherpanel.com ao server_name do block principal 443
python3 - <<'PY'
p = '/etc/nginx/sites-enabled/severino'
s = open(p).read()
# block principal 443 tem server_name com os domínios principais
s = s.replace(
  "server_name severinobot.com www.severinobot.com severino-btc.duckdns.org btcweatherpanel.com www.btcweatherpanel.com;",
  "server_name severinobot.com www.severinobot.com severino-btc.duckdns.org btcweatherpanel.com www.btcweatherpanel.com app.btcweatherpanel.com;"
)
# redirect http 80 do block principal
s = s.replace(
  "server_name severinobot.com www.severinobot.com severino-btc.duckdns.org btcweatherpanel.com www.btcweatherpanel.com 187.127.42.146;",
  "server_name severinobot.com www.severinobot.com severino-btc.duckdns.org btcweatherpanel.com www.btcweatherpanel.com app.btcweatherpanel.com 187.127.42.146;"
)
open(p,'w').write(s)
print('nginx atualizado')
PY
nginx -t && nginx -s reload
echo "nginx_ok"
# 2. Instalar cert para app
certbot install --cert-name severinobot.com --nginx --non-interactive --agree-tos 2>&1 | grep -i "app.btcweatherpanel\|error\|installed\|deployed" | head -10
nginx -t && nginx -s reload
echo "done"