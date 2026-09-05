#!/bin/bash
# security-agent.sh — Agente de Segurança do Ecossistema Severino
# Modos: backup | restore | manifest | status
# Uso: ./security-agent.sh backup
#       ./security-agent.sh manifest <arquivo.tar.gz>
#       ./security-agent.sh restore <arquivo.tar.gz>

set -euo pipefail

DIR_BACKUP="/root/backups"
DIR_ECOSSISTEMA="/root/ecossistema"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
TARBALL="$DIR_BACKUP/severino-ecossistema-$TIMESTAMP.tar.gz"
TMPDIR=$(mktemp -d /tmp/backup-XXXX)
EXCLUDE="--exclude=node_modules --exclude=.cache --exclude=.npm --exclude=.local --exclude=logs --exclude=*.log --exclude=.pm2/logs"

# ======================== HELPERS ========================
log() { echo "[$(date +%H:%M:%S)] $*"; }
err() { echo "[ERRO] $*" >&2; exit 1; }

limpar() { rm -rf "$TMPDIR"; }
trap limpar EXIT

# ======================== COMANDOS ========================

backup() {
  mkdir -p "$DIR_BACKUP"
  log "Iniciando backup do Ecossistema Severino..."

  # --- 1. PM2 dump ---
  log "Coletando PM2 ecosystem..."
  pm2 ecosystem 2>/dev/null || pm2 dump 2>/dev/null || true
  cp /root/ecosystem.config.js "$TMPDIR/pm2-ecosystem.config.js" 2>/dev/null || true

  # --- 2. Nginx configs ---
  log "Coletando Nginx configs..."
  mkdir -p "$TMPDIR/nginx"
  cp -r /etc/nginx/sites-enabled/* "$TMPDIR/nginx/" 2>/dev/null || true
  cp /etc/nginx/nginx.conf "$TMPDIR/nginx/" 2>/dev/null || true

  # --- 3. Certbot SSL (apenas lista de domínios, os certificados expiram) ---
  log "Coletando lista de certificados SSL..."
  ls /etc/letsencrypt/live/ > "$TMPDIR/certbot-dominios.txt" 2>/dev/null || true

  # --- 4. Serviços (excluindo node_modules) ---
  log "Coletando servicos..."
  mkdir -p "$TMPDIR/servicos"

  for dir in severino severino-vendedor trader-dashboard btc-weather-panel leadbook ebooklab worker-engine ecossistema; do
    src="/root/$dir"
    if [ -d "$src" ]; then
      log "  -> $dir"
      # Rsync-like: copia excluindo node_modules, logs, cache
      rsync -a --exclude=node_modules --exclude='*.log' --exclude=.cache --exclude=.npm "$src/" "$TMPDIR/servicos/$dir/" 2>/dev/null || \
      cp -r "$src" "$TMPDIR/servicos/" 2>/dev/null || true
    fi
  done

  # --- 5. Env files ---
  log "Coletando variaveis de ambiente (.env)..."
  mkdir -p "$TMPDIR/envs"
  for f in /root/severino/.env /root/severino-vendedor/.env /root/trader-dashboard/.env /root/leadbook/.env /root/ebooklab/.env; do
    if [ -f "$f" ]; then
      cp "$f" "$TMPDIR/envs/"
    fi
  done

  # --- 6. Web files (hub, ebook) ---
  log "Coletando arquivos web..."
  mkdir -p "$TMPDIR/www"
  cp -r /var/www/html/* "$TMPDIR/www/" 2>/dev/null || true

  # --- 7. Manifest ---
  log "Gerando manifesto..."
  {
    echo "Ecosystem: Severino"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Host: $(hostname)"
    echo "Services:"
    pm2 list --no-color 2>/dev/null | grep -E 'online|errored|stopped' || echo "(sem PM2)"
    echo ""
    echo "Nginx domains:"
    for f in "$TMPDIR/nginx"/*; do
      [ -f "$f" ] && grep -n 'server_name\|proxy_pass' "$f" 2>/dev/null || true
    done
    echo ""
    echo "SSL domains:"
    cat "$TMPDIR/certbot-dominios.txt" 2>/dev/null || echo "(nenhum)"
    echo ""
    echo "Env files:"
    ls "$TMPDIR/envs/" 2>/dev/null
  } > "$TMPDIR/MANIFEST.md"

  # --- 8. Compactar ---
  log "Compactando backup..."
  cd "$TMPDIR"
  tar czf "$TARBALL" .
  cd /root

  # --- 9. Manter apenas os últimos 30 backups ---
  log "Limpando backups antigos (mantendo 30)..."
  ls -1t "$DIR_BACKUP"/severino-ecossistema-*.tar.gz 2>/dev/null | tail -n +31 | while read f; do rm -f "$f"; done

  # --- 10. Tamanho ---
  SIZE=$(du -h "$TARBALL" | cut -f1)
  log "Backup concluido: $TARBALL ($SIZE)"
  log "Para copiar para sua maquina local:"
  log "   scp -i ~/.ssh/id_ed25519 root@$(curl -s ifconfig.me 2>/dev/null || echo '<IP>'):$TARBALL ."
  echo ""
  echo "MANIFEST:"
  cat "$TMPDIR/MANIFEST.md"
}

manifest() {
  local F="$1"
  if [ -z "$F" ] || [ ! -f "$F" ]; then
    err "Uso: $0 manifest <arquivo.tar.gz>"
  fi
  echo "=== MANIFEST: $F ==="
  tar xf "$F" -O MANIFEST.md
  echo ""
  echo "=== CONTEUDO ==="
  tar tzf "$F" | head -60
  echo ""
  local SIZE=$(du -h "$F" | cut -f1)
  echo "Tamanho: $SIZE"
}

restore() {
  local F="$1"
  if [ -z "$F" ] || [ ! -f "$F" ]; then
    err "Uso: $0 restore <arquivo.tar.gz>"
  fi
  echo ""
  echo "⚠️  RESTORE EM NOVO VPS — MODO INTERATIVO"
  echo "=========================================="
  echo ""
  echo "Este comando restaura todos os arquivos do ecossistema."
  echo "Nao sobrescreve arquivos existentes sem confirmacao."
  echo ""
  echo "Arquivos serao extraidos em: /root/"
  echo ""
  read -p "Continuar? (s/N) " -n 1 resp
  echo ""
  if [ "$resp" != "s" ] && [ "$resp" != "S" ]; then
    echo "Cancelado."
    exit 0
  fi

  log "Extraindo backup..."
  tar xzf "$F" -C /tmp/backup-restore

  # Restaurar servicos
  for dir in severino severino-vendedor trader-dashboard btc-weather-panel leadbook ebooklab worker-engine ecossistema; do
    src="/tmp/backup-restore/servicos/$dir"
    dst="/root/$dir"
    if [ -d "$src" ]; then
      if [ -d "$dst" ]; then
        echo "  $dir: ja existe, copiando apenas arquivos novos..."
        rsync -a --ignore-existing "$src/" "$dst/"
      else
        echo "  $dir: restaurando..."
        mkdir -p "$dst"
        cp -r "$src/" "$dst/"
      fi
    fi
  done

  # Restaurar envs
  log "Restaurando variaveis de ambiente..."
  for f in /tmp/backup-restore/envs/*; do
    if [ -f "$f" ]; then
      local nome=$(basename "$f")
      local destino="/root/$nome/$(dirname "$f")"
      # Procura o .env correspondente
      case "$nome" in
        severino.env) cp "$f" "/root/severino/.env" 2>/dev/null || true ;;
        severino-vendedor.env) cp "$f" "/root/severino-vendedor/.env" 2>/dev/null || true ;;
        trader-dashboard.env) cp "$f" "/root/trader-dashboard/.env" 2>/dev/null || true ;;
        leadbook.env) cp "$f" "/root/leadbook/.env" 2>/dev/null || true ;;
        ebooklab.env) cp "$f" "/root/ebooklab/.env" 2>/dev/null || true ;;
        *) cp "$f" "/root/ecossistema/$nome" 2>/dev/null || true ;;
      esac
    fi
  done

  # Restaurar nginx
  log "Restaurando configs Nginx..."
  if [ -d /tmp/backup-restore/nginx ]; then
    cp /tmp/backup-restore/nginx/* /etc/nginx/sites-enabled/ 2>/dev/null || true
    if [ -f /tmp/backup-restore/nginx/nginx.conf ]; then
      cp /tmp/backup-restore/nginx/nginx.conf /etc/nginx/nginx.conf 2>/dev/null || true
    fi
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null && log  "Nginx OK" || log "Verificar Nginx manualmente"
  fi

  # Restaurar web
  log "Restaurando arquivos web..."
  if [ -d /tmp/backup-restore/www ]; then
    cp -r /tmp/backup-restore/www/* /var/www/html/ 2>/dev/null || true
  fi

  # Instalar dependencias
  log "Instalando dependencias dos servicos..."
  cd /root/severino && [ -f package.json ] && npm install --omit=dev 2>/dev/null && log "  severino OK" || true
  cd /root/trader-dashboard && [ -f package.json ] && npm install --omit=dev 2>/dev/null && log "  trader-dashboard OK" || true

  rm -rf /tmp/backup-restore
  log "Restore concluido!"
  echo ""
  echo "Proximos passos:"
  echo "  1. PM2: pm2 start ecosystem.config.js   (se disponivel)"
  echo "  2. SSL: certbot --nginx para renovar certificados"
  echo "  3. Validar: curl https://severinobot.com"
}

status() {
  echo "=== STATUS DO ECOSSISTEMA ==="
  echo ""
  echo "--- PM2 ---"
  pm2 list 2>/dev/null || echo "(sem PM2)"
  echo ""
  echo "--- Nginx ---"
  nginx -t 2>&1 || true
  echo ""
  echo "--- Disk ---"
  df -h / | tail -1
  echo ""
  echo "--- Ultimos backups ---"
  ls -1ht "$DIR_BACKUP"/severino-ecossistema-*.tar.gz 2>/dev/null | head -5 || echo "(nenhum)"
  echo ""
  echo "--- Certificates ---"
  ls /etc/letsencrypt/live/ 2>/dev/null || echo "(nenhum)"
}

# ======================== MAIN ========================
case "${1:-help}" in
  backup) backup ;;
  manifest) manifest "${2:-}" ;;
  restore) restore "${2:-}" ;;
  status) status ;;
  help|*)
    echo "Uso: $0 {backup|manifest <file>|restore <file>|status}"
    echo ""
    echo "  backup     — Cria backup completo do ecossistema"
    echo "  manifest   — Mostra conteudo de um backup"
    echo "  restore    — Restaura backup em novo VPS"
    echo "  status     — Mostra estado atual do ecossistema"
    ;;
esac