#!/usr/bin/env bash
# Checa MX/SPF/DKIM de btcweatherpanel.com (para Zoho Mail)
echo "== MX =="
dig +short MX btcweatherpanel.com
echo "== TXT (SPF) na raiz =="
dig +short TXT btcweatherpanel.com
echo "== DKIM zoho =="
dig +short TXT zoho._domainkey.btcweatherpanel.com