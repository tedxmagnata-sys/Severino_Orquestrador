#!/bin/bash
set -e
cd /root/severino
cp servidor.js servidor.js.pre-fase3-$(date +%Y%m%d)

python3 - <<'PY'
import os
p = 'servidor.js'
s = open(p).read()

# 1. Inserir postagem de evento no barramento do ecossistema
old = "    writeJSON(purchasesPath, purchases);"
new = """    writeJSON(purchasesPath, purchases);

    // 📣 Avisar Ecossistema IA (Fase 3: Upsell Retentor)
    try {
      const eventBusPath = path.join(__dirname, 'ecosystem', 'queue', 'events.jsonl');
      const vEvent = {
        id: 'v-' + tx,
        tipo: 'venda.confirmada',
        produto: 'btcweather',
        data: {
          cliente: customerName,
          email: customerEmail,
          plano: plan,
          valor: value,
          codigo: code,
          transacao: tx,
          gateway: gateway
        },
        timestamp: new Date().toISOString(),
        hops: 0
      };
      fs.appendFileSync(eventBusPath, JSON.stringify(vEvent) + '\\n');
      console.log(`📣 Evento venda.confirmada postado no barramento para ${customerEmail}`);
    } catch (e) {
      console.error('❌ Erro ao postar evento de venda no ecossistema:', e.message);
    }"""

if old in s:
    s = s.replace(old, new)
    open(p, 'w').write(s)
    print("Ecossistema integrado à compra")
else:
    print("ERRO: Padrão não encontrado no servidor.js")
    exit(1)
PY

# Validar sintaxe
node -c servidor.js && echo "sintaxe_ok"
pm2 restart severino
echo "done"