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

if [ -n "${DATABASE_URL:-}${DB_URL:-}" ]; then
  php /write-db-env.php
else
  echo "DATABASE_URL manquant : la base Render n'est pas liee au service."
  env | grep -E '^(DATABASE_URL|DB_|RENDER_)' | sed 's/=.*/=***/' || true
  exit 1
fi

set -a
. ./.env
set +a

export APP_ENV=production
export APP_DEBUG=false
export LOG_CHANNEL=stderr
export FILESYSTEM_DISK=local
export QUEUE_CONNECTION=sync
export CACHE_STORE=file
export SESSION_DRIVER=file
export MAIL_MAILER=log
export DB_CONNECTION=pgsql
export DB_SSLMODE="${DB_SSLMODE:-require}"

if [ -z "${APP_KEY:-}" ]; then
  export APP_KEY="$(php artisan key:generate --show --no-interaction)"
fi

php artisan migrate --force --no-interaction

if [ "${RUN_SEED:-true}" = "true" ]; then
  php artisan db:seed --force --no-interaction || true
fi

php artisan storage:link --force --no-interaction || true

php artisan serve --host=127.0.0.1 --port=8000 &

export PORT="${PORT:-10000}"
envsubst '${PORT}' < /etc/nginx/templates/signflow.conf.template > /etc/nginx/conf.d/signflow.conf
rm -f /etc/nginx/sites-enabled/default
exec nginx -g 'daemon off;'
