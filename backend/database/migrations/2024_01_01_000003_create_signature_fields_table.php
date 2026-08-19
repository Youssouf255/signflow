<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('signature_fields', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->foreignId('signer_id')->constrained()->cascadeOnDelete();
            $table->string('type'); // signature, initials, name, date, text, checkbox
            $table->unsignedInteger('page')->default(1);
            $table->decimal('x', 8, 4);
            $table->decimal('y', 8, 4);
            $table->decimal('width', 8, 4)->default(20);
            $table->decimal('height', 8, 4)->default(5);
            $table->boolean('required')->default(true);
            $table->string('label')->nullable();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signature_fields');
    }
};
