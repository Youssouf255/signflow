<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mailer\Transport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

class GmailSmtpSender
{
    public function hasCredentials(): bool
    {
        return $this->resendKey() !== '' || $this->brevoKey() !== '' || $this->sendgridKey() !== ''
            || ($this->username() !== '' && $this->password() !== '');
    }

    public function hasHttpMailer(): bool
    {
        return $this->resendKey() !== '' || $this->brevoKey() !== '' || $this->sendgridKey() !== '';
    }

    public function username(): string
    {
        return $this->env('MAIL_USERNAME') ?: (string) config('mail.mailers.smtp.username');
    }

    public function send(
        string $to,
        string $subject,
        string $html,
        ?string $attachPath = null,
        ?string $attachName = null,
        array $bcc = []
    ): void {
        $from = $this->fromAddress();
        $name = $this->env('MAIL_FROM_NAME') ?: 'SignFlow';
        $text = trim(html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>/i', "\n", $html) ?: $html), ENT_QUOTES, 'UTF-8'));
        $bccList = $this->bccList($to, $bcc);

        if ($from === '') {
            throw new \RuntimeException(
                'Adresse d’envoi manquante. Définissez MAIL_FROM_ADDRESS (ex. y7949249@gmail.com) dans Render > Environment.'
            );
        }

        if ($this->brevoKey() !== '') {
            $this->sendBrevo($to, $from, $name, $subject, $html, $text, $attachPath, $attachName, $bccList);
            error_log("SignFlow mail Brevo envoye a {$to}");

            return;
        }

        if ($this->sendgridKey() !== '') {
            $this->sendSendgrid($to, $from, $name, $subject, $html, $text, $attachPath, $attachName, $bccList);
            error_log("SignFlow mail SendGrid envoye a {$to}");

            return;
        }

        if ($this->resendKey() !== '') {
            $this->sendResend($to, $from, $name, $subject, $html, $text, $attachPath, $attachName, $bccList);
            error_log("SignFlow mail Resend envoye a {$to}");

            return;
        }

        if ($this->onRender()) {
            throw new \RuntimeException(
                'Render bloque Gmail SMTP. Créez un compte SendGrid (vérification par e-mail, sans SMS), ajoutez SENDGRID_API_KEY dans Render, puis cliquez sur Renvoyer l’invitation.'
            );
        }

        $this->sendSmtp($to, $from, $name, $subject, $html, $text, $attachPath, $attachName, $bccList);
        error_log("SignFlow mail SMTP envoye a {$to}");
    }

    private function sendResend(
        string $to,
        string $from,
        string $name,
        string $subject,
        string $html,
        string $text,
        ?string $attachPath,
        ?string $attachName,
        array $bcc
    ): void {
        $payload = [
            'from' => $name.' <'.$from.'>',
            'to' => [$to],
            'subject' => $subject,
            'html' => $html,
            'text' => $text !== '' ? $text : $subject,
        ];
        if ($bcc !== []) {
            $payload['bcc'] = $bcc;
        }
        if ($attachPath && is_file($attachPath)) {
            $payload['attachments'] = [[
                'filename' => $attachName ?: basename($attachPath),
                'content' => base64_encode((string) file_get_contents($attachPath)),
            ]];
        }

        $response = Http::timeout(20)
            ->withToken($this->resendKey())
            ->acceptJson()
            ->post('https://api.resend.com/emails', $payload);

        if (! $response->successful()) {
            throw new \RuntimeException('Resend: '.mb_substr($response->body(), 0, 400));
        }
    }

    private function sendBrevo(
        string $to,
        string $from,
        string $name,
        string $subject,
        string $html,
        string $text,
        ?string $attachPath,
        ?string $attachName,
        array $bcc
    ): void {
        $payload = [
            'sender' => ['name' => $name, 'email' => $from],
            'to' => [['email' => $to]],
            'subject' => $subject,
            'htmlContent' => $html,
            'textContent' => $text !== '' ? $text : $subject,
        ];
        if ($bcc !== []) {
            $payload['bcc'] = array_map(fn ($email) => ['email' => $email], $bcc);
        }
        if ($attachPath && is_file($attachPath)) {
            $payload['attachment'] = [[
                'name' => $attachName ?: basename($attachPath),
                'content' => base64_encode((string) file_get_contents($attachPath)),
            ]];
        }

        $response = Http::timeout(20)
            ->withHeaders(['api-key' => $this->brevoKey()])
            ->acceptJson()
            ->post('https://api.brevo.com/v3/smtp/email', $payload);

        if (! $response->successful()) {
            throw new \RuntimeException('Brevo: '.mb_substr($response->body(), 0, 400));
        }
    }

    private function sendSendgrid(
        string $to,
        string $from,
        string $name,
        string $subject,
        string $html,
        string $text,
        ?string $attachPath,
        ?string $attachName,
        array $bcc
    ): void {
        $personalization = [
            'to' => [['email' => $to]],
        ];
        if ($bcc !== []) {
            $personalization['bcc'] = array_map(fn ($email) => ['email' => $email], $bcc);
        }

        $payload = [
            'personalizations' => [$personalization],
            'from' => ['email' => $from, 'name' => $name],
            'reply_to' => ['email' => $from, 'name' => $name],
            'subject' => $subject,
            'content' => [
                ['type' => 'text/plain', 'value' => $text !== '' ? $text : $subject],
                ['type' => 'text/html', 'value' => $html],
            ],
        ];
        if ($attachPath && is_file($attachPath)) {
            $payload['attachments'] = [[
                'content' => base64_encode((string) file_get_contents($attachPath)),
                'filename' => $attachName ?: basename($attachPath),
                'type' => 'application/pdf',
                'disposition' => 'attachment',
            ]];
        }

        $response = Http::timeout(20)
            ->withToken($this->sendgridKey())
            ->acceptJson()
            ->post('https://api.sendgrid.com/v3/mail/send', $payload);

        if ($response->status() !== 202 && ! $response->successful()) {
            throw new \RuntimeException('SendGrid: '.mb_substr($response->body() ?: ('HTTP '.$response->status()), 0, 400));
        }
    }

    private function sendSmtp(
        string $to,
        string $from,
        string $name,
        string $subject,
        string $html,
        string $text,
        ?string $attachPath,
        ?string $attachName,
        array $bcc
    ): void {
        $user = $this->username();
        $pass = $this->password();
        if ($user === '' || $pass === '') {
            throw new \RuntimeException(
                'Render bloque Gmail SMTP. Ajoutez SENDGRID_API_KEY dans Render > Environment.'
            );
        }

        $email = (new Email())
            ->from(new Address($from, $name))
            ->replyTo(new Address($from, $name))
            ->to($to)
            ->subject($subject)
            ->text($text !== '' ? $text : $subject)
            ->html($html);

        foreach ($bcc as $copy) {
            $email->addBcc($copy);
        }

        if ($attachPath && is_file($attachPath)) {
            $email->attachFromPath($attachPath, $attachName ?: basename($attachPath), 'application/pdf');
        }

        $userEnc = rawurlencode($user);
        $passEnc = rawurlencode($pass);
        $attempts = [
            "smtp://{$userEnc}:{$passEnc}@smtp.gmail.com:587?encryption=starttls&verify_peer=0&timeout=8",
            "smtps://{$userEnc}:{$passEnc}@smtp.gmail.com:465?verify_peer=0&timeout=8",
        ];

        $errors = [];
        foreach ($attempts as $dsn) {
            try {
                (new Mailer(Transport::fromDsn($dsn)))->send($email);

                return;
            } catch (\Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        throw new \RuntimeException(
            'Render bloque Gmail SMTP. Ajoutez SENDGRID_API_KEY dans Render > Environment. Details : '.implode(' | ', $errors)
        );
    }

    private function fromAddress(): string
    {
        $from = $this->env('MAIL_FROM_ADDRESS') ?: $this->username();
        if ($from === '' || str_contains($from, 'signflow.local') || str_contains($from, 'example.com')) {
            $from = $this->username();
        }
        if ($from === '' && $this->resendKey() !== '') {
            $from = 'beth.t@example.com';
        }

        return $from;
    }

    private function onRender(): bool
    {
        return $this->env('RENDER') === 'true' || $this->env('RENDER_EXTERNAL_URL') !== '';
    }

    private function bccList(string $to, array $bcc): array
    {
        $toLower = strtolower($to);
        $list = array_values(array_unique(array_filter(array_map('strtolower', $bcc))));
        $user = strtolower($this->username());
        if ($user !== '' && $user !== $toLower) {
            $list[] = $user;
        }

        return array_values(array_unique(array_filter($list, fn ($email) => $email !== '' && $email !== $toLower)));
    }

    private function resendKey(): string
    {
        return $this->env('RESEND_API_KEY');
    }

    private function brevoKey(): string
    {
        return $this->env('BREVO_API_KEY') ?: $this->env('SENDINBLUE_API_KEY');
    }

    private function sendgridKey(): string
    {
        return $this->env('SENDGRID_API_KEY');
    }

    private function password(): string
    {
        return str_replace(' ', '', $this->env('MAIL_PASSWORD') ?: (string) config('mail.mailers.smtp.password'));
    }

    private function env(string $key): string
    {
        foreach ([getenv($key), $_ENV[$key] ?? null, $_SERVER[$key] ?? null, env($key)] as $value) {
            if (is_string($value)) {
                $value = trim($value);
                if ($value !== '' && strcasecmp($value, 'null') !== 0) {
                    return $value;
                }
            }
        }

        return '';
    }
}
