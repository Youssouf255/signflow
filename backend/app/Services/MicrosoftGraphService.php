<?php

namespace App\Services;

use App\Models\MicrosoftConnection;
use App\Models\User;
use Illuminate\Support\Facades\Http;

class MicrosoftGraphService
{
    public function configured(): bool
    {
        return $this->clientId() !== '' && $this->clientSecret() !== '';
    }

    public function authorizeUrl(User $user): string
    {
        $state = encrypt(json_encode([
            'uid' => $user->id,
            'exp' => now()->addMinutes(15)->timestamp,
        ]));

        return 'https://login.microsoftonline.com/'.$this->tenant().'/oauth2/v2.0/authorize?'.http_build_query([
            'client_id' => $this->clientId(),
            'response_type' => 'code',
            'redirect_uri' => $this->redirectUri(),
            'response_mode' => 'query',
            'scope' => 'offline_access User.Read Contacts.Read People.Read',
            'state' => $state,
            'prompt' => 'select_account',
        ]);
    }

    public function handleCallback(string $code, string $state): MicrosoftConnection
    {
        $payload = json_decode((string) decrypt($state), true);
        if (! is_array($payload) || empty($payload['uid']) || ($payload['exp'] ?? 0) < time()) {
            throw new \RuntimeException('Session Outlook expirée. Réessayez la connexion.');
        }

        $user = User::query()->findOrFail((int) $payload['uid']);
        $token = $this->exchangeCode($code);
        $profile = $this->graphGet($token['access_token'], '/me?$select=mail,userPrincipalName,displayName');

        return MicrosoftConnection::query()->updateOrCreate(
            ['user_id' => $user->id],
            [
                'email' => $profile['mail'] ?? $profile['userPrincipalName'] ?? null,
                'access_token' => $token['access_token'],
                'refresh_token' => $token['refresh_token'] ?? null,
                'expires_at' => now()->addSeconds(max(60, (int) ($token['expires_in'] ?? 3600) - 60)),
            ]
        );
    }

    public function contacts(User $user, string $query = ''): array
    {
        $connection = $user->microsoftConnection;
        if (! $connection) {
            return [];
        }

        $token = $this->validAccessToken($connection);
        $people = [];

        try {
            $peopleResp = $this->graphGet($token, '/me/people?$top=50&$select=displayName,givenName,surname,scoredEmailAddresses');
            foreach ($peopleResp['value'] ?? [] as $person) {
                $email = strtolower(trim((string) data_get($person, 'scoredEmailAddresses.0.address')));
                if ($email === '') {
                    continue;
                }
                $people[$email] = [
                    'email' => $email,
                    'first_name' => trim((string) ($person['givenName'] ?? '')),
                    'last_name' => trim((string) ($person['surname'] ?? '')),
                    'display_name' => trim((string) ($person['displayName'] ?? '')),
                    'source' => 'outlook',
                ];
            }
        } catch (\Throwable) {
            // People.Read is sometimes blocked by the tenant; contacts still work.
        }

        $contactsResp = $this->graphGet($token, '/me/contacts?$top=100&$select=givenName,surname,displayName,emailAddresses');
        foreach ($contactsResp['value'] ?? [] as $contact) {
            $email = strtolower(trim((string) data_get($contact, 'emailAddresses.0.address')));
            if ($email === '') {
                continue;
            }
            $people[$email] = [
                'email' => $email,
                'first_name' => trim((string) ($contact['givenName'] ?? '')),
                'last_name' => trim((string) ($contact['surname'] ?? '')),
                'display_name' => trim((string) ($contact['displayName'] ?? '')),
                'source' => 'outlook',
            ];
        }

        $q = mb_strtolower(trim($query));
        $list = array_values($people);
        if ($q !== '') {
            $list = array_values(array_filter($list, function (array $row) use ($q) {
                $hay = mb_strtolower(($row['display_name'] ?? '').' '.($row['first_name'] ?? '').' '.($row['last_name'] ?? '').' '.($row['email'] ?? ''));

                return str_contains($hay, $q);
            }));
        }

        return $list;
    }

    public function frontendRedirect(string $status): string
    {
        $base = rtrim((string) (env('FRONTEND_URL') ?: env('APP_URL') ?: ''), '/');

        return $base.'/app/settings?outlook='.$status;
    }

    private function validAccessToken(MicrosoftConnection $connection): string
    {
        if ($connection->expires_at && $connection->expires_at->isFuture() && $connection->access_token) {
            return $connection->access_token;
        }
        if (! $connection->refresh_token) {
            throw new \RuntimeException('Reconnectez Outlook 365 dans Paramètres.');
        }

        $token = $this->requestToken([
            'grant_type' => 'refresh_token',
            'refresh_token' => $connection->refresh_token,
        ]);
        $connection->update([
            'access_token' => $token['access_token'],
            'refresh_token' => $token['refresh_token'] ?? $connection->refresh_token,
            'expires_at' => now()->addSeconds(max(60, (int) ($token['expires_in'] ?? 3600) - 60)),
        ]);

        return $token['access_token'];
    }

    private function exchangeCode(string $code): array
    {
        return $this->requestToken([
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->redirectUri(),
        ]);
    }

    private function requestToken(array $extra): array
    {
        $response = Http::asForm()->timeout(20)->post(
            'https://login.microsoftonline.com/'.$this->tenant().'/oauth2/v2.0/token',
            array_merge([
                'client_id' => $this->clientId(),
                'client_secret' => $this->clientSecret(),
                'scope' => 'offline_access User.Read Contacts.Read People.Read',
            ], $extra)
        );
        if (! $response->successful()) {
            throw new \RuntimeException('Microsoft: '.mb_substr($response->body(), 0, 300));
        }

        return $response->json();
    }

    private function graphGet(string $token, string $path): array
    {
        $response = Http::withToken($token)->acceptJson()->timeout(20)->get('https://graph.microsoft.com/v1.0'.$path);
        if (! $response->successful()) {
            throw new \RuntimeException('Graph: '.mb_substr($response->body(), 0, 300));
        }

        return $response->json() ?: [];
    }

    private function redirectUri(): string
    {
        return rtrim((string) (env('APP_URL') ?: env('RENDER_EXTERNAL_URL') ?: ''), '/').'/api/microsoft/callback';
    }

    private function tenant(): string
    {
        $tenant = trim((string) env('MICROSOFT_TENANT_ID', 'common'));

        return $tenant !== '' ? $tenant : 'common';
    }

    private function clientId(): string
    {
        return trim((string) env('MICROSOFT_CLIENT_ID', ''));
    }

    private function clientSecret(): string
    {
        return trim((string) env('MICROSOFT_CLIENT_SECRET', ''));
    }
}
