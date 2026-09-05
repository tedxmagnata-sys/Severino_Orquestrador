#!/bin/bash
cd /root/severino
TOKEN=$(grep -oP 'TELEGRAM_TOKEN=\K.*' .env)
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendPhoto" \
  -F "chat_id=-1004348516544" \
  -F "photo=@/root/btc-weather-panel/ebook-capa.png" \
  -F 'parse_mode=HTML' \
  -F 'caption=🌱 <b>Todo fruto tem estação. O Bitcoin também.</b>

Aprendi a Estratégia do Agricultor: planta no medo, cultiva no neutro e colhe na euforia. 🌾

📘 E-book grátis: https://btcweatherpanel.com/ebook
🎁 Teste 7 dias sem cartão: https://btcweatherpanel.com/oferta'
echo
