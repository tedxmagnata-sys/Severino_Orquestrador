#!/bin/bash
echo "=== servidor.js btc-weather-panel (linhas) ==="
wc -l /root/btc-weather-panel/servidor.js 2>/dev/null
echo "=== rotas ==="
grep -n "api/trial\|api/lead\|api/weather/config\|api/license\|api/ecosystem\|api/weather" /root/severino/servidor.js | head -30
echo "=== rotas no btc panel servidor ==="
grep -n "api/trial\|api/lead\|api/weather/config\|api/license\|api/ecosystem\|api/weather" /root/btc-weather-panel/servidor.js | head -30
echo "=== painel tem form lead? ==="
grep -c "lead\|trial\|form" /root/btc-weather-panel/index.html 2>/dev/null
