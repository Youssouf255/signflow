<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pending_mails', function (Blueprint $table) {
            $table->id();
            $table->string('type', 32)->default('invite');
            $table->unsignedBigInteger('document_id');
            $table->json('payload');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('available_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index(['available_at', 'attempts']);
            $table->index('document_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_mails');
    }
};
