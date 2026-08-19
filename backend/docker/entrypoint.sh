#!/bin/sh
set -e

cd /var/www/html

if [ ! -f vendor/autoload.php ]; then
  composer install --prefer-dist --no-interaction
fi

php artisan key:generate --force --no-interaction || true
php artisan migrate --force --no-interaction || true
php artisan storage:link --force --no-interaction || true
php artisan db:seed --force --no-interaction || true

exec "$@"
