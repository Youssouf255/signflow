<?php

namespace App\Services;

use App\Models\Document;
use Illuminate\Support\Facades\Storage;

class DocumentPayloadStore
{
    public function persistOriginal(Document $document, string $path): void
    {
        $document->forceFill([
            'original_payload' => $this->encode($path),
        ])->save();
    }

    public function persistSigned(Document $document, string $path): void
    {
        $document->forceFill([
            'signed_payload' => $this->encode($path),
        ])->save();
    }

    public function restoreToDisk(Document $document): ?string
    {
        $path = $document->signed_file ?: $document->original_file;
        $disk = Storage::disk('local');

        if ($path && $disk->exists($path) && $disk->size($path) > 32) {
            return $path;
        }

        $payload = $document->signed_file
            ? $document->signed_payload
            : $document->original_payload;

        if (! $path || ! $payload) {
            return null;
        }

        $bytes = base64_decode($payload, true) ?: '';
        if (strlen($bytes) < 32) {
            return null;
        }

        $disk->put($path, $bytes);

        return $disk->exists($path) ? $path : null;
    }

    public function ensureLocal(Document $document): string
    {
        $path = $this->restoreToDisk($document);
        abort_unless((bool) $path, 404, 'Fichier PDF introuvable. Creez un nouveau dossier et reuploadez le PDF.');

        return $path;
    }

    public function absolutePath(Document $document): ?string
    {
        $path = $this->restoreToDisk($document);

        return $path ? Storage::disk('local')->path($path) : null;
    }

    private function encode(string $path): string
    {
        return base64_encode((string) Storage::disk('local')->get($path));
    }
}
