#!/bin/sh
set -e
cd /var/www/html

mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs storage/app/documents
chown -R www-data:www-data storage bootstrap/cache || true

if [ -z "$APP_KEY" ]; then
  echo "APP_KEY absent : generation..."
  php artisan key:generate --force --no-interaction
fi

php artisan migrate --force --no-interaction

if [ "${RUN_SEED:-true}" = "true" ]; then
  php artisan db:seed --force --no-interaction || true
fi

php artisan storage:link --force --no-interaction || true

exec "$@"
