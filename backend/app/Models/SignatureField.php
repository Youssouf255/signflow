<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignatureField extends Model
{
    protected $fillable = [
        'document_id',
        'signer_id',
        'type',
        'page',
        'x',
        'y',
        'width',
        'height',
        'required',
        'label',
        'value',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'x' => 'float',
            'y' => 'float',
            'width' => 'float',
            'height' => 'float',
            'page' => 'integer',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function signer(): BelongsTo
    {
        return $this->belongsTo(Signer::class);
    }
}
