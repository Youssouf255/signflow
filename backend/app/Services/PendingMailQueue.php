<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class PendingMailQueue
{
    public function directory(): string
    {
        $dir = storage_path('app/pending-mail');
        File::ensureDirectoryExists($dir);

        return $dir;
    }

    public function push(array $payload): void
    {
        if (Schema::hasTable('pending_mails')) {
            DB::table('pending_mails')->insert([
                'type' => $payload['type'] ?? 'invite',
                'document_id' => (int) ($payload['document_id'] ?? 0),
                'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                'attempts' => 0,
                'available_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $path = $this->directory().'/'.uniqid('mail_', true).'.json';
            File::put($path, json_encode($payload, JSON_UNESCAPED_UNICODE));
        }

        $this->spawnWorker();
    }

    /**
     * @return list<array{id:?int, path:?string, payload:array, attempts:int}>
     */
    public function dueJobs(): array
    {
        $jobs = [];

        foreach (File::glob($this->directory().'/*.json') ?: [] as $file) {
            $data = $this->decodePayload(File::get($file));
            if (is_array($data)) {
                $jobs[] = [
                    'id' => null,
                    'path' => $file,
                    'payload' => $data,
                    'attempts' => 0,
                ];
            }
        }

        if (! Schema::hasTable('pending_mails')) {
            return $jobs;
        }

        $rows = DB::table('pending_mails')
            ->where(function ($q) {
                $q->whereNull('available_at')->orWhere('available_at', '<=', now());
            })
            ->where('attempts', '<', 8)
            ->orderBy('id')
            ->limit(15)
            ->get();

        foreach ($rows as $row) {
            $payload = $this->decodePayload($row->payload);
            if (! is_array($payload)) {
                Log::error('pending_mails payload invalide', ['id' => $row->id]);
                DB::table('pending_mails')->where('id', $row->id)->update([
                    'attempts' => 8,
                    'last_error' => 'payload JSON invalide',
                    'updated_at' => now(),
                ]);
                continue;
            }
            $jobs[] = [
                'id' => (int) $row->id,
                'path' => null,
                'payload' => $payload,
                'attempts' => (int) $row->attempts,
            ];
        }

        return $jobs;
    }

    public function statusFor(int $documentId): array
    {
        if (! Schema::hasTable('pending_mails')) {
            return [];
        }

        return DB::table('pending_mails')
            ->where('document_id', $documentId)
            ->orderByDesc('id')
            ->limit(5)
            ->get(['id', 'type', 'attempts', 'last_error', 'available_at', 'created_at'])
            ->map(fn ($row) => (array) $row)
            ->all();
    }

    public function ack(array $job): void
    {
        if (! empty($job['path']) && is_file($job['path'])) {
            File::delete($job['path']);
        }
        if (! empty($job['id']) && Schema::hasTable('pending_mails')) {
            DB::table('pending_mails')->where('id', $job['id'])->delete();
        }
    }

    public function nack(array $job, string $error): void
    {
        $attempts = (int) ($job['attempts'] ?? 0);
        $delay = min(120, 10 * (2 ** max(0, $attempts)));

        if (! empty($job['id']) && Schema::hasTable('pending_mails')) {
            DB::table('pending_mails')->where('id', $job['id'])->update([
                'attempts' => $attempts + 1,
                'last_error' => mb_substr($error, 0, 1000),
                'available_at' => now()->addSeconds($delay),
                'updated_at' => now(),
            ]);

            return;
        }

        if (! empty($job['path']) && is_file($job['path'])) {
            return;
        }

        $this->push($job['payload'] ?? []);
    }

    private function decodePayload(mixed $raw): ?array
    {
        if (is_array($raw)) {
            return $raw;
        }
        if (is_object($raw)) {
            $raw = json_encode($raw);
        }
        $decoded = json_decode((string) $raw, true);
        if (is_string($decoded)) {
            $decoded = json_decode($decoded, true);
        }

        return is_array($decoded) ? $decoded : null;
    }

    private function spawnWorker(): void
    {
        $php = PHP_BINARY;
        $artisan = base_path('artisan');
        if (! is_file($artisan)) {
            return;
        }

        try {
            if (PHP_OS_FAMILY === 'Windows') {
                pclose(popen('start /B "" '.escapeshellarg($php).' '.escapeshellarg($artisan).' signflow:send-pending-mail', 'r'));

                return;
            }

            @exec(escapeshellarg($php).' '.escapeshellarg($artisan).' signflow:send-pending-mail >/proc/1/fd/1 2>&1 &');
        } catch (\Throwable $e) {
            Log::warning('Impossible de lancer le worker mail : '.$e->getMessage());
        }
    }
}
