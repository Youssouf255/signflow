<?php

namespace App\Providers;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        foreach ([
            'documents/original',
            'documents/signed',
            'documents/certificates',
            'signatures',
            'processing',
        ] as $directory) {
            Storage::disk('local')->makeDirectory($directory);
        }
    }
}
