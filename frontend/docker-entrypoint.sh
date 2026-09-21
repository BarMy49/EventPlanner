#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN is required}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required}"

certificate_dir="/etc/letsencrypt/live/$DOMAIN"

render_config() {
  envsubst '${DOMAIN}' < "/etc/nginx/templates/$1" > /etc/nginx/conf.d/default.conf
  nginx -t
}

if [ ! -f "$certificate_dir/fullchain.pem" ] || [ ! -f "$certificate_dir/privkey.pem" ]; then
  render_config nginx.http.conf.template
  nginx

  if ! certbot certonly --webroot --webroot-path /var/www/certbot --non-interactive --agree-tos --email "$LETSENCRYPT_EMAIL" --keep-until-expiring --domain "$DOMAIN"; then
    nginx -s quit
    exit 1
  fi

  nginx -s quit
  while [ -f /var/run/nginx.pid ] && kill -0 "$(cat /var/run/nginx.pid)" 2>/dev/null; do
    sleep 1
  done
fi

render_config nginx.https.conf.template

renew_certificates() {
  while :; do
    sleep 12h
    certbot renew --webroot --webroot-path /var/www/certbot --quiet --deploy-hook 'nginx -s reload'
  done
}

renew_certificates &
exec nginx -g 'daemon off;'
