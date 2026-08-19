<?php

namespace App\Services;

use App\Models\Document;
use App\Models\Signature;
use App\Models\SignatureField;
use App\Models\Signer;
use Illuminate\Support\Facades\Storage;
use setasign\Fpdi\Fpdi;

class PdfSignatureService
{
    public function applySignerFields(Document $document, Signer $signer, Signature $signature, array $fieldValues = []): string
    {
        $sourcePath = $this->resolveLocalPath($document->signed_file ?: $document->original_file);
        $pdf = new Fpdi();
        $pageCount = $pdf->setSourceFile($sourcePath);

        $fields = $signer->fields()->get()->groupBy('page');

        for ($page = 1; $page <= $pageCount; $page++) {
            $template = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($template);
            $orientation = $size['width'] > $size['height'] ? 'L' : 'P';
            $pdf->AddPage($orientation, [$size['width'], $size['height']]);
            $pdf->useTemplate($template);

            foreach ($fields->get($page, collect()) as $field) {
                $this->renderField($pdf, $field, $signature, $size, $fieldValues[$field->id] ?? $field->value);
            }
        }

        $relative = 'documents/'.$document->id.'/signed_'.time().'.pdf';
        $absolute = storage_path('app/'.$relative);
        @mkdir(dirname($absolute), 0775, true);
        $pdf->Output('F', $absolute);

        Storage::disk($this->disk())->put($relative, file_get_contents($absolute));

        $hash = hash_file('sha256', $absolute);
        $document->update([
            'signed_file' => $relative,
            'document_hash' => $hash,
        ]);

        $signature->update(['document_hash' => $hash]);

        return $relative;
    }

    public function generateCertificate(Document $document): string
    {
        $pdf = new Fpdi();
        $pdf->AddPage();
        $pdf->SetFont('Helvetica', 'B', 16);
        $pdf->Cell(0, 10, 'CERTIFICAT DE SIGNATURE ELECTRONIQUE', 0, 1, 'C');
        $pdf->Ln(5);

        $pdf->SetFont('Helvetica', 'B', 12);
        $pdf->Cell(0, 8, 'DOCUMENT', 0, 1);
        $pdf->SetFont('Helvetica', '', 11);
        $pdf->MultiCell(0, 6, "Document ID : DOC-{$document->created_at->format('Y')}-".str_pad((string) $document->id, 6, '0', STR_PAD_LEFT));
        $pdf->MultiCell(0, 6, 'Titre : '.$document->title);
        $pdf->MultiCell(0, 6, 'Hash SHA-256 : '.($document->document_hash ?: 'N/A'));
        $pdf->Ln(4);

        foreach ($document->signers as $signer) {
            $pdf->SetFont('Helvetica', 'B', 12);
            $pdf->Cell(0, 8, 'SIGNATAIRE', 0, 1);
            $pdf->SetFont('Helvetica', '', 11);
            $pdf->MultiCell(0, 6, 'Nom : '.$signer->full_name);
            $pdf->MultiCell(0, 6, 'Email : '.$signer->email);
            $pdf->MultiCell(0, 6, 'Role : '.$signer->role);
            $pdf->MultiCell(0, 6, 'Statut : '.$signer->status);

            if ($signer->signature) {
                $pdf->Ln(2);
                $pdf->SetFont('Helvetica', 'B', 12);
                $pdf->Cell(0, 8, 'SIGNATURE', 0, 1);
                $pdf->SetFont('Helvetica', '', 11);
                $pdf->MultiCell(0, 6, 'Date : '.$signer->signature->signed_at?->format('d/m/Y H:i'));
                $pdf->MultiCell(0, 6, 'IP : '.$signer->signature->ip_address);
                $pdf->MultiCell(0, 6, 'Navigateur : '.$this->browserLabel($signer->signature->user_agent));
                $pdf->MultiCell(0, 6, 'Methode : Signature electronique ('.$signer->signature->method.')');
                $pdf->MultiCell(0, 6, 'Hash document : '.$signer->signature->document_hash);
            }
            $pdf->Ln(4);
        }

        $pdf->SetFont('Helvetica', 'B', 12);
        $pdf->Cell(0, 8, 'EVENEMENTS', 0, 1);
        $pdf->SetFont('Helvetica', '', 10);
        foreach ($document->auditLogs as $log) {
            $pdf->MultiCell(0, 5, $log->created_at->format('d/m/Y H:i:s').' - '.$log->event.' - IP: '.($log->ip_address ?: '-'));
        }

        $relative = 'documents/'.$document->id.'/certificate_'.time().'.pdf';
        $absolute = storage_path('app/'.$relative);
        @mkdir(dirname($absolute), 0775, true);
        $pdf->Output('F', $absolute);
        Storage::disk($this->disk())->put($relative, file_get_contents($absolute));

        return $relative;
    }

    private function renderField(Fpdi $pdf, SignatureField $field, Signature $signature, array $size, mixed $value): void
    {
        $x = ((float) $field->x / 100) * $size['width'];
        $y = ((float) $field->y / 100) * $size['height'];
        $w = ((float) $field->width / 100) * $size['width'];
        $h = ((float) $field->height / 100) * $size['height'];

        switch ($field->type) {
            case 'signature':
                $image = $this->signatureImagePath($signature);
                if ($image) {
                    $pdf->Image($image, $x, $y, $w, $h);
                } elseif ($signature->typed_name) {
                    $pdf->SetFont('Helvetica', 'I', max(8, (int) ($h * 1.5)));
                    $pdf->SetXY($x, $y);
                    $pdf->Cell($w, $h, $signature->typed_name, 0, 0, 'C');
                }
                break;
            case 'initials':
                $name = $signature->typed_name ?: $signature->signer->full_name;
                $parts = preg_split('/\s+/', (string) $name) ?: [];
                $initials = collect($parts)
                    ->filter()
                    ->map(fn ($p) => mb_strtoupper(mb_substr($p, 0, 1)))
                    ->implode('');
                $text = is_string($value) && $value !== '' && ! str_contains($value, '.')
                    ? $value
                    : ($initials ?: str_replace('.', '', (string) $value));
                $pdf->SetFont('Helvetica', 'I', max(10, (int) ($h * 1.6)));
                $pdf->SetXY($x, $y);
                $pdf->Cell($w, $h, $text, 0, 0, 'C');
                break;
            case 'name':
                $pdf->SetFont('Helvetica', '', max(8, (int) ($h * 1.8)));
                $pdf->SetXY($x, $y);
                $pdf->Cell($w, $h, $signature->typed_name ?: $signature->signer->full_name, 0, 0, 'L');
                break;
            case 'date':
                $pdf->SetFont('Helvetica', '', max(8, (int) ($h * 1.8)));
                $pdf->SetXY($x, $y);
                $pdf->Cell($w, $h, $signature->signed_at->format('d/m/Y'), 0, 0, 'L');
                break;
            case 'text':
                $pdf->SetFont('Helvetica', '', max(8, (int) ($h * 1.6)));
                $pdf->SetXY($x, $y);
                $pdf->Cell($w, $h, (string) ($value ?? ''), 0, 0, 'L');
                break;
            case 'checkbox':
                $pdf->Rect($x, $y, min($w, $h), min($w, $h));
                if ($value === true || $value === '1' || $value === 1 || $value === 'true') {
                    $pdf->SetFont('Helvetica', 'B', max(8, (int) ($h * 1.5)));
                    $pdf->SetXY($x, $y);
                    $pdf->Cell(min($w, $h), min($w, $h), 'X', 0, 0, 'C');
                }
                break;
        }
    }

    private function signatureImagePath(Signature $signature): ?string
    {
        if (! $signature->signature_image) {
            return null;
        }

        if (str_starts_with($signature->signature_image, 'data:image')) {
            $data = explode(',', $signature->signature_image, 2)[1] ?? '';
            $binary = base64_decode($data);
            $tmp = storage_path('app/tmp_sig_'.$signature->id.'.png');
            file_put_contents($tmp, $binary);

            return $tmp;
        }

        $path = storage_path('app/'.$signature->signature_image);
        if (file_exists($path)) {
            return $path;
        }

        $contents = Storage::disk($this->disk())->get($signature->signature_image);
        $tmp = storage_path('app/tmp_sig_'.$signature->id.'.png');
        file_put_contents($tmp, $contents);

        return $tmp;
    }

    private function resolveLocalPath(string $relative): string
    {
        $local = storage_path('app/'.$relative);
        if (file_exists($local)) {
            return $local;
        }

        $contents = Storage::disk($this->disk())->get($relative);
        @mkdir(dirname($local), 0775, true);
        file_put_contents($local, $contents);

        return $local;
    }

    private function disk(): string
    {
        return config('filesystems.default', 'local');
    }

    private function browserLabel(?string $ua): string
    {
        $ua = $ua ?: '';
        return match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'Chrome/') => 'Chrome',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Safari/') => 'Safari',
            default => 'Unknown',
        };
    }
}
