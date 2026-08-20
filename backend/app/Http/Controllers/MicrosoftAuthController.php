<?php

namespace App\Http\Controllers;

use App\Services\MicrosoftGraphService;
use Illuminate\Http\Request;

class MicrosoftAuthController extends Controller
{
    public function __construct(private readonly MicrosoftGraphService $microsoft)
    {
    }

    public function status(Request $request)
    {
        $connection = $request->user()->microsoftConnection;

        return response()->json([
            'configured' => $this->microsoft->configured(),
            'connected' => (bool) $connection,
            'email' => $connection?->email,
        ]);
    }

    public function connect(Request $request)
    {
        if (! $this->microsoft->configured()) {
            return response()->json([
                'message' => 'Outlook 365 n’est pas encore configuré sur le serveur (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).',
            ], 422);
        }

        return response()->json([
            'url' => $this->microsoft->authorizeUrl($request->user()),
        ]);
    }

    public function callback(Request $request)
    {
        try {
            $code = (string) $request->query('code', '');
            $state = (string) $request->query('state', '');
            if ($code === '' || $state === '') {
                throw new \RuntimeException($request->query('error_description') ?: 'Autorisation Microsoft annulée.');
            }
            $this->microsoft->handleCallback($code, $state);

            return redirect()->away($this->microsoft->frontendRedirect('connected'));
        } catch (\Throwable $e) {
            return redirect()->away($this->microsoft->frontendRedirect('error'));
        }
    }

    public function disconnect(Request $request)
    {
        $request->user()->microsoftConnection()?->delete();

        return response()->json(['connected' => false]);
    }
}
