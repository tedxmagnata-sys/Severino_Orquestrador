#!/bin/bash
# Backup di??rio do ecossistema Severino (F3 ??? cobertura completa)
# Mant??m 30 dias. Roda via cron ??s 03:00.
set -u

BACKUP_DIR="/root/backups"
LOG="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"

STAMP=$(date +%F)
TARGET="$BACKUP_DIR/severino-$STAMP.tar.gz"

echo "[$(date -u +%FT%TZ)] iniciando -> severino-$STAMP.tar.gz" >> "$LOG"

tar -czf "$TARGET" \
  --exclude='*/node_modules' \
  -C / \
  /root/severino \
  /root/btc-weather-panel \
  /root/leadbook \
  /etc/nginx/sites-enabled/severino \
  /etc/letsencrypt/live \
  /root/.pm2/dump.pm2 2>/dev/null

if [ -s "$TARGET" ]; then
  echo "[$(date -u +%FT%TZ)] ok tamanho=$(du -h "$TARGET" | cut -f1)" >> "$LOG"
else
  echo "[$(date -u +%FT%TZ)] ERRO target vazio" >> "$LOG"
fi

# Mant??m 30 dias
find "$BACKUP_DIR" -name 'severino-*.tar.gz' -mtime +30 -delete 2>/dev/null

echo "Backup concluido: $TARGET"
