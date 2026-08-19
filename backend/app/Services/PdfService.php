<?php

namespace App\Services;

use App\Models\Document;
use App\Models\Signer;
use Illuminate\Support\Facades\Storage;
use setasign\Fpdi\Fpdi;

class PdfService
{
    public function hashFile(string $absolutePath): string
    {
        return hash_file('sha256', $absolutePath);
    }

    public function absolutePath(string $diskPath): string
    {
        $disk = config('filesystems.default') === 's3' ? 'local' : config('filesystems.default');

        // Working copies always live on local disk for PDF processing
        return Storage::disk('local')->path($diskPath);
    }

    public function ensureLocalCopy(string $storagePath, string $disk = 'local'): string
    {
        $localRelative = 'processing/'.basename($storagePath);

        if ($disk === 'local') {
            return $storagePath;
        }

        $contents = Storage::disk($disk)->get($storagePath);
        Storage::disk('local')->put($localRelative, $contents);

        return $localRelative;
    }

    public function applySignatures(
        Document $document,
        Signer $signer,
        string $signatureImagePath,
        array $fieldValues = [],
        string $typedName = ''
    ): string {
        $sourceRelative = $document->signed_file ?: $document->original_file;
        $disk = config('filesystems.documents_disk', 'local');

        if ($disk !== 'local' && ! Storage::disk('local')->exists($sourceRelative)) {
            $sourceRelative = $this->ensureLocalCopy($sourceRelative, $disk);
        }

        $source = Storage::disk('local')->path($sourceRelative);
        $outputRelative = 'documents/signed/'.$document->reference.'-'.time().'.pdf';
        Storage::disk('local')->makeDirectory('documents/signed');
        $output = Storage::disk('local')->path($outputRelative);

        $pdf = new Fpdi();
        $pageCount = $pdf->setSourceFile($source);

        $fields = $signer->fields()->get();
        $signatureData = null;
        $displayName = trim($typedName) !== '' ? trim($typedName) : $signer->full_name;

        if (is_file($signatureImagePath)) {
            $signatureData = $signatureImagePath;
        }

        for ($page = 1; $page <= $pageCount; $page++) {
            $tpl = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($tpl);
            $orientation = $size['width'] > $size['height'] ? 'L' : 'P';
            $pdf->AddPage($orientation, [$size['width'], $size['height']]);
            $pdf->useTemplate($tpl);

            foreach ($fields->where('page', $page) as $field) {
                $x = ((float) $field->x / 100) * $size['width'];
                $y = ((float) $field->y / 100) * $size['height'];
                $w = ((float) $field->width / 100) * $size['width'];
                $h = ((float) $field->height / 100) * $size['height'];

                $value = $fieldValues[$field->id] ?? $field->value;

                switch ($field->type) {
                    case 'signature':
                        if ($signatureData) {
                            $pdf->Image($signatureData, $x, $y, $w, $h);
                        } else {
                            $pdf->SetFont('Helvetica', 'I', max(10, (int) ($h * 1.4)));
                            $pdf->SetXY($x, $y);
                            $pdf->Cell($w, $h, (string) ($value ?: $displayName), 0, 0, 'C');
                        }
                        break;
                    case 'initials':
                        $parts = preg_split('/\s+/', $displayName) ?: [];
                        $fromName = collect($parts)
                            ->filter()
                            ->map(fn ($p) => mb_strtoupper(mb_substr($p, 0, 1)))
                            ->implode('');
                        $text = (string) ($value ?: $fromName);
                        if ($text === '' || $text === $displayName || str_contains($text, '.')) {
                            $text = $fromName !== '' ? $fromName : str_replace('.', '', $text);
                        }
                        $pdf->SetFont('Helvetica', 'I', max(11, (int) ($h * 1.6)));
                        $pdf->SetXY($x, $y);
                        $pdf->Cell($w, $h, $text, 0, 0, 'C');
                        break;
                    case 'name':
                        $pdf->SetFont('Helvetica', 'I', 11);
                        $pdf->SetXY($x, $y);
                        $pdf->Cell($w, $h, $value ?: $displayName, 0, 0, 'L');
                        break;
                    case 'date':
                        $pdf->SetFont('Helvetica', '', 11);
                        $pdf->SetXY($x, $y);
                        $pdf->Cell($w, $h, $value ?: now()->format('d/m/Y H:i'), 0, 0, 'L');
                        break;
                    case 'text':
                        $pdf->SetFont('Helvetica', '', 11);
                        $pdf->SetXY($x, $y);
                        $pdf->Cell($w, $h, (string) $value, 0, 0, 'L');
                        break;
                    case 'checkbox':
                        $pdf->SetFont('Helvetica', 'B', 14);
                        $pdf->SetXY($x, $y);
                        $pdf->Cell($w, $h, ! empty($value) ? 'X' : '', 1, 0, 'C');
                        break;
                }
            }
        }

        $pdf->Output('F', $output);

        if ($disk === 's3') {
            Storage::disk('s3')->put($outputRelative, file_get_contents($output));
        }

        return $outputRelative;
    }

    public function generateCertificate(Document $document): string
    {
        $pdf = new Fpdi();
        $pdf->AddPage();
        $pdf->SetFont('Helvetica', 'B', 16);
        $pdf->Cell(0, 12, 'CERTIFICAT DE SIGNATURE ELECTRONIQUE', 0, 1, 'C');
        $pdf->Ln(6);

        $pdf->SetFont('Helvetica', 'B', 12);
        $pdf->Cell(0, 8, 'DOCUMENT', 0, 1);
        $pdf->SetFont('Helvetica', '', 11);
        $pdf->Cell(0, 7, 'Document ID : '.$document->reference, 0, 1);
        $pdf->Cell(0, 7, 'Titre : '.$document->title, 0, 1);
        $pdf->Cell(0, 7, 'Hash SHA-256 : '.($document->signed_hash ?: $document->original_hash), 0, 1);
        $pdf->Ln(4);

        $pdf->SetFont('Helvetica', 'B', 12);
        $pdf->Cell(0, 8, 'SIGNATAIRES', 0, 1);
        $pdf->SetFont('Helvetica', '', 11);

        foreach ($document->signers as $signer) {
            $pdf->Cell(0, 7, sprintf(
                '%s <%s> — %s — %s',
                $signer->full_name,
                $signer->email,
                strtoupper($signer->role),
                strtoupper($signer->status)
            ), 0, 1);

            if ($signer->signature) {
                $pdf->Cell(0, 7, '  Date : '.$signer->signature->signed_at?->format('d/m/Y H:i'), 0, 1);
                $pdf->Cell(0, 7, '  IP : '.$signer->signature->ip_address, 0, 1);
                $pdf->Cell(0, 7, '  Navigateur : '.substr((string) $signer->signature->user_agent, 0, 80), 0, 1);
                $pdf->Cell(0, 7, '  Methode : Signature electronique ('.$signer->signature->method.')', 0, 1);
            }
            $pdf->Ln(2);
        }

        $pdf->Ln(2);
        $pdf->SetFont('Helvetica', 'B', 12);
        $pdf->Cell(0, 8, 'EVENEMENTS', 0, 1);
        $pdf->SetFont('Helvetica', '', 10);

        foreach ($document->auditLogs as $log) {
            $pdf->Cell(0, 6, sprintf(
                '%s — %s — IP %s',
                $log->created_at?->format('d/m/Y H:i:s'),
                $log->event,
                $log->ip_address ?: '-'
            ), 0, 1);
        }

        $relative = 'documents/certificates/'.$document->reference.'-certificate.pdf';
        Storage::disk('local')->makeDirectory('documents/certificates');
        $absolute = Storage::disk('local')->path($relative);
        $pdf->Output('F', $absolute);

        if (config('filesystems.documents_disk') === 's3') {
            Storage::disk('s3')->put($relative, file_get_contents($absolute));
        }

        return $relative;
    }
}
