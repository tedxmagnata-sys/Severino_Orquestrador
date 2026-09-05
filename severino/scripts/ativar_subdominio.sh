#!/bin/bash
# =====================================================================
# ATIVA agendabarber.severinobot.com
# Pre-requisito: registro DNS A "agendabarber" -> 187.127.42.146 na Porkbun
# Uso: bash ativar_subdominio.sh
# =====================================================================
set -e

DOMINIO="agendabarber.severinobot.com"
IP_ALVO="187.127.42.146"

echo "== 1. Verificar DNS resolvendo =="
if ! getent hosts "$DOMINIO" | grep -q "$IP_ALVO"; then
  echo "Aviso: $DOMINIO nao resolve para $IP_ALVO ainda."
  echo "Crie o registro A (name=agendabarber, content=187.127.42.146) na Porkbun e aguarde."
  read -p "Continuar mesmo assim? (s/N) " resp
  [ "$resp" = "s" ] || { echo "Abortado. Faca o DNS no Porkbun primeiro."; exit 1; }
fi

echo "== 2. Expandir certificado (HTTP-01 via nginx) =="
certbot certonly --nginx -d severinobot.com -d www.severinobot.com -d "$DOMINIO" --expand -n --agree-tos

echo "== 3. Criar server blocks (novo arquivo) =="
CONF="/etc/nginx/sites-enabled/agendabarber"
if [ -f "$CONF" ]; then
  echo "Ja existe $CONF, preservando."
else
cat > "$CONF" <<'EOF'
# agendabarber.severinobot.com ??? CortaFila -> porta 3341
server {
    if ($host = agendabarber.severinobot.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name agendabarber.severinobot.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name agendabarber.severinobot.com;
    ssl_certificate /etc/letsencrypt/live/severinobot.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/severinobot.com/privkey.pem; # managed by Certbot
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3341;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
fi

echo "== 4. Testar e recarregar nginx =="
nginx -t && systemctl reload nginx

echo "== 5. Validar fim a fim =="
sleep 2
echo "-- HTTPS:"
curl -s -o /dev/null -w "  %{http_code} %{url_effective}\n" "https://$DOMINIO/" --max-time 15
curl -s -o /dev/null -w "  %{http_code} %{url_effective}\n" "https://$DOMINIO/manifest.json" --max-time 15
echo "-- PWA presente? (esperado manifest.json/theme-color/serviceWorker/navigator.serviceWorker):"
curl -s "https://$DOMINIO/" --max-time 15 | grep -o 'manifest.json\|theme-color\|serviceWorker' | sort -u
echo "== PRONTO =="
