<?php

namespace App\Services;

use App\Models\Document;
use App\Models\Signature;
use App\Models\Signer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SigningService
{
    public function __construct(
        private AuditService $audit,
        private PdfService $pdf,
        private DocumentService $documents,
        private DocumentPayloadStore $payloads
    ) {}

    public function resolveByToken(string $token): Signer
    {
        $signer = Signer::with(['document.owner', 'document.signers', 'fields', 'signature'])
            ->where('access_token', $token)
            ->firstOrFail();

        if ($signer->token_expires_at && $signer->token_expires_at->isPast()) {
            abort(410, 'Ce lien de signature a expire.');
        }

        if ($signer->document->expires_at && $signer->document->expires_at->isPast()) {
            $signer->document->update(['status' => 'expired']);
            abort(410, 'Ce document a expire.');
        }

        return $signer;
    }

    public function markOpened(Signer $signer, Request $request): void
    {
        if (! $signer->opened_at) {
            $signer->update([
                'opened_at' => now(),
                'status' => $signer->status === 'signed' ? $signer->status : 'opened',
            ]);
            $this->audit->log($signer->document, 'document.opened', $request, null, $signer);
        }
    }

    public function markViewed(Signer $signer, Request $request): void
    {
        if (! in_array($signer->status, ['signed', 'approved', 'declined'], true)) {
            $signer->update(['status' => 'viewed']);
        }

        $this->audit->log($signer->document, 'document.viewed', $request, null, $signer);
    }

    public function sign(Signer $signer, Request $request, array $data): Document
    {
        if (! $signer->canSign()) {
            abort(403, 'Ce n\'est pas encore votre tour de signer, ou vous ne pouvez pas signer.');
        }

        return DB::transaction(function () use ($signer, $request, $data) {
            $document = $signer->document()->lockForUpdate()->first();

            $imageRelative = null;
            if (! empty($data['signature_image'])) {
                $binary = $this->decodeDataUrl($data['signature_image']);
                $imageRelative = 'signatures/'.$document->reference.'-signer-'.$signer->id.'.png';
                Storage::disk('local')->put($imageRelative, $binary);
            }

            $typedName = trim((string) ($data['typed_name'] ?? $signer->full_name));
            $fieldValues = $data['field_values'] ?? [];

            // Auto-remplir nom / date / signature tapée pour fluidifier le parcours
            foreach ($signer->fields as $field) {
                $current = $fieldValues[$field->id] ?? $field->value;
                if ($current !== null && $current !== '') {
                    continue;
                }

                if ($field->type === 'name' || $field->type === 'signature') {
                    $fieldValues[$field->id] = $typedName;
                } elseif ($field->type === 'initials') {
                    $parts = preg_split('/\s+/', $typedName) ?: [];
                    $fieldValues[$field->id] = collect($parts)
                        ->filter()
                        ->map(fn ($p) => mb_strtoupper(mb_substr($p, 0, 1)))
                        ->implode('');
                } elseif ($field->type === 'date') {
                    $fieldValues[$field->id] = now()->format('d/m/Y');
                }
            }

            foreach ($fieldValues as $fieldId => $value) {
                $field = $signer->fields()->where('id', $fieldId)->first();
                if ($field) {
                    $field->update(['value' => is_bool($value) ? ($value ? '1' : '0') : (string) $value]);
                }
            }

            $requiredMissing = $signer->fields()
                ->where('required', true)
                ->get()
                ->filter(function ($field) use ($fieldValues, $imageRelative, $typedName) {
                    if (in_array($field->type, ['signature', 'initials', 'name'], true)) {
                        return empty($imageRelative) && $typedName === '';
                    }
                    if ($field->type === 'date') {
                        return false;
                    }
                    $val = $fieldValues[$field->id] ?? $field->value;

                    return $val === null || $val === '';
                });

            if ($requiredMissing->isNotEmpty()) {
                abort(422, 'Tous les champs obligatoires doivent etre renseignes.');
            }

            $signedPath = $this->pdf->applySignatures(
                $document,
                $signer,
                $imageRelative ? Storage::disk('local')->path($imageRelative) : '',
                $fieldValues,
                $typedName
            );

            $hash = $this->pdf->hashFile(Storage::disk('local')->path($signedPath));

            Signature::create([
                'signer_id' => $signer->id,
                'document_id' => $document->id,
                'signature_image' => $imageRelative,
                'method' => $data['method'] ?? 'draw',
                'typed_name' => $data['typed_name'] ?? null,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'document_hash' => $hash,
                'signed_at' => now(),
            ]);

            $signer->update([
                'status' => $signer->role === 'approver' ? 'approved' : 'signed',
                'signed_at' => now(),
            ]);

            $document->update([
                'signed_file' => $signedPath,
                'signed_hash' => $hash,
                'status' => 'in_progress',
            ]);

            $this->payloads->persistSigned($document, $signedPath);

            $this->audit->log($document, 'document.signed', $request, null, $signer, [
                'method' => $data['method'] ?? 'draw',
                'hash' => $hash,
            ]);

            $remaining = $document->signers()
                ->where('role', '!=', 'observer')
                ->whereNotIn('status', ['signed', 'approved'])
                ->count();

            $notifyCompleted = false;
            $notifyNext = false;

            if ($remaining === 0) {
                $this->pdf->generateCertificate($document->fresh(['signers.signature', 'auditLogs']));
                $document->update([
                    'status' => 'completed',
                    'completed_at' => now(),
                ]);
                $this->audit->log($document, 'document.finalized', $request, null, $signer, [
                    'hash' => $hash,
                ]);
                $notifyCompleted = true;
            } else {
                $notifyNext = true;
            }

            $documentId = $document->id;
            DB::afterCommit(function () use ($documentId, $notifyCompleted, $notifyNext, $request) {
                $fresh = Document::with(['signers', 'owner'])->find($documentId);
                if (! $fresh) {
                    return;
                }
                if ($notifyCompleted) {
                    $this->documents->queueCompletedMail($fresh);
                } elseif ($notifyNext) {
                    $this->documents->notifyNextSigners($fresh, $request);
                }
            });

            return $document->fresh(['signers', 'fields', 'signatures', 'auditLogs']);
        });
    }

    public function decline(Signer $signer, Request $request, string $reason): Document
    {
        if (! $signer->canSign()) {
            abort(403, 'Vous ne pouvez pas refuser ce document actuellement.');
        }

        $signer->update([
            'status' => 'declined',
            'decline_reason' => $reason,
        ]);

        $document = $signer->document;
        $document->update(['status' => 'declined']);

        $this->audit->log($document, 'document.declined', $request, null, $signer, [
            'reason' => $reason,
        ]);

        return $document->fresh(['signers', 'auditLogs']);
    }

    private function decodeDataUrl(string $dataUrl): string
    {
        if (str_contains($dataUrl, ',')) {
            [, $data] = explode(',', $dataUrl, 2);
        } else {
            $data = $dataUrl;
        }

        $binary = base64_decode($data, true);
        if ($binary === false) {
            abort(422, 'Image de signature invalide.');
        }

        return $binary;
    }
}
