<?php

namespace App\Services;

use App\Mail\SigningInvitationMail;
use App\Models\Document;
use App\Models\Signer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentService
{
    public function __construct(
        private AuditService $audit,
        private PdfService $pdf,
        private DocumentConversionService $conversion
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

            return $document->load(['signers', 'fields']);
        });
    }

    public function syncSigners(Document $document, array $signers, Request $request, User $user): Document
    {
        return DB::transaction(function () use ($document, $signers, $request, $user) {
            $document->fields()->delete();
            $document->signers()->delete();

            foreach ($signers as $index => $signerData) {
                Signer::create([
                    'document_id' => $document->id,
                    'first_name' => $signerData['first_name'],
                    'last_name' => $signerData['last_name'],
                    'email' => $signerData['email'],
                    'signing_order' => $signerData['signing_order'] ?? ($index + 1),
                    'role' => $signerData['role'] ?? 'signer',
                    'status' => 'pending',
                    'access_token' => hash('sha256', Str::uuid()->toString().Str::random(40)),
                    'token_expires_at' => $document->expires_at,
                ]);
            }

            $document->update(['signers_count' => count($signers)]);
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
        $this->notifyNextSigners($document, $request);

        return $document->fresh(['signers', 'fields', 'auditLogs']);
    }

    public function notifyNextSigners(Document $document, ?Request $request = null): void
    {
        $nextOrder = $document->signers()
            ->where('role', '!=', 'observer')
            ->whereNotIn('status', ['signed', 'approved', 'declined'])
            ->min('signing_order');

        if ($nextOrder === null) {
            return;
        }

        $targets = $document->signers()
            ->where('signing_order', $nextOrder)
            ->where('role', '!=', 'observer')
            ->whereIn('status', ['pending', 'notified'])
            ->get();

        $base = rtrim((string) ($request?->getSchemeAndHttpHost() ?: config('app.frontend_url')), '/');

        foreach ($targets as $signer) {
            $link = $base.'/sign/'.$signer->access_token;
            Mail::to($signer->email)->send(new SigningInvitationMail($document, $signer, $link));

            $signer->update([
                'status' => 'notified',
                'notified_at' => now(),
            ]);

            $this->audit->log($document, 'email.delivered', $request, null, $signer, [
                'email' => $signer->email,
            ]);
        }

        // Observers are notified once at send time
        if ($document->status === 'sent') {
            foreach ($document->signers()->where('role', 'observer')->get() as $observer) {
                $link = $base.'/sign/'.$observer->access_token;
                Mail::to($observer->email)->send(new SigningInvitationMail($document, $observer, $link));
                $this->audit->log($document, 'email.delivered', $request, null, $observer, [
                    'email' => $observer->email,
                    'role' => 'observer',
                ]);
            }
        }

        if ($document->status === 'sent') {
            $document->update(['status' => 'in_progress']);
        }
    }
}
