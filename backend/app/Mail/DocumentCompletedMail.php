<?php

namespace App\Mail;

use App\Models\Document;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DocumentCompletedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Document $document,
        public string $recipientName,
        public string $absolutePdfPath,
        public string $downloadName
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Document signe : '.$this->document->title,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.document-completed',
            with: [
                'document' => $this->document,
                'recipientName' => $this->recipientName,
            ],
        );
    }

    public function attachments(): array
    {
        return [
            Attachment::fromPath($this->absolutePdfPath)
                ->as($this->downloadName)
                ->withMime('application/pdf'),
        ];
    }
}
