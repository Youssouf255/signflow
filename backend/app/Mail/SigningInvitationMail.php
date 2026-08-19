<?php

namespace App\Mail;

use App\Models\Document;
use App\Models\Signer;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SigningInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Document $document,
        public Signer $signer,
        public string $link
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Signature demandee : '.$this->document->title,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.signing-invitation',
            with: [
                'document' => $this->document,
                'signer' => $this->signer,
                'link' => $this->link,
            ],
        );
    }
}
