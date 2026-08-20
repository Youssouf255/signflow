<?php

namespace App\Http\Controllers;

use App\Services\DocumentPayloadStore;
use App\Services\SigningService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SigningController extends Controller
{
    public function __construct(
        private SigningService $signing,
        private DocumentPayloadStore $payloads
    ) {}

    public function show(string $token, Request $request)
    {
        $signer = $this->signing->resolveByToken($token);
        $this->signing->markOpened($signer, $request);

        $signer->makeVisible(['access_token']);

        return response()->json([
            'signer' => $signer,
            'document' => $signer->document->only([
                'id', 'reference', 'title', 'description', 'status', 'expires_at', 'signers_count',
            ]),
            'fields' => $signer->fields,
            'signers' => $signer->document->signers->map(fn ($s) => [
                'id' => $s->id,
                'first_name' => $s->first_name,
                'last_name' => $s->last_name,
                'signing_order' => $s->signing_order,
                'role' => $s->role,
                'status' => $s->status,
            ]),
            'can_sign' => $signer->canSign(),
            'audit_certificate_preview' => [
                'document_id' => $signer->document->reference,
                'hash' => $signer->document->signed_hash ?: $signer->document->original_hash,
            ],
        ]);
    }

    public function viewed(string $token, Request $request)
    {
        $signer = $this->signing->resolveByToken($token);
        $this->signing->markViewed($signer, $request);

        return response()->json(['message' => 'ok']);
    }

    public function file(string $token): BinaryFileResponse
    {
        $signer = $this->signing->resolveByToken($token);
        $path = $this->payloads->ensureLocal($signer->document);
        $absolute = Storage::disk('local')->path($path);

        return response()->file($absolute, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="document.pdf"',
        ]);
    }

    public function sign(string $token, Request $request)
    {
        $signer = $this->signing->resolveByToken($token);

        $data = $request->validate([
            'method' => ['required', 'in:draw,type,upload'],
            'signature_image' => ['nullable', 'string'],
            'typed_name' => ['nullable', 'string', 'max:255'],
            'field_values' => ['nullable', 'array'],
        ]);

        $document = $this->signing->sign($signer, $request, $data);
        $next = $document->signers
            ->where('role', '!=', 'observer')
            ->whereNotIn('status', ['signed', 'approved', 'declined'])
            ->sortBy('signing_order')
            ->first();

        return response()->json([
            'message' => 'Signature enregistree',
            'document_status' => $document->status,
            'next_signer' => $next ? [
                'id' => $next->id,
                'first_name' => $next->first_name,
                'last_name' => $next->last_name,
                'email' => $next->email,
                'signing_order' => $next->signing_order,
                'status' => $next->status,
            ] : null,
        ]);
    }

    public function decline(string $token, Request $request)
    {
        $signer = $this->signing->resolveByToken($token);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $document = $this->signing->decline($signer, $request, $data['reason']);

        return response()->json([
            'message' => 'Document refuse',
            'document_status' => $document->status,
        ]);
    }
}
