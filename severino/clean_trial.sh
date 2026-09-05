#!/bin/bash
set -e
cd /root/severino
cp data/licenses.json data/licenses.json.pre-apptest
python3 - <<'PY'
import json
p = 'data/licenses.json'
d = json.load(open(p))
if 'VIP7-ZBPAFX' in d:
    del d['VIP7-ZBPAFX']
    json.dump(d, open(p,'w'), indent=2)
    print('teste removido')
else:
    print('teste já não existe')
PY