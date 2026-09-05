#!/bin/bash
set -e
python3 - <<'PY'
p = '/etc/nginx/sites-enabled/severino'
s = open(p).read()
n = s.count("server_name postiz.severino-btc.duckdns.org;")
s = s.replace(
  "server_name postiz.severino-btc.duckdns.org;",
  "server_name postiz.btcweatherpanel.com postiz.severino-btc.duckdns.org;"
)
open(p,'w').write(s)
print("substituicoes:", n)
PY

nginx -t
nginx -s reload
echo "nginx_ok"
