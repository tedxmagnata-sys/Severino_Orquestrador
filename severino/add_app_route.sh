#!/bin/bash
set -e
cd /root/severino
cp servidor.js servidor.js.pre-app-$(date +%Y%m%d)
python3 - <<'PY'
p = '/root/severino/servidor.js'
s = open(p).read()
old = """  if (url === '/' || url === '/oferta' || url === '/oferta/' || url === '/ebook' || url === '/ebook/') {
    // Domínio dedicado do Severino → exibe a página do Vendedor IA na raiz
    const host = (req.headers.host || '').toLowerCase();"""
new = """  if (url === '/' || url === '/oferta' || url === '/oferta/' || url === '/ebook' || url === '/ebook/' || url === '/app' || url === '/app/') {
    // Domínio dedicado do Severino → exibe a página do Vendedor IA na raiz
    const host = (req.headers.host || '').toLowerCase();
    // Painel do cliente (mobile) no subdomínio app.btcweatherpanel.com
    if (host === 'app.btcweatherpanel.com') {
      filePath = path.join('/root/btc-weather-panel', 'app.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(filePath));
    }"""
assert old in s, 'padrão antigo não encontrado'
s = s.replace(old, new)
open(p,'w').write(s)
print('rota adicionada')
PY
node -c /root/severino/servidor.js && echo "sintaxe_ok"
pm2 restart severino
sleep 2
curl -s -o /dev/null -w 'app via localhost -> HTTP %{http_code}\n' -H "Host: app.btcweatherpanel.com" http://127.0.0.1:3334/