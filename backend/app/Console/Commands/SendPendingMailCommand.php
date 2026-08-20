<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Services\DocumentService;
use App\Services\PendingMailQueue;
use Illuminate\Console\Command;

class SendPendingMailCommand extends Command
{
    protected $signature = 'signflow:send-pending-mail';

    protected $description = 'Envoie les e-mails SignFlow en attente (Gmail SMTP)';

    public function handle(PendingMailQueue $queue, DocumentService $documents): int
    {
        $jobs = $queue->pullAll();
        if ($jobs === []) {
            return self::SUCCESS;
        }

        foreach ($jobs as $job) {
            $type = $job['type'] ?? 'invite';
            $document = Document::with(['signers', 'owner'])->find($job['document_id'] ?? 0);
            if (! $document) {
                $this->warn('Document introuvable');
                continue;
            }

            if ($type === 'completed') {
                $documents->notifyDocumentCompleted($document);
                $this->info('completed document='.$document->id);
                continue;
            }

            $ids = array_map('intval', $job['signer_ids'] ?? []);
            $targets = $document->signers->filter(fn ($signer) => in_array((int) $signer->id, $ids, true));
            if ($targets->isEmpty()) {
                $targets = $document->signers->whereNull('notified_at');
            }
            $result = $documents->inviteSigners($document, $targets);
            $this->info('invite sent='.count($result['sent'] ?? []).' failed='.count($result['failed'] ?? []));
            if (! empty($result['error'])) {
                $this->warn($result['error']);
            }
        }

        return self::SUCCESS;
    }
}
