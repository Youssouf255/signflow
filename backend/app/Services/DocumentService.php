<?php

namespace App\Services;

use App\Models\Document;
use App\Models\Signer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentService
{
    private ?string $lastMailError = null;

    public function __construct(
        private AuditService $audit,
        private PdfService $pdf,
        private DocumentConversionService $conversion,
        private DocumentPayloadStore $payloads,
        private GmailSmtpSender $gmail,
        private PendingMailQueue $mailQueue
    ) {}

    public function create(User $owner, array $data, UploadedFile $file, Request $request): Document
    {
        $path = '';
        $document = DB::transaction(function () use ($owner, $data, $file, $request, &$path) {
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

            return $document;
        });

        try {
            $this->payloads->persistOriginal($document, $path);
        } catch (\Throwable $e) {
            Log::error('persistOriginal: '.$e->getMessage(), ['document_id' => $document->id]);
            throw new \RuntimeException(
                'Le fichier a été reçu mais n\'a pas pu être enregistré. Réessayez avec un PDF plus léger.'
            );
        }

        return $document->load(['signers', 'fields']);
    }

    public function syncSigners(Document $document, array $signers, Request $request, User $user): Document
    {
        return DB::transaction(function () use ($document, $signers, $request, $user) {
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

        $path = '';
        $document = DB::transaction(function () use ($document, $file, $request, $user, &$path) {
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

            return $document->fresh(['signers', 'fields']);
        });

        $this->payloads->persistOriginal($document, $path);

        return $document;
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

    public function notifyNextSigners(Document $document, ?Request $request = null, bool $force = false): array
    {
        $nextOrder = $document->signers()
            ->where('role', '!=', 'observer')
            ->whereNotIn('status', ['signed', 'approved', 'declined'])
            ->min('signing_order');

        if ($nextOrder === null) {
            return ['queued' => false, 'sent' => [], 'failed' => [], 'signer_ids' => []];
        }

        $query = $document->signers()
            ->where('role', '!=', 'observer')
            ->where('signing_order', $nextOrder)
            ->whereNotIn('status', ['signed', 'approved', 'declined']);

        if (! $force) {
            $query->whereNull('notified_at');
        }

        $targets = $query->get();
        $ids = $targets->pluck('id')->map(fn ($id) => (int) $id)->values()->all();

        if ($ids === []) {
            return ['queued' => false, 'sent' => [], 'failed' => [], 'signer_ids' => [], 'to' => []];
        }

        if ($force) {
            $document->signers()->whereIn('id', $ids)->update(['notified_at' => null]);
            $targets = $document->signers()->whereIn('id', $ids)->get();
        }

        $this->mailQueue->push([
            'type' => 'invite',
            'document_id' => $document->id,
            'signer_ids' => $ids,
            'force' => $force,
        ]);

        if ($document->status === 'sent') {
            $document->update(['status' => 'in_progress']);
        }

        $emails = $targets->pluck('email')->filter()->values()->all();

        return [
            'queued' => true,
            'sent' => [],
            'failed' => [],
            'signer_ids' => $ids,
            'to' => $emails,
        ];
    }

    public function resendCurrentInvite(Document $document, Request $request): array
    {
        if (in_array($document->status, ['draft', 'completed', 'declined', 'expired', 'cancelled'], true)) {
            abort(422, 'Impossible de renvoyer une invitation pour ce document.');
        }

        return $this->notifyNextSigners($document, $request, true);
    }

    public function queueCompletedMail(Document $document): void
    {
        $this->mailQueue->push([
            'type' => 'completed',
            'document_id' => $document->id,
        ]);
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
        $htmlBase = fn (string $name) => view('emails.document-completed', [
            'document' => $document,
            'recipientName' => $name,
        ])->render();

        foreach ($document->signers as $signer) {
            $email = strtolower(trim((string) $signer->email));
            if ($email === '' || isset($sent[$email])) {
                continue;
            }

            try {
                $this->gmail->send(
                    $signer->email,
                    'Document signe : '.$document->title,
                    $htmlBase($signer->first_name ?: $signer->full_name),
                    $absolute,
                    $filename
                );
                $sent[$email] = true;
                $this->audit->log($document, 'email.delivered', $request, null, $signer, [
                    'email' => $signer->email,
                    'type' => 'completed',
                ]);
            } catch (\Throwable $e) {
                Log::error('Echec PDF final : '.$e->getMessage());
            }
        }

        $ownerEmail = strtolower(trim((string) ($document->owner?->email ?? '')));
        if ($ownerEmail !== '' && ! isset($sent[$ownerEmail])) {
            try {
                $this->gmail->send(
                    $document->owner->email,
                    'Document signe : '.$document->title,
                    $htmlBase($document->owner->name ?: 'destinataire'),
                    $absolute,
                    $filename
                );
            } catch (\Throwable $e) {
                Log::error('Echec PDF final proprietaire : '.$e->getMessage());
            }
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

    public function inviteSigners(Document $document, iterable $signers, ?Request $request = null, bool $force = false): array
    {
        $sent = [];
        $failed = [];
        $this->lastMailError = null;
        $base = $this->publicBaseUrl();
        $document->loadMissing('owner');
        $bcc = array_filter([
            strtolower(trim((string) ($document->owner?->email ?? ''))),
        ]);

        foreach ($signers as $signer) {
            if (! $signer instanceof Signer) {
                continue;
            }

            if (! $force && $signer->notified_at) {
                $sent[] = $signer->email;
                continue;
            }

            $signer->makeVisible(['access_token']);
            $link = $base.'/sign/'.$signer->access_token;
            $html = view('emails.signing-invitation', [
                'document' => $document,
                'signer' => $signer,
                'link' => $link,
            ])->render();

            try {
                $this->gmail->send(
                    $signer->email,
                    'Document a signer : '.$document->title,
                    $html,
                    null,
                    null,
                    $bcc
                );
                $signer->update([
                    'status' => in_array($signer->status, ['pending', 'notified'], true) ? 'notified' : $signer->status,
                    'notified_at' => now(),
                ]);
                $sent[] = $signer->email;
                $this->audit->log($document, 'email.delivered', $request, null, $signer, [
                    'email' => $signer->email,
                    'mailer' => 'gmail-smtp',
                ]);
            } catch (\Throwable $e) {
                $this->lastMailError = $e->getMessage();
                $failed[] = $signer->email;
                Log::error('Echec invitation '.$signer->email.' : '.$e->getMessage());
                $this->audit->log($document, 'email.failed', $request, null, $signer, [
                    'email' => $signer->email,
                    'error' => mb_substr($e->getMessage(), 0, 500),
                ]);
            }
        }

        return [
            'sent' => $sent,
            'failed' => $failed,
            'mailer' => config('mail.default'),
            'error' => $this->lastMailError,
            'smtp_ready' => $this->gmail->hasCredentials(),
        ];
    }

    public function mailStatus(Document $document): array
    {
        $pending = $this->mailQueue->statusFor($document->id);
        $lastFail = $document->auditLogs()
            ->where('event', 'email.failed')
            ->latest('id')
            ->first();
        $lastOk = $document->auditLogs()
            ->where('event', 'email.delivered')
            ->latest('id')
            ->first();

        return [
            'smtp_ready' => $this->gmail->hasCredentials(),
            'smtp_user' => $this->gmail->username() ?: null,
            'pending' => $pending,
            'last_error' => data_get($pending, '0.last_error') ?: data_get($lastFail, 'metadata.error'),
            'last_delivered_at' => $lastOk?->created_at,
            'last_failed_at' => $lastFail?->created_at,
        ];
    }
}
