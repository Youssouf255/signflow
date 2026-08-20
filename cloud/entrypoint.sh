#!/bin/sh
set -e
cd /var/www/html

if [ ! -f .env ]; then
  cp .env.example .env
fi

if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export APP_URL="${APP_URL:-$RENDER_EXTERNAL_URL}"
  export FRONTEND_URL="${FRONTEND_URL:-$RENDER_EXTERNAL_URL}"
  host="${RENDER_EXTERNAL_HOSTNAME:-}"
  if [ -n "$host" ]; then
    export SANCTUM_STATEFUL_DOMAINS="${SANCTUM_STATEFUL_DOMAINS:-$host}"
  fi
fi

export APP_ENV="${APP_ENV:-production}"
export APP_DEBUG="${APP_DEBUG:-false}"
export LOG_CHANNEL="${LOG_CHANNEL:-stderr}"
export FILESYSTEM_DISK="${FILESYSTEM_DISK:-local}"
export QUEUE_CONNECTION="${QUEUE_CONNECTION:-sync}"
export CACHE_STORE="${CACHE_STORE:-file}"
export SESSION_DRIVER="${SESSION_DRIVER:-file}"
export MAIL_MAILER="${MAIL_MAILER:-log}"
export DB_CONNECTION="${DB_CONNECTION:-pgsql}"
export DB_SSLMODE="${DB_SSLMODE:-require}"

KEEP_MAIL_USER="${MAIL_USERNAME:-}"
KEEP_MAIL_PASS="${MAIL_PASSWORD:-}"
KEEP_MAIL_FROM="${MAIL_FROM_ADDRESS:-}"

if [ -n "${DATABASE_URL:-}${DB_URL:-}" ]; then
  php /write-db-env.php
else
  echo "DATABASE_URL manquant : la base Render n'est pas liee au service."
  env | grep -E '^(DATABASE_URL|DB_|RENDER_|MAIL_)' | sed 's/=.*/=***/' || true
  exit 1
fi

set -a
. ./.env
set +a

if [ -z "${MAIL_USERNAME:-}" ] && [ -n "$KEEP_MAIL_USER" ]; then
  export MAIL_USERNAME="$KEEP_MAIL_USER"
fi
if [ -z "${MAIL_PASSWORD:-}" ] && [ -n "$KEEP_MAIL_PASS" ]; then
  export MAIL_PASSWORD="$KEEP_MAIL_PASS"
fi
if [ -z "${MAIL_FROM_ADDRESS:-}" ] && [ -n "$KEEP_MAIL_FROM" ]; then
  export MAIL_FROM_ADDRESS="$KEEP_MAIL_FROM"
fi
if [ -n "${MAIL_USERNAME:-}" ] && [ -n "${MAIL_PASSWORD:-}" ]; then
  export MAIL_MAILER=smtp
  export MAIL_HOST="${MAIL_HOST:-smtp.gmail.com}"
  export MAIL_PORT="${MAIL_PORT:-587}"
  export MAIL_ENCRYPTION="${MAIL_ENCRYPTION:-tls}"
  export MAIL_FROM_ADDRESS="${MAIL_FROM_ADDRESS:-$MAIL_USERNAME}"
  echo "SMTP pret pour ${MAIL_USERNAME}"
else
  echo "SMTP inactif : MAIL_USERNAME ou MAIL_PASSWORD manquant dans Render > Environment."
fi

export APP_ENV=production
export APP_DEBUG=false
export LOG_CHANNEL=stderr
export FILESYSTEM_DISK=local
export QUEUE_CONNECTION=sync
export CACHE_STORE=file
export SESSION_DRIVER=file
export DB_CONNECTION=pgsql
export DB_SSLMODE="${DB_SSLMODE:-require}"

if [ -z "${APP_KEY:-}" ] || [ "${APP_KEY}" = "base64:" ]; then
  echo "APP_KEY manquant dans .env apres initialisation."
  exit 1
fi

php artisan migrate --force --no-interaction

if [ "${RUN_SEED:-true}" = "true" ]; then
  php artisan db:seed --force --no-interaction || true
fi

php artisan storage:link --force --no-interaction || true

php artisan serve --host=127.0.0.1 --port=8000 &

mkdir -p /var/www/html/storage/app/pending-mail
(
  while true; do
    php artisan signflow:send-pending-mail || true
    sleep 20
  done
) &

export PORT="${PORT:-10000}"
envsubst '${PORT}' < /etc/nginx/templates/signflow.conf.template > /etc/nginx/conf.d/signflow.conf
rm -f /etc/nginx/sites-enabled/default
exec nginx -g 'daemon off;'
