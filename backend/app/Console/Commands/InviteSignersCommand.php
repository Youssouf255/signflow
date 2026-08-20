<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Services\DocumentService;
use Illuminate\Console\Command;

class InviteSignersCommand extends Command
{
    protected $signature = 'signflow:invite-signers {document} {ids}';

    protected $description = 'Envoie les e-mails d invitation aux signataires';

    public function handle(DocumentService $documents): int
    {
        $document = Document::with('signers')->find($this->argument('document'));
        if (! $document) {
            $this->error('Document introuvable.');

            return self::FAILURE;
        }

        $ids = array_values(array_filter(array_map('intval', explode(',', (string) $this->argument('ids')))));
        $targets = $document->signers->filter(fn ($signer) => in_array((int) $signer->id, $ids, true));
        $result = $documents->inviteSigners($document, $targets);
        $this->info('sent='.count($result['sent'] ?? []).' failed='.count($result['failed'] ?? []));
        if (! empty($result['error'])) {
            $this->warn($result['error']);
        }

        return self::SUCCESS;
    }
}
