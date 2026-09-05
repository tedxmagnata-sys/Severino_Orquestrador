#!/bin/bash
set -e
cd /root/severino
# 1. Atualizar .env
sed -i 's|POSTIZ_API_KEY=|POSTIZ_API_KEY=ee7d49ae16827e4b040c49630689fbc1eb34ea00e2e73ef9372eb7f440a5ee91|' .env
grep -n POSTIZ .env

# 2. Testar API pública do Postiz
echo "=== testando API key ==="
curl -s -w '\nHTTP %{http_code}' -X GET "https://postiz.btcweatherpanel.com/api/public/v1/posts" \
  -H "Authorization: Bearer ee7d49ae16827e4b040c49630689fbc1eb34ea00e2e73ef9372eb7f440a5ee91" | tail -5

# 3. Gerar um post de teste (sem publicar)
echo "=== gerando post ==="
node /root/severino/ecosystem/gerar_post_redes.js 2>&1 | tail -3

# 4. Adicionar publicar_redes no cron (depois do gerar_post_redes)
echo "=== cron antes ==="
crontab -l | grep -i "publicar\|redes"

# Remove linha antiga se existir e adiciona nova
(crontab -l 2>/dev/null | grep -v "publicar_redes\|gerar_post_redes"; echo "10 8 * * * /usr/bin/node /root/severino/ecosystem/postar_card.js >> /root/severino/logs/postar_card.log 2>&1 && /usr/bin/node /root/severino/ecosystem/gerar_post_redes.js >> /root/severino/logs/postar_card.log 2>&1 && /usr/bin/node /root/severino/ecosystem/publicar_redes.js >> /root/severino/logs/postar_card.log 2>&1") | crontab -

echo "=== cron depois ==="
crontab -l | grep -i "publicar\|redes\|postar"