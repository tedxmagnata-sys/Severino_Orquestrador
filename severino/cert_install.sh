#!/bin/bash
set -e
certbot install --cert-name severinobot.com --nginx --non-interactive --agree-tos 2>&1 | tail -8
nginx -t && nginx -s reload
echo "install_ok"