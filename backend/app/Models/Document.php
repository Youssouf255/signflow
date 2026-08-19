<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Document extends Model
{
    protected $fillable = [
        'owner_id',
        'reference',
        'title',
        'description',
        'original_file',
        'signed_file',
        'original_hash',
        'signed_hash',
        'status',
        'signers_count',
        'expires_at',
        'sent_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'sent_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function signers(): HasMany
    {
        return $this->hasMany(Signer::class)->orderBy('signing_order');
    }

    public function fields(): HasMany
    {
        return $this->hasMany(SignatureField::class);
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(Signature::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class)->orderBy('created_at');
    }

    public function currentSigner(): ?Signer
    {
        return $this->signers()
            ->whereIn('status', ['pending', 'notified', 'opened', 'viewed'])
            ->where('role', '!=', 'observer')
            ->orderBy('signing_order')
            ->first();
    }
}
