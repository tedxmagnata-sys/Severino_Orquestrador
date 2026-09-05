#!/bin/bash
cd /root/severino/ecosystem
python3 - <<'EOF'
import json
from collections import Counter
try:
    d = json.load(open('leads.json'))
    print('leads:', len(d))
    print('por fonte:', dict(Counter(l.get('fonte','?') for l in d)))
    print('por status:', dict(Counter(l.get('status','?') for l in d)))
except Exception as e:
    print('erro', e)
EOF
echo "=== cohort ==="
cat /root/severino/data/pricing-state.json 2>/dev/null
echo
echo "=== licencas vip ativas ==="
python3 - <<'EOF'
import json
try:
    d = json.load(open('/root/severino/data/licenses.json'))
    if isinstance(d, dict):
        ativas = [k for k,v in d.items() if v.get('activatedAt')]
        print('total licencas:', len(d), '| ativadas:', len(ativas))
except Exception as e:
    print('erro', e)
EOF
