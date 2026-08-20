<?php

namespace App\Services;

use App\Mail\DocumentCompletedMail;
use App\Mail\SigningInvitationMail;
use App\Models\Document;
use App\Models\Signer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentService
{
    private ?string $lastMailError = null;

    public function __construct(
        private AuditService $audit,
        private PdfService $pdf,
        private DocumentConversionService $conversion,
        private DocumentPayloadStore $payloads
    ) {}

    public function create(User $owner, array $data, UploadedFile $file, Request $request): Document
    {
        return DB::transaction(function () use ($owner, $data, $file, $request) {
            $reference = 'DOC-'.now()->format('Y').'-'.str_pad((string) (Document::max('id') + 1), 6, '0', STR_PAD_LEFT);
            $stored = $this->conversion->storeAsPdf($file, $reference);
            $path = $stored['pdf_relative'];
            $hash = $this->pdf->hashFile(Storage::disk('local')->path($path));

            if (config('filesystems.documents_disk') === 's3') {
                Storage::disk('s3')->put($path, Storage::disk('local')->get($path));
            }

            $document = Document::create([
                'owner_id' => $owner->id,
                'reference' => $reference,
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'original_file' => $path,
                'original_hash' => $hash,
                'status' => 'draft',
                'signers_count' => (int) ($data['signers_count'] ?? 0),
                'expires_at' => $data['expires_at'] ?? null,
            ]);

            $this->audit->log($document, 'document.created', $request, $owner, null, [
                'source_format' => $stored['extension'],
                'source_file' => $stored['source_relative'],
            ]);

            $this->payloads->persistOriginal($document, $path);

            return $document->load(['signers', 'fields']);
        });
    }

    public function syncSigners(Document $document, array $signers, Request $request, User $user): Document
    {
        $newSignerIds = [];

        $document = DB::transaction(function () use ($document, $signers, $request, $user, &$newSignerIds) {
            $existing = $document->signers()->get()->keyBy(fn (Signer $signer) => strtolower(trim($signer->email)));
            $keepIds = [];

            foreach ($signers as $index => $signerData) {
                $email = strtolower(trim((string) $signerData['email']));
                $payload = [
                    'first_name' => $signerData['first_name'],
                    'last_name' => $signerData['last_name'],
                    'email' => $email,
                    'signing_order' => $signerData['signing_order'] ?? ($index + 1),
                    'role' => $signerData['role'] ?? 'signer',
                    'token_expires_at' => $document->expires_at,
                ];

                $current = $existing->get($email);
                if ($current) {
                    $current->update($payload);
                    $keepIds[] = $current->id;
                    continue;
                }

                $created = Signer::create($payload + [
                    'document_id' => $document->id,
                    'status' => 'pending',
                    'access_token' => hash('sha256', Str::uuid()->toString().Str::random(40)),
                ]);
                $keepIds[] = $created->id;
                $newSignerIds[] = $created->id;
            }

            $removed = $document->signers()->whereNotIn('id', $keepIds)->get();
            foreach ($removed as $signer) {
                $signer->fields()->delete();
                $signer->delete();
            }

            $document->update(['signers_count' => count($keepIds)]);
            $this->audit->log($document, 'signers.updated', $request, $user);

            return $document->fresh(['signers', 'fields']);
        });

        try {
            @set_time_limit(60);
            @ini_set('default_socket_timeout', '8');
            $toInvite = $document->signers->filter(fn (Signer $signer) => in_array((int) $signer->id, array_map('intval', $newSignerIds), true));
            $invitations = $this->inviteSigners($document, $toInvite, $request);
        } catch (\Throwable $e) {
            Log::error('Invitation apres enregistrement signataires : '.$e->getMessage());
            $invitations = [
                'sent' => [],
                'failed' => $document->signers->pluck('email')->all(),
                'mailer' => config('mail.default'),
                'error' => $e->getMessage(),
            ];
        }
        $document->setAttribute('invitations', $invitations);

        return $document;
    }

    public function syncFields(Document $document, array $fields, Request $request, User $user): Document
    {
        return DB::transaction(function () use ($document, $fields, $request, $user) {
            $document->fields()->delete();

            foreach ($fields as $field) {
                $document->fields()->create([
                    'signer_id' => $field['signer_id'],
                    'type' => $field['type'],
                    'page' => $field['page'] ?? 1,
                    'x' => $field['x'],
                    'y' => $field['y'],
                    'width' => $field['width'],
                    'height' => $field['height'],
                    'required' => $field['required'] ?? true,
                    'label' => $field['label'] ?? null,
                ]);
            }

            $this->audit->log($document, 'fields.updated', $request, $user);

            return $document->fresh(['signers', 'fields']);
        });
    }

    public function reopenForEdit(Document $document, Request $request, User $user): Document
    {
        if ($document->status === 'draft') {
            abort(422, 'Ce document est deja en brouillon.');
        }

        return DB::transaction(function () use ($document, $request, $user) {
            $document->signatures()->delete();

            foreach ($document->signers as $signer) {
                $signer->update([
                    'status' => 'pending',
                    'access_token' => hash('sha256', Str::uuid()->toString().Str::random(40)),
                    'token_expires_at' => $document->expires_at,
                    'notified_at' => null,
                    'opened_at' => null,
                    'signed_at' => null,
                    'decline_reason' => null,
                ]);
            }

            $document->update([
                'status' => 'draft',
                'sent_at' => null,
                'completed_at' => null,
                'signed_file' => null,
                'signed_hash' => null,
            ]);

            $this->audit->log($document, 'document.reopened', $request, $user, null, [
                'message' => 'Document remis en brouillon pour modification et renvoi.',
            ]);

            return $document->fresh(['signers', 'fields']);
        });
    }

    public function replaceFile(Document $document, UploadedFile $file, Request $request, User $user): Document
    {
        if ($document->status !== 'draft') {
            abort(422, 'Le fichier ne peut etre remplace qu\'en brouillon.');
        }

        return DB::transaction(function () use ($document, $file, $request, $user) {
            $stored = $this->conversion->storeAsPdf($file, $document->reference);
            $path = $stored['pdf_relative'];
            $hash = $this->pdf->hashFile(Storage::disk('local')->path($path));

            if (config('filesystems.documents_disk') === 's3') {
                Storage::disk('s3')->put($path, Storage::disk('local')->get($path));
            }

            $document->update([
                'original_file' => $path,
                'original_hash' => $hash,
                'signed_file' => null,
                'signed_hash' => null,
            ]);

            $this->audit->log($document, 'document.file_replaced', $request, $user, null, [
                'source_format' => $stored['extension'],
                'source_file' => $stored['source_relative'],
            ]);

            $this->payloads->persistOriginal($document, $path);

            return $document->fresh(['signers', 'fields']);
        });
    }

    public function send(Document $document, Request $request, User $user): Document
    {
        if ($document->signers()->count() === 0) {
            abort(422, 'Ajoutez au moins un signataire.');
        }

        if ($document->fields()->where('required', true)->count() === 0) {
            abort(422, 'Placez au moins un champ obligatoire.');
        }

        $document->update([
            'status' => 'sent',
            'sent_at' => now(),
        ]);

        $this->audit->log($document, 'document.sent', $request, $user);
        $invitations = $this->notifyNextSigners($document, $request);

        $document = $document->fresh(['signers', 'fields', 'auditLogs']);
        $document->setAttribute('invitations', $invitations);

        return $document;
    }

    public function notifyNextSigners(Document $document, ?Request $request = null): array
    {
        $targets = $document->signers()
            ->whereNotIn('status', ['signed', 'approved', 'declined'])
            ->whereNull('notified_at')
            ->get();

        $invitations = $this->inviteSigners($document, $targets, $request);

        if ($document->status === 'sent') {
            $document->update(['status' => 'in_progress']);
        }

        return $invitations;
    }

    public function notifyDocumentCompleted(Document $document, ?Request $request = null): void
    {
        $document->loadMissing(['signers', 'owner']);
        $absolute = $this->payloads->absolutePath($document);

        if (! $absolute || ! is_file($absolute)) {
            Log::error('PDF final introuvable pour l\'envoi aux signataires.', [
                'document_id' => $document->id,
            ]);

            return;
        }

        $filename = ($document->reference ?: 'document').'-signe.pdf';
        $sent = [];

        foreach ($document->signers as $signer) {
            $email = strtolower(trim((string) $signer->email));
            if ($email === '' || isset($sent[$email])) {
                continue;
            }

            $ok = $this->deliverMail(
                $signer->email,
                new DocumentCompletedMail($document, $signer->first_name ?: $signer->full_name, $absolute, $filename),
                $document,
                $request,
                $signer
            );

            if ($ok) {
                $sent[$email] = true;
            }
        }

        $ownerEmail = strtolower(trim((string) ($document->owner?->email ?? '')));
        if ($ownerEmail !== '' && ! isset($sent[$ownerEmail])) {
            $this->deliverMail(
                $document->owner->email,
                new DocumentCompletedMail($document, $document->owner->name ?: 'destinataire', $absolute, $filename),
                $document,
                $request
            );
        }
    }

    private function publicBaseUrl(): string
    {
        $frontend = rtrim((string) config('app.frontend_url'), '/');
        if ($frontend !== '') {
            return $frontend;
        }

        return rtrim((string) config('app.url'), '/');
    }

    private function inviteSigners(Document $document, iterable $signers, ?Request $request = null): array
    {
        $sent = [];
        $failed = [];
        $this->lastMailError = null;
        $base = $this->publicBaseUrl();

        foreach ($signers as $signer) {
            if (! $signer instanceof Signer) {
                continue;
            }

            $link = $base.'/sign/'.$signer->access_token;
            $ok = $this->deliverMail(
                $signer->email,
                new SigningInvitationMail($document, $signer, $link),
                $document,
                $request,
                $signer
            );

            if ($ok) {
                $signer->update([
                    'status' => in_array($signer->status, ['pending', 'notified'], true) ? 'notified' : $signer->status,
                    'notified_at' => now(),
                ]);
                $sent[] = $signer->email;
            } else {
                $failed[] = $signer->email;
            }
        }

        return [
            'sent' => $sent,
            'failed' => $failed,
            'mailer' => config('mail.default'),
            'error' => $this->lastMailError,
        ];
    }

    private function deliverMail(
        string $email,
        object $mailable,
        Document $document,
        ?Request $request = null,
        ?Signer $signer = null
    ): bool {
        $email = trim($email);
        if ($email === '') {
            return false;
        }

        $username = (string) config('mail.mailers.smtp.username');
        if (config('mail.default') === 'log' || $username === '') {
            $this->lastMailError = 'SMTP non configure. Ajoutez MAIL_USERNAME, MAIL_PASSWORD et MAIL_FROM_ADDRESS dans Render, puis redeployez.';
            Log::error($this->lastMailError);

            return false;
        }

        try {
            Mail::to($email)->send($mailable);
            $this->audit->log($document, 'email.delivered', $request, null, $signer, [
                'email' => $email,
                'mailer' => config('mail.default'),
            ]);

            return true;
        } catch (\Throwable $e) {
            $this->lastMailError = $e->getMessage();
            Log::error('Echec envoi email SignFlow : '.$e->getMessage(), [
                'email' => $email,
                'document_id' => $document->id,
                'mailer' => config('mail.default'),
                'username' => config('mail.mailers.smtp.username'),
            ]);
            $this->audit->log($document, 'email.failed', $request, null, $signer, [
                'email' => $email,
                'error' => mb_substr($e->getMessage(), 0, 500),
            ]);

            return false;
        }
    }
}
