<?php

$origins = array_values(array_unique(array_filter(array_merge(
    [
        env('FRONTEND_URL'),
        env('APP_URL'),
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'http://localhost',
        'http://127.0.0.1',
    ],
    array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')))
))));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $origins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
