#!/bin/bash
echo "=== conteúdo /auth (ver se é página de login ou erro) ==="
curl -sL "https://postiz.severino-btc.duckdns.org/auth" | grep -oiE "login|register|sign in|sign up|GeneralOAuthFlow|invalid_request|provider|google|github" | sort -u | head
echo "=== tentar criar usuário direto via DB para bypass do OAuth e depois verificar ==="
docker exec postiz sh -c 'echo "DB funcional"'
echo "=== log do frontend no momento do erro (se registrou) ==="
docker logs postiz 2>&1 | grep -iE "generaloauth|invalid_request|register|provider" | tail -10