<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Signer extends Model
{
    protected $fillable = [
        'document_id',
        'first_name',
        'last_name',
        'email',
        'signing_order',
        'role',
        'status',
        'access_token',
        'token_expires_at',
        'notified_at',
        'opened_at',
        'signed_at',
        'decline_reason',
    ];

    protected function casts(): array
    {
        return [
            'token_expires_at' => 'datetime',
            'notified_at' => 'datetime',
            'opened_at' => 'datetime',
            'signed_at' => 'datetime',
        ];
    }

    protected $hidden = [
        'access_token',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function fields(): HasMany
    {
        return $this->hasMany(SignatureField::class);
    }

    public function signature(): HasOne
    {
        return $this->hasOne(Signature::class);
    }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function canSign(): bool
    {
        if (! in_array($this->role, ['signer', 'approver'], true)) {
            return false;
        }

        if (in_array($this->status, ['signed', 'approved', 'declined'], true)) {
            return false;
        }

        $document = $this->document;

        if (! $document || in_array($document->status, ['completed', 'declined', 'expired', 'cancelled'], true)) {
            return false;
        }

        if ($document->expires_at && $document->expires_at->isPast()) {
            return false;
        }

        $previousPending = $document->signers()
            ->where('signing_order', '<', $this->signing_order)
            ->where('role', '!=', 'observer')
            ->whereNotIn('status', ['signed', 'approved'])
            ->exists();

        return ! $previousPending;
    }
}
