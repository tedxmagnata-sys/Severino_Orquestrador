#!/bin/bash
cd /root/severino
TOKEN=$(grep -oP 'TELEGRAM_TOKEN=\K.*' .env)
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/setChatPhoto" -F "chat_id=-1004348516544" -F "photo=@data/perfil_v1.png"
echo
