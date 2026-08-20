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
        $jobs = $queue->dueJobs();
        if ($jobs === []) {
            return self::SUCCESS;
        }

        foreach ($jobs as $job) {
            $payload = $job['payload'] ?? [];
            $type = $payload['type'] ?? 'invite';
            $document = Document::with(['signers', 'owner'])->find($payload['document_id'] ?? 0);
            if (! $document) {
                $this->warn('Document introuvable');
                $queue->ack($job);
                continue;
            }

            try {
                if ($type === 'completed') {
                    $documents->notifyDocumentCompleted($document);
                    $queue->ack($job);
                    $this->info('completed document='.$document->id);
                    continue;
                }

                $ids = array_values(array_map('intval', $payload['signer_ids'] ?? []));
                if ($ids === []) {
                    $this->warn('invite sans signataire document='.$document->id);
                    $queue->ack($job);
                    continue;
                }

                $targets = $document->signers
                    ->filter(fn ($signer) => in_array((int) $signer->id, $ids, true));

                if ($targets->isEmpty()) {
                    $this->warn('signataires introuvables document='.$document->id);
                    $queue->nack($job, 'signataires introuvables');
                    continue;
                }

                $result = $documents->inviteSigners($document, $targets, null, true);
                $failed = $result['failed'] ?? [];
                $this->info('invite sent='.count($result['sent'] ?? []).' failed='.count($failed));

                if ($failed === []) {
                    $queue->ack($job);
                } else {
                    $queue->nack($job, (string) ($result['error'] ?? 'smtp failed'));
                }
            } catch (\Throwable $e) {
                $queue->nack($job, $e->getMessage());
                $this->warn($e->getMessage());
            }
        }

        return self::SUCCESS;
    }
}
