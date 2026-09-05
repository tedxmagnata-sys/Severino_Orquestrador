#!/bin/bash
echo "=== app.btcweatherpanel.com ==="
curl -s -o /dev/null -w 'raiz -> HTTP %{http_code}\n' "https://app.btcweatherpanel.com/"
echo "=== validação de licença via API ==="
curl -s "https://app.btcweatherpanel.com/api/license/validate?code=VIP7-7HI6RL" | head -c 300
echo
echo "=== trial via API ==="
curl -s -X POST "https://app.btcweatherpanel.com/api/trial" -H 'Content-Type: application/json' -d '{}' | head -c 300
echo