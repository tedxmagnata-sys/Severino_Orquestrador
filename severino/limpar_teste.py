#!/usr/bin/env python3
import json, os
p = 'data/licenses.json'
with open(p) as f:
    data = json.load(f)
if isinstance(data, dict):
    keys = [k for k in data if 'DDXOCR' in k]
    for k in keys:
        del data[k]
        print('removido licenca:', k)
    with open(p, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('total licencas restantes:', len(data))
else:
    print('formato inesperado')
