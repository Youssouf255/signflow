<?php

namespace App\Http\Controllers;

use App\Models\Signer;
use App\Services\MicrosoftGraphService;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function __construct(private readonly MicrosoftGraphService $microsoft)
    {
    }

    public function index(Request $request)
    {
        $query = trim((string) $request->query('q', ''));
        $user = $request->user();
        $seen = [];
        $contacts = [];

        $signers = Signer::query()
            ->whereHas('document', fn ($q) => $q->where('owner_id', $user->id))
            ->orderByDesc('id')
            ->get(['first_name', 'last_name', 'email']);

        foreach ($signers as $signer) {
            $email = strtolower(trim((string) $signer->email));
            if ($email === '' || isset($seen[$email])) {
                continue;
            }
            $seen[$email] = true;
            $contacts[] = [
                'email' => $email,
                'first_name' => trim((string) $signer->first_name),
                'last_name' => trim((string) $signer->last_name),
                'display_name' => trim($signer->first_name.' '.$signer->last_name),
                'source' => 'signflow',
            ];
        }

        try {
            foreach ($this->microsoft->contacts($user, $query) as $row) {
                $email = strtolower(trim((string) ($row['email'] ?? '')));
                if ($email === '' || isset($seen[$email])) {
                    continue;
                }
                $seen[$email] = true;
                $contacts[] = $row;
            }
        } catch (\Throwable) {
            // Keep SignFlow contacts if Outlook is unavailable.
        }

        if ($query !== '') {
            $needle = mb_strtolower($query);
            $contacts = array_values(array_filter($contacts, function (array $row) use ($needle) {
                $hay = mb_strtolower(($row['display_name'] ?? '').' '.($row['first_name'] ?? '').' '.($row['last_name'] ?? '').' '.($row['email'] ?? ''));

                return str_contains($hay, $needle);
            }));
        }

        usort($contacts, fn ($a, $b) => strcasecmp($a['display_name'] ?: $a['email'], $b['display_name'] ?: $b['email']));

        return response()->json([
            'data' => array_slice($contacts, 0, 40),
            'outlook' => [
                'configured' => $this->microsoft->configured(),
                'connected' => (bool) $user->microsoftConnection,
                'email' => $user->microsoftConnection?->email,
            ],
        ]);
    }
}
