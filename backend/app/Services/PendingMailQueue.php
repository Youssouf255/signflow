<?php

namespace App\Services;

use Illuminate\Support\Facades\File;

class PendingMailQueue
{
    public function directory(): string
    {
        $dir = storage_path('app/pending-mail');
        File::ensureDirectoryExists($dir);

        return $dir;
    }

    public function push(array $payload): string
    {
        $path = $this->directory().'/'.uniqid('mail_', true).'.json';
        File::put($path, json_encode($payload, JSON_UNESCAPED_UNICODE));

        return $path;
    }

    public function pullAll(): array
    {
        $jobs = [];
        foreach (File::glob($this->directory().'/*.json') ?: [] as $file) {
            $raw = File::get($file);
            File::delete($file);
            $data = json_decode((string) $raw, true);
            if (is_array($data)) {
                $jobs[] = $data;
            }
        }

        return $jobs;
    }
}
