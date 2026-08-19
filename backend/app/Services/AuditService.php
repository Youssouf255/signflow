<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Document;
use App\Models\Signer;
use App\Models\User;
use Illuminate\Http\Request;

class AuditService
{
    public function log(
        Document $document,
        string $event,
        ?Request $request = null,
        ?User $user = null,
        ?Signer $signer = null,
        array $metadata = []
    ): AuditLog {
        return AuditLog::create([
            'document_id' => $document->id,
            'user_id' => $user?->id,
            'signer_id' => $signer?->id,
            'event' => $event,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
            'metadata' => $metadata ?: null,
        ]);
    }
}
