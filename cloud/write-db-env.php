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

$envv = static function (string $key): string {
    $candidates = [getenv($key), $_ENV[$key] ?? null, $_SERVER[$key] ?? null];
    foreach ($candidates as $value) {
        if (! is_string($value)) {
            continue;
        }
        $value = trim($value);
        if ($value !== '' && strcasecmp($value, 'null') !== 0) {
            return $value;
        }
    }

    return '';
};

$mailUser = $envv('MAIL_USERNAME');
$mailPass = str_replace(' ', '', $envv('MAIL_PASSWORD'));
if ($mailUser !== '' && $mailPass !== '' && ! str_contains($mailUser, '@') && str_contains($mailPass, '@')) {
    [$mailUser, $mailPass] = [$mailPass, $mailUser];
    fwrite(STDERR, "MAIL_USERNAME et MAIL_PASSWORD etaient inverses : correction automatique.\n");
}
$mailHost = $envv('MAIL_HOST');
if ($mailHost === '' && str_contains($mailUser, '@')) {
    $domain = strtolower((string) substr(strrchr($mailUser, '@'), 1));
    $mailHost = match (true) {
        str_contains($domain, 'gmail') || $domain === 'googlemail.com' => 'smtp.gmail.com',
        str_contains($domain, 'yahoo') => 'smtp.mail.yahoo.com',
        str_contains($domain, 'outlook') || str_contains($domain, 'hotmail') || str_contains($domain, 'live.com') || str_contains($domain, 'office365') => 'smtp.office365.com',
        default => 'smtp.gmail.com',
    };
}
$mailPort = $envv('MAIL_PORT') !== '' ? $envv('MAIL_PORT') : '587';
$mailEncryption = $envv('MAIL_ENCRYPTION') !== '' ? $envv('MAIL_ENCRYPTION') : 'tls';
$mailFrom = $envv('MAIL_FROM_ADDRESS') !== '' ? $envv('MAIL_FROM_ADDRESS') : $mailUser;
if ($mailFrom === '' || str_contains($mailFrom, 'signflow.local') || str_contains($mailFrom, 'example.com')) {
    $mailFrom = $mailUser;
}
$mailFromName = $envv('MAIL_FROM_NAME') !== '' ? $envv('MAIL_FROM_NAME') : 'SignFlow';
$mailer = $envv('MAIL_MAILER');
if ($mailUser !== '' && $mailPass !== '' && $mailHost !== '') {
    $mailer = $mailer === '' || $mailer === 'log' ? 'smtp' : $mailer;
} else {
    $mailer = 'log';
}

$envPath = '.env';
$env = is_file($envPath) ? (string) file_get_contents($envPath) : '';
$keys = [
    'APP_ENV', 'APP_DEBUG', 'APP_KEY', 'APP_URL', 'FRONTEND_URL', 'SANCTUM_STATEFUL_DOMAINS',
    'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
    'DB_URL', 'DATABASE_URL', 'DB_SSLMODE',
    'SESSION_DRIVER', 'QUEUE_CONNECTION', 'CACHE_STORE', 'CACHE_DRIVER',
    'FILESYSTEM_DISK', 'MAIL_MAILER', 'MAIL_HOST', 'MAIL_PORT', 'MAIL_USERNAME',
    'MAIL_PASSWORD', 'MAIL_ENCRYPTION', 'MAIL_SCHEME', 'MAIL_FROM_ADDRESS', 'MAIL_FROM_NAME', 'MAIL_EHLO_DOMAIN',
    'LOG_CHANNEL', 'REDIS_CLIENT',
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
    $lines[] = 'MAIL_EHLO_DOMAIN='.$quote($sanctumHost);
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
$lines[] = 'MAIL_MAILER='.$quote($mailer);
$lines[] = 'MAIL_HOST='.$quote($mailHost !== '' ? $mailHost : '127.0.0.1');
$lines[] = 'MAIL_PORT='.$quote($mailPort !== '' ? $mailPort : '587');
$lines[] = 'MAIL_USERNAME='.$quote($mailUser);
$lines[] = 'MAIL_PASSWORD='.$quote($mailPass);
$lines[] = 'MAIL_ENCRYPTION='.$quote($mailEncryption !== '' ? $mailEncryption : 'tls');
$lines[] = 'MAIL_SCHEME=smtp';
$lines[] = 'MAIL_FROM_ADDRESS='.$quote($mailFrom !== '' ? $mailFrom : 'noreply@signflow.local');
$lines[] = 'MAIL_FROM_NAME='.$quote($mailFromName !== '' ? $mailFromName : 'SignFlow');
$lines[] = 'LOG_CHANNEL=stderr';

file_put_contents($envPath, implode("\n", $lines)."\n");

fwrite(STDERR, "PostgreSQL hote={$host} base={$db} ssl={$ssl}\n");
fwrite(STDERR, "APP_KEY initialisee (".strlen($appKey)." car.).\n");
fwrite(STDERR, $mailer === 'smtp'
    ? "SMTP actif host={$mailHost} port={$mailPort} user={$mailUser}\n"
    : "Mails en mode log. MAIL_USERNAME=".($mailUser !== '' ? 'oui' : 'ABSENT')." MAIL_PASSWORD=".($mailPass !== '' ? 'oui' : 'ABSENT')."\n"
);
