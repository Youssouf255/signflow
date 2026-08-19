<?php

declare(strict_types=1);

$url = getenv('DATABASE_URL') ?: (getenv('DB_URL') ?: '');
if ($url === '') {
    fwrite(STDERR, "DATABASE_URL / DB_URL absent. Liez la base Render au service web.\n");
    exit(1);
}

$parts = parse_url($url);
if ($parts === false || empty($parts['host'])) {
    fwrite(STDERR, "DATABASE_URL invalide.\n");
    exit(1);
}

$host = $parts['host'];
$port = (string) ($parts['port'] ?? 5432);
$user = urldecode((string) ($parts['user'] ?? ''));
$pass = urldecode((string) ($parts['pass'] ?? ''));
$db = ltrim((string) ($parts['path'] ?? '/signflow'), '/');

$query = [];
parse_str((string) ($parts['query'] ?? ''), $query);
$ssl = $query['sslmode'] ?? (getenv('DB_SSLMODE') ?: 'require');

$q = http_build_query(array_filter(['sslmode' => $ssl]));
$dbUrl = sprintf(
    'pgsql://%s:%s@%s:%s/%s%s',
    rawurlencode($user),
    rawurlencode($pass),
    $host,
    $port,
    $db,
    $q !== '' ? '?'.$q : ''
);

$appKey = (string) (getenv('APP_KEY') ?: '');
if ($appKey === '' || $appKey === 'base64:') {
    $appKey = 'base64:'.base64_encode(random_bytes(32));
}

$appUrl = rtrim((string) (getenv('APP_URL') ?: (getenv('RENDER_EXTERNAL_URL') ?: 'http://localhost')), '/');
$frontendUrl = rtrim((string) (getenv('FRONTEND_URL') ?: $appUrl), '/');
$sanctumHost = (string) (getenv('SANCTUM_STATEFUL_DOMAINS') ?: (getenv('RENDER_EXTERNAL_HOSTNAME') ?: ''));
if ($sanctumHost === '' && $appUrl !== '') {
    $sanctumHost = (string) (parse_url($appUrl, PHP_URL_HOST) ?: '');
}

$envPath = '.env';
$env = is_file($envPath) ? (string) file_get_contents($envPath) : '';
$keys = [
    'APP_ENV', 'APP_DEBUG', 'APP_KEY', 'APP_URL', 'FRONTEND_URL', 'SANCTUM_STATEFUL_DOMAINS',
    'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
    'DB_URL', 'DATABASE_URL', 'DB_SSLMODE',
    'SESSION_DRIVER', 'QUEUE_CONNECTION', 'CACHE_STORE', 'CACHE_DRIVER',
    'FILESYSTEM_DISK', 'MAIL_MAILER', 'LOG_CHANNEL', 'REDIS_CLIENT',
];
$lines = preg_split("/\r\n|\n|\r/", $env) ?: [];
$lines = array_values(array_filter($lines, static function (string $line) use ($keys): bool {
    foreach ($keys as $key) {
        if (str_starts_with($line, $key.'=')) {
            return false;
        }
    }
    return true;
}));

$quote = static function (string $value): string {
    return '"'.str_replace(['\\', '"', '$'], ['\\\\', '\\"', '\\$'], $value).'"';
};

$lines[] = 'APP_ENV=production';
$lines[] = 'APP_DEBUG=false';
$lines[] = 'APP_KEY='.$quote($appKey);
$lines[] = 'APP_URL='.$quote($appUrl);
$lines[] = 'FRONTEND_URL='.$quote($frontendUrl);
if ($sanctumHost !== '') {
    $lines[] = 'SANCTUM_STATEFUL_DOMAINS='.$quote($sanctumHost);
}
$lines[] = 'DB_CONNECTION=pgsql';
$lines[] = 'DB_HOST='.$quote($host);
$lines[] = 'DB_PORT='.$quote($port);
$lines[] = 'DB_DATABASE='.$quote($db);
$lines[] = 'DB_USERNAME='.$quote($user);
$lines[] = 'DB_PASSWORD='.$quote($pass);
$lines[] = 'DB_SSLMODE='.$quote($ssl);
$lines[] = 'DB_URL='.$quote($dbUrl);
$lines[] = 'DATABASE_URL='.$quote($url);
$lines[] = 'SESSION_DRIVER=file';
$lines[] = 'QUEUE_CONNECTION=sync';
$lines[] = 'CACHE_STORE=file';
$lines[] = 'CACHE_DRIVER=file';
$lines[] = 'FILESYSTEM_DISK=local';
$lines[] = 'MAIL_MAILER=log';
$lines[] = 'LOG_CHANNEL=stderr';

file_put_contents($envPath, implode("\n", $lines)."\n");

fwrite(STDERR, "PostgreSQL hote={$host} base={$db} ssl={$ssl}\n");
fwrite(STDERR, "APP_KEY initialisee (".strlen($appKey)." car.).\n");
