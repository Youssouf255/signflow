<?php

namespace App\Services;

use Symfony\Component\Mailer\Mailer;
use Symfony\Component\Mailer\Transport;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

class GmailSmtpSender
{
    public function send(
        string $to,
        string $subject,
        string $html,
        ?string $attachPath = null,
        ?string $attachName = null
    ): void {
        $user = $this->env('MAIL_USERNAME') ?: (string) config('mail.mailers.smtp.username');
        $pass = str_replace(' ', '', $this->env('MAIL_PASSWORD') ?: (string) config('mail.mailers.smtp.password'));
        $from = $this->env('MAIL_FROM_ADDRESS') ?: $user;
        $name = $this->env('MAIL_FROM_NAME') ?: 'SignFlow';

        if ($user === '' || $pass === '') {
            throw new \RuntimeException('MAIL_USERNAME ou MAIL_PASSWORD absent dans Render.');
        }

        if ($from === '' || str_contains($from, 'signflow.local')) {
            $from = $user;
        }

        $email = (new Email())
            ->from(new Address($from, $name))
            ->to($to)
            ->subject($subject)
            ->html($html);

        if ($attachPath && is_file($attachPath)) {
            $email->attachFromPath($attachPath, $attachName ?: basename($attachPath), 'application/pdf');
        }

        $userEnc = rawurlencode($user);
        $passEnc = rawurlencode($pass);
        $attempts = [
            "smtp://{$userEnc}:{$passEnc}@smtp.gmail.com:587?encryption=tls&verify_peer=0",
            "smtps://{$userEnc}:{$passEnc}@smtp.gmail.com:465?verify_peer=0",
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
