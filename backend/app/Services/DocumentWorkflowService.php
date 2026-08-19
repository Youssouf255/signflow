<?php

namespace App\Services;

use App\Mail\SigningInvitationMail;
use App\Models\Document;
use App\Models\Signature;
use App\Models\Signer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentWorkflowService
{
    public function __construct(
        private AuditService $audit,
        private PdfSignatureService $pdf
    ) {}

    public function send(Document $document, Request $request): Document
    {
        if ($document->signers()->whereIn('role', ['signer', 'approver'])->count() === 0) {
            throw new \RuntimeException('Ajoutez au moins un signataire avant l\'envoi.');
        }

        if ($document->fields()->where('required', true)->count() === 0) {
            throw new \RuntimeException('Placez au moins un champ obligatoire avant l\'envoi.');
        }

        $hash = $this->hashDocumentFile($document->original_file);

        $document->update([
            'status' => 'sent',
            'sent_at' => now(),
            'document_hash' => $hash,
            'signers_count' => $document->signers()->count(),
        ]);

        $this->audit->log($document, 'document.sent', $request, $request->user());

        $this->notifyNextSigners($document, $request);

        return $document->fresh(['signers', 'fields']);
    }

    public function notifyNextSigners(Document $document, ?Request $request = null): void
    {
        $nextOrder = $document->signers()
            ->whereIn('role', ['signer', 'approver'])
            ->where('status', '!=', 'signed')
            ->min('signing_order');

        if ($nextOrder === null) {
            return;
        }

        $targets = $document->signers()
            ->whereIn('role', ['signer', 'approver'])
            ->where('signing_order', $nextOrder)
            ->whereIn('status', ['pending', 'notified'])
            ->get();

        foreach ($targets as $signer) {
            $signer->update([
                'status' => 'notified',
                'notified_at' => now(),
                'access_token' => $signer->access_token ?: Str::random(64),
                'token_expires_at' => $document->expires_at,
            ]);

            Mail::to($signer->email)->queue(new SigningInvitationMail($signer));
            $this->audit->log($document, 'email.delivered', $request, null, $signer);
        }

        // Observers are notified once when document is first sent
        if ($document->status === 'sent') {
            foreach ($document->signers()->where('role', 'observer')->get() as $observer) {
                Mail::to($observer->email)->queue(new SigningInvitationMail($observer, true));
                $this->audit->log($document, 'email.delivered', $request, null, $observer);
            }
        }

        if ($document->status === 'sent') {
            $document->update(['status' => 'in_progress']);
        }
    }

    public function markOpened(Signer $signer, Request $request): void
    {
        if (! $signer->opened_at) {
            $signer->update([
                'opened_at' => now(),
                'status' => $signer->status === 'signed' ? 'signed' : 'opened',
            ]);
            $this->audit->log($signer->document, 'document.opened', $request, null, $signer);
        }
    }

    public function markViewed(Signer $signer, Request $request): void
    {
        if (! $signer->viewed_at) {
            $signer->update([
                'viewed_at' => now(),
                'status' => $signer->status === 'signed' ? 'signed' : 'viewed',
            ]);
            $this->audit->log($signer->document, 'document.viewed', $request, null, $signer);
        }
    }

    public function sign(Signer $signer, Request $request, array $payload): Document
    {
        return DB::transaction(function () use ($signer, $request, $payload) {
            $document = $signer->document()->lockForUpdate()->first();

            if (! $signer->canSign()) {
                throw new \RuntimeException('Ce signataire ne peut pas signer pour le moment.');
            }

            $requiredFields = $signer->fields()->where('required', true)->get();
            $values = $payload['field_values'] ?? [];

            foreach ($requiredFields as $field) {
                if (in_array($field->type, ['signature', 'initials', 'name', 'date'], true)) {
                    continue;
                }
                if (! array_key_exists((string) $field->id, $values) && ! array_key_exists($field->id, $values)) {
                    throw new \RuntimeException("Le champ {$field->type} est obligatoire.");
                }
            }

            $imagePath = null;
            if (! empty($payload['signature_image'])) {
                if (str_starts_with($payload['signature_image'], 'data:image')) {
                    $imagePath = $payload['signature_image'];
                } else {
                    $relative = 'signatures/'.$document->id.'/'.$signer->id.'_'.time().'.png';
                    Storage::disk(config('filesystems.default'))->put($relative, base64_decode($payload['signature_image']));
                    $imagePath = $relative;
                }
            }

            $signature = Signature::create([
                'signer_id' => $signer->id,
                'document_id' => $document->id,
                'method' => $payload['method'] ?? 'draw',
                'signature_image' => $imagePath,
                'typed_name' => $payload['typed_name'] ?? $signer->full_name,
                'font_style' => $payload['font_style'] ?? null,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'signed_at' => now(),
            ]);

            foreach ($values as $fieldId => $value) {
                $signer->fields()->where('id', $fieldId)->update(['value' => is_bool($value) ? ($value ? '1' : '0') : $value]);
            }

            $this->pdf->applySignerFields($document->fresh(), $signer->fresh('fields'), $signature, $values);

            $signer->update([
                'status' => 'signed',
                'signed_at' => now(),
            ]);

            $this->audit->log($document, 'signature.completed', $request, null, $signer, [
                'method' => $signature->method,
                'hash' => $document->fresh()->document_hash,
            ]);

            $remaining = $document->signers()
                ->whereIn('role', ['signer', 'approver'])
                ->where('status', '!=', 'signed')
                ->count();

            if ($remaining === 0) {
                $document->update([
                    'status' => 'completed',
                    'completed_at' => now(),
                ]);
                $this->pdf->generateCertificate($document->fresh(['signers.signature', 'auditLogs']));
                $this->audit->log($document, 'document.finalized', $request, null, $signer);
            } else {
                $this->notifyNextSigners($document->fresh('signers'), $request);
            }

            return $document->fresh(['signers', 'fields', 'signatures', 'auditLogs']);
        });
    }

    public function decline(Signer $signer, Request $request, ?string $reason = null): Document
    {
        $document = $signer->document;

        $signer->update([
            'status' => 'declined',
            'declined_at' => now(),
            'decline_reason' => $reason,
        ]);

        $document->update(['status' => 'declined']);
        $this->audit->log($document, 'signature.declined', $request, null, $signer, [
            'reason' => $reason,
        ]);

        return $document->fresh(['signers', 'auditLogs']);
    }

    private function hashDocumentFile(string $relative): string
    {
        $local = storage_path('app/'.$relative);
        if (file_exists($local)) {
            return hash_file('sha256', $local);
        }

        $tmp = storage_path('app/tmp_hash_'.Str::random(8).'.pdf');
        file_put_contents($tmp, Storage::disk(config('filesystems.default'))->get($relative));
        $hash = hash_file('sha256', $tmp);
        @unlink($tmp);

        return $hash;
    }
}
