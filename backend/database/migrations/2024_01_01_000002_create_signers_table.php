<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email');
            $table->unsignedInteger('signing_order')->default(1);
            $table->string('role')->default('signer'); // signer, observer, approver
            $table->string('status')->default('pending'); // pending, notified, opened, viewed, signed, declined
            $table->string('access_token', 64)->unique();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('viewed_at')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->timestamp('declined_at')->nullable();
            $table->text('decline_reason')->nullable();
            $table->timestamps();

            $table->index(['document_id', 'signing_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signers');
    }
};
