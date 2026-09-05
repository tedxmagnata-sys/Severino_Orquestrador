#!/bin/bash
cd /root/severino/ecosystem
grep 'conteudo.pronto' queue/events.jsonl | tail -2 | python3 -c "
import sys, json
for l in sys.stdin:
    p = json.loads(l)['payload']
    print(p.get('url',''))
    print(p.get('legenda','')[:80])
    print('---')
"