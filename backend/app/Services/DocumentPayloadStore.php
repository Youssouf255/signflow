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

    public function ensureLocal(Document $document): string
    {
        $path = $document->signed_file ?: $document->original_file;
        $disk = Storage::disk('local');

        if ($path && $disk->exists($path)) {
            return $path;
        }

        $payload = $document->signed_file
            ? $document->signed_payload
            : $document->original_payload;

        if ($path && $payload) {
            $disk->put($path, base64_decode($payload, true) ?: '');
            abort_unless($disk->exists($path) && $disk->size($path) > 32, 404, 'Fichier PDF introuvable.');

            return $path;
        }

        abort(404, 'Fichier PDF introuvable. Creez un nouveau dossier et reuploadez le PDF.');
    }

    private function encode(string $path): string
    {
        return base64_encode((string) Storage::disk('local')->get($path));
    }
}
