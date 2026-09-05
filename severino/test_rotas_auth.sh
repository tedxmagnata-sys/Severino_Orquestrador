#!/bin/bash
echo "=== rotas auth disponiveis ==="
for r in "/auth" "/auth/login" "/auth/register" "/auth/login-required"; do
  code=$(curl -sL -o /dev/null -w '%{http_code}' "https://postiz.severino-btc.duckdns.org$r")
  echo "$r -> HTTP $code"
done
echo "=== qual rota o /auth raiz redireciona ==="
curl -s -o /dev/null -w 'redirect para: %{url_effective}\n' -L "https://postiz.severino-btc.duckdns.org/auth"
