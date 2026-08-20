<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Services\DocumentPayloadStore;
use App\Services\DocumentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DocumentController extends Controller
{
    public function __construct(
        private DocumentService $documents,
        private DocumentPayloadStore $payloads
    ) {}

    public function index(Request $request)
    {
        $query = Document::where('owner_id', $request->user()->id)
            ->withCount('signers')
            ->latest();

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('reference', 'like', "%{$search}%");
            });
        }

        return response()->json($query->paginate(12));
    }

    public function store(Request $request)
    {
        if ($request->input('expires_at') === '' || $request->input('expires_at') === null) {
            $request->merge(['expires_at' => null]);
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'signers_count' => ['nullable', 'integer', 'min:0', 'max:50'],
            'file' => ['required', 'file', 'max:20480'],
        ], [
            'file.required' => 'Le fichier est obligatoire.',
            'file.max' => 'Le fichier ne doit pas dépasser 20 Mo.',
            'expires_at.after' => "La date d'expiration doit être dans le futur.",
            'expires_at.date' => "La date d'expiration est invalide.",
            'title.required' => 'Le titre est obligatoire.',
        ]);

        try {
            @set_time_limit(180);
            $document = $this->documents->create(
                $request->user(),
                $data,
                $request->file('file'),
                $request
            );
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($document, 201);
    }

    public function show(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        $document->load(['signers', 'fields', 'signatures', 'auditLogs.signer', 'owner']);
        $document->setAttribute('mail_status', $this->documents->mailStatus($document));

        return response()->json($document);
    }

    public function update(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        if ($document->status !== 'draft') {
            abort(422, 'Seul un brouillon peut etre modifie.');
        }

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'signers_count' => ['nullable', 'integer', 'min:0', 'max:50'],
        ]);

        $document->update($data);

        return response()->json($document->fresh(['signers', 'fields']));
    }

    public function syncSigners(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        if ($document->status !== 'draft') {
            abort(422, 'Les signataires ne peuvent etre modifies qu\'en brouillon.');
        }

        $data = $request->validate([
            'signers' => ['required', 'array', 'min:1'],
            'signers.*.first_name' => ['required', 'string', 'max:100'],
            'signers.*.last_name' => ['required', 'string', 'max:100'],
            'signers.*.email' => ['required', 'email'],
            'signers.*.signing_order' => ['nullable', 'integer', 'min:1'],
            'signers.*.role' => ['required', 'in:signer,observer,approver'],
        ]);

        try {
            $document = $this->documents->syncSigners($document, $data['signers'], $request, $request->user());
        } catch (\Throwable $e) {
            return response()->json([
                'message' => "Signataires : ".$e->getMessage(),
            ], 500);
        }

        return response()->json($document);
    }

    public function syncFields(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        if ($document->status !== 'draft') {
            abort(422, 'Les champs ne peuvent etre modifies qu\'en brouillon.');
        }

        $data = $request->validate([
            'fields' => ['required', 'array'],
            'fields.*.signer_id' => ['required', 'integer', 'exists:signers,id'],
            'fields.*.type' => ['required', 'in:signature,initials,name,date,text,checkbox'],
            'fields.*.page' => ['required', 'integer', 'min:1'],
            'fields.*.x' => ['required', 'numeric', 'min:0', 'max:100'],
            'fields.*.y' => ['required', 'numeric', 'min:0', 'max:100'],
            'fields.*.width' => ['required', 'numeric', 'min:1', 'max:100'],
            'fields.*.height' => ['required', 'numeric', 'min:1', 'max:100'],
            'fields.*.required' => ['boolean'],
            'fields.*.label' => ['nullable', 'string', 'max:255'],
        ]);

        $document = $this->documents->syncFields($document, $data['fields'], $request, $request->user());

        return response()->json($document);
    }

    public function send(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        if ($document->status !== 'draft') {
            abort(422, 'Ce document a deja ete envoye.');
        }

        $document = $this->documents->send($document, $request, $request->user());

        return response()->json($document);
    }

    public function resendInvite(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        $invitations = $this->documents->resendCurrentInvite($document, $request);
        $document = $document->fresh(['signers', 'fields', 'auditLogs']);
        $document->setAttribute('invitations', $invitations);
        $document->setAttribute('mail_status', $this->documents->mailStatus($document));

        return response()->json($document);
    }

    public function reopen(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        $document = $this->documents->reopenForEdit($document, $request, $request->user());

        return response()->json($document);
    }

    public function replaceFile(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        $data = $request->validate([
            'file' => ['required', 'file', 'max:20480'],
        ], [
            'file.required' => 'Le fichier est obligatoire.',
            'file.max' => 'Le fichier ne doit pas dépasser 20 Mo.',
        ]);

        try {
            @set_time_limit(180);
            $document = $this->documents->replaceFile($document, $data['file'], $request, $request->user());
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($document);
    }

    public function file(Request $request, Document $document): BinaryFileResponse
    {
        $this->authorizeOwner($request, $document);

        $path = $this->payloads->ensureLocal($document);
        $absolute = Storage::disk('local')->path($path);

        return response()->file($absolute, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="document.pdf"',
        ]);
    }

    public function destroy(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        if (! in_array($document->status, ['draft', 'cancelled'], true)) {
            abort(422, 'Impossible de supprimer un document deja envoye.');
        }

        $document->delete();

        return response()->json(['message' => 'Document supprime']);
    }

    public function audit(Request $request, Document $document)
    {
        $this->authorizeOwner($request, $document);

        return response()->json(
            $document->auditLogs()->with(['signer', 'user'])->orderBy('created_at')->get()
        );
    }

    private function authorizeOwner(Request $request, Document $document): void
    {
        if ($document->owner_id !== $request->user()->id) {
            abort(403, 'Acces refuse.');
        }
    }
}
