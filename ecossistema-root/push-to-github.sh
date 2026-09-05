#!/bin/bash
set -euo pipefail

DIR="/root/backup-github"
REMOTE="git@github-orq:tedxmagnata-sys/Severino_Orquestrador.git"
BRANCH="main"

log() { echo "[$(date +%H:%M:%S)] $*"; }

# === 1. Preparar diretorio ===
rm -rf "$DIR"
mkdir -p "$DIR"
cd "$DIR"

# === 2. .gitignore ===
cat > .gitignore << 'GITIGNORE'
# Secrets
.env
.env.*
*.env
**/.env
**/.env.*
whatsapp/.env
mcp-muapi/.env

# Dependencies
node_modules/
**/node_modules/

# Logs
*.log
logs/

# System
core
*.core
.cache
.npm
.local

# Temp
tmp/
temp/
*.tmp

# OS
.DS_Store
Thumbs.db

# PM2
.pm2/
GITIGNORE

# === 3. Copiar servicos ===
log "Copiando servicos..."

# ecosystem (existing repo) - copia os arquivos do git pra manter historico
mkdir -p "$DIR/ecosystem"
cd /root/severino/ecosystem
git archive HEAD | tar x -C "$DIR/ecosystem"
cd "$DIR"

# severino (apenas arquivos relevantes, sem node_modules/.git/logs)
mkdir -p "$DIR/severino"
rsync -a --exclude=node_modules --exclude=.git --exclude=.cache --exclude=.npm --exclude=logs --exclude='*.log' --exclude=.env --exclude=.env.* --exclude='*.core' --exclude=whatsapp --exclude=mcp-muapi --exclude=backups /root/severino/ "$DIR/severino/" 2>/dev/null || true

# severino-vendedor
mkdir -p "$DIR/severino-vendedor"
rsync -a --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.log' /root/severino-vendedor/ "$DIR/severino-vendedor/" 2>/dev/null || true

# trader-dashboard
mkdir -p "$DIR/trader-dashboard"
rsync -a --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.log' --exclude=core /root/trader-dashboard/ "$DIR/trader-dashboard/" 2>/dev/null || true

# btc-weather-panel
mkdir -p "$DIR/btc-weather-panel"
rsync -a --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.log' /root/btc-weather-panel/ "$DIR/btc-weather-panel/" 2>/dev/null || true

# leadbook
mkdir -p "$DIR/leadbook"
rsync -a --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.log' /root/leadbook/ "$DIR/leadbook/" 2>/dev/null || true

# ebooklab
mkdir -p "$DIR/ebooklab"
rsync -a --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.log' /root/ebooklab/ "$DIR/ebooklab/" 2>/dev/null || true

# worker-engine
mkdir -p "$DIR/worker-engine"
rsync -a --exclude=node_modules --exclude=.git --exclude='*.log' /root/worker-engine/ "$DIR/worker-engine/" 2>/dev/null || true

# ecossistema (raiz)
mkdir -p "$DIR/ecossistema-root"
rsync -a --exclude=.git --exclude='*.log' /root/ecossistema/ "$DIR/ecossistema-root/" 2>/dev/null || true

# nginx configs
mkdir -p "$DIR/nginx"
cp /etc/nginx/sites-enabled/* "$DIR/nginx/" 2>/dev/null || true

# www (hub + ebook)
mkdir -p "$DIR/www"
cp -r /var/www/html/* "$DIR/www/" 2>/dev/null || true

# === 4. Git init ===
log "Inicializando git..."
cd "$DIR"
git init
git config user.name "Severino Bot"
git config user.email "severino@severinobot.com"
git remote add origin "$REMOTE"

# === 5. Puxar historico existente ===
log "Puxando historico existente do GitHub..."
git pull origin "$BRANCH" --allow-unrelated-histories -X theirs 2>/dev/null || true

# === 6. Adicionar arquivos novos (sem sobrescrever os existentes) ===
log "Adicionando arquivos ao repo..."
git add .

# === 7. Commit ===
if git diff --cached --quiet; then
  log "Nada novo para commitar."
else
  git commit -m "backup: ecossistema completo - $(date -u +%Y-%m-%d)"
  # === 8. Push ===
  log "Enviando para GitHub..."
  git push -u origin "$BRANCH" 2>&1 || {
    log "Push falhou. Tentando com force pull + push..."
    git pull origin "$BRANCH" --allow-unrelated-histories -X theirs --no-edit 2>/dev/null || true
    git push -u origin "$BRANCH" 2>&1 || {
      log "Ainda falhou. Criando branch separada 'backup-completo'..."
      git push -u origin HEAD:backup-completo 2>&1 || log "ERRO: Nao foi possivel enviar. Verifique a chave SSH do GitHub."
    }
  }
fi

# === 9. Limpeza ===
rm -rf "$DIR"
log "Concluido!"
echo ""
echo "Verifique em: https://github.com/tedxmagnata-sys/Severino_Orquestrador"