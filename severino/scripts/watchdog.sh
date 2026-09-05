#!/bin/bash
# 🦾 SEVERINO WATCHDOG — garante 24/7
# Executado a cada 1 minuto via cron. Se o servidor cair, reinicia via PM2.
# Regra EXECUTION.md: nunca deixar o servidor sem health check ativo.

HEALTH_URL="http://127.0.0.1:3334/api/health"
LOG="/root/severino/logs/watchdog.log"
TS=$(date '+%Y-%m-%d %H:%M:%S')

# Testa saúde do servidor
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null)

if [ "$CODE" != "200" ]; then
  echo "$TS ⚠️ Health check falhou (HTTP $CODE) — tentando restart PM2" >> "$LOG"
  pm2 restart severino --update-env >> "$LOG" 2>&1
  sleep 5
  CODE2=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" 2>/dev/null)
  if [ "$CODE2" == "200" ]; then
    echo "$TS ✅ Servidor recuperado após restart" >> "$LOG"
  else
    echo "$TS ❌ Servidor continua fora (HTTP $CODE2) — escalado para o autopilot" >> "$LOG"
    # O autopilot.js também tenta recovery interno; ambos cobrem o caso
  fi
fi
