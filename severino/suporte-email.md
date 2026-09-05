# Verificação DNS — Zoho Mail (btcweatherpanel.com)

Rode no servidor depois de adicionar os registros na Porkbun:
  bash dns-check-porkbun.sh
Interpretação dos outputs:

1) MX:
   Deve aparecer 'mx.zoho.com' (preferência 10) e 'mx2.zoho.com' (20).
   Se aparecer outro host (ex: porkbun) → ainda não propagou ou registro errado.

2) TXT (SPF):
   Deve conter 'include:zoho.com' no valor.
   Erro comum: ter DOIS records TXT sem include:zoho.com — o Zoho marca falha.
   Requisito: UNO SÓ, com include:zoho.com.

3) DKIM:
   Se o Zoho pediu DKIM, rode:
     dig +short TXT zoho._domainkey.btcweatherpanel.com
   Deve mostrar 'v=DKIM1; k=rsa; p=...' com o valor que o Zoho forneceu.

NOTA: DNS pode levar de alguns minutos a 1h para propagar.
Depois de confirmar os 3 de cima → em Zoho Admin -> Domains, o status fica "Active".