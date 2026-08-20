<?php

namespace App\Services;

use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mailer\Transport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

class GmailSmtpSender
{
    public function hasCredentials(): bool
    {
        return $this->username() !== '' && $this->password() !== '';
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
        $user = $this->username();
        $pass = $this->password();
        $from = $this->env('MAIL_FROM_ADDRESS') ?: $user;
        $name = $this->env('MAIL_FROM_NAME') ?: 'SignFlow';

        if ($user === '' || $pass === '') {
            throw new \RuntimeException('MAIL_USERNAME ou MAIL_PASSWORD absent dans Render > Environment.');
        }

        if ($from === '' || str_contains($from, 'signflow.local') || str_contains($from, 'example.com')) {
            $from = $user;
        }

        $text = trim(html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>/i', "\n", $html) ?: $html), ENT_QUOTES, 'UTF-8'));

        $email = (new Email())
            ->from(new Address($from, $name))
            ->replyTo(new Address($from, $name))
            ->to($to)
            ->subject($subject)
            ->text($text !== '' ? $text : $subject)
            ->html($html);

        $bccList = array_values(array_unique(array_filter(array_map('strtolower', $bcc))));
        $toLower = strtolower($to);
        foreach ($bccList as $copy) {
            if ($copy !== '' && $copy !== $toLower) {
                $email->addBcc($copy);
            }
        }
        if (strtolower($user) !== $toLower) {
            $email->addBcc($user);
        }

        if ($attachPath && is_file($attachPath)) {
            $email->attachFromPath($attachPath, $attachName ?: basename($attachPath), 'application/pdf');
        }

        $userEnc = rawurlencode($user);
        $passEnc = rawurlencode($pass);
        $attempts = [
            "smtp://{$userEnc}:{$passEnc}@smtp.gmail.com:587?encryption=starttls&verify_peer=0&timeout=15",
            "smtp://{$userEnc}:{$passEnc}@smtp.gmail.com:587?encryption=tls&verify_peer=0&timeout=15",
            "smtps://{$userEnc}:{$passEnc}@smtp.gmail.com:465?verify_peer=0&timeout=15",
        ];

        $errors = [];
        foreach ($attempts as $dsn) {
            try {
                (new Mailer(Transport::fromDsn($dsn)))->send($email);
                error_log("SignFlow mail envoye a {$to}");

                return;
            } catch (\Throwable $e) {
                $errors[] = $e->getMessage();
                error_log('SignFlow mail echec : '.$e->getMessage());
            }
        }

        throw new \RuntimeException(implode(' | ', $errors));
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
