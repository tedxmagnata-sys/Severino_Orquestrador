#!/bin/bash
cd /root/severino
TOKEN=$(grep -oP 'TELEGRAM_TOKEN=\K.*' .env)
# busca vídeos recentes no canal
curl -s "https://api.telegram.org/bot${TOKEN}/getChat" -F "chat_id=-1004348516544" | head -c 300
echo
echo "=== Últimas mensagens com vídeo (getUpdates) ==="
curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for u in d.get('result', []):
        m = u.get('channel_post') or u.get('message')
        if not m: continue
        if 'video' in m:
            vid = m['video']
            print('chat:', m['chat']['id'], '| cap:', (m.get('caption') or '')[:60])
except Exception as e:
    print('ERRO', e)
"