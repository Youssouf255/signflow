<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\Process\Process;

class DocumentConversionService
{
    public const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];

    public function isAllowed(UploadedFile $file): bool
    {
        $ext = strtolower((string) $file->getClientOriginalExtension());

        return in_array($ext, self::ALLOWED_EXTENSIONS, true);
    }

    /**
     * Store the upload and always return a PDF used for preview, signature and the final file.
     * Word (.doc, .docx) and Excel (.xls, .xlsx) are converted to PDF.
     *
     * @return array{pdf_relative:string, source_relative:?string, extension:string}
     */
    public function storeAsPdf(UploadedFile $file, string $reference): array
    {
        if (! $this->isAllowed($file)) {
            throw new RuntimeException('Formats acceptés : PDF, Word (.doc, .docx) et Excel (.xls, .xlsx).');
        }

        $ext = strtolower((string) $file->getClientOriginalExtension());
        $disk = Storage::disk('local');
        $disk->makeDirectory('documents/original');
        $disk->makeDirectory('documents/sources');

        if ($ext === 'pdf') {
            $filename = $reference.'.pdf';
            $stored = $file->storeAs('documents/original', $filename, 'local');
            if (! $stored) {
                throw new RuntimeException('Impossible d\'enregistrer le PDF.');
            }

            return [
                'pdf_relative' => $stored,
                'source_relative' => null,
                'extension' => $ext,
            ];
        }

        $sourceRelative = 'documents/sources/'.$reference.'.'.$ext;
        $disk->put($sourceRelative, file_get_contents($file->getRealPath()));

        $pdfRelative = 'documents/original/'.$reference.'.pdf';
        $pdfAbsolute = $disk->path($pdfRelative);
        File::ensureDirectoryExists(dirname($pdfAbsolute));

        $this->convertWithLibreOffice($disk->path($sourceRelative), $pdfAbsolute, $ext);

        if (! is_file($pdfAbsolute) || filesize($pdfAbsolute) < 32) {
            throw new RuntimeException('La conversion du document en PDF a échoué.');
        }

        return [
            'pdf_relative' => $pdfRelative,
            'source_relative' => $sourceRelative,
            'extension' => $ext,
        ];
    }

    private function convertWithLibreOffice(string $sourceAbsolute, string $targetPdf, string $ext): void
    {
        @set_time_limit(180);
        @ini_set('max_execution_time', '180');

        $soffice = $this->libreOfficeBinary();
        if (! $soffice) {
            throw new RuntimeException(
                'LibreOffice est requis pour convertir Word/Excel en PDF. Installez LibreOffice, puis réessayez.'
            );
        }

        $workDir = 'C:\\signflow-lo\\'.Str::lower(Str::random(10));
        $inDir = $workDir.DIRECTORY_SEPARATOR.'in';
        $outDir = $workDir.DIRECTORY_SEPARATOR.'out';
        File::ensureDirectoryExists($inDir);
        File::ensureDirectoryExists($outDir);

        $input = $inDir.DIRECTORY_SEPARATOR.'source.'.$ext;
        if (! @copy($sourceAbsolute, $input)) {
            File::deleteDirectory($workDir);
            throw new RuntimeException('Impossible de préparer le fichier Word/Excel pour la conversion.');
        }

        $programDir = dirname($soffice);
        $generated = $outDir.DIRECTORY_SEPARATOR.'source.pdf';
        $errors = [];

        foreach ($this->conversionCommands($soffice, $programDir, $workDir, $outDir, $input) as $process) {
            $process->run();
            if (! $this->fileReady($generated)) {
                $this->waitForFile($generated, 8);
            }
            if ($this->fileReady($generated)) {
                break;
            }
            $errors[] = trim($process->getErrorOutput()."\n".$process->getOutput());
        }

        if (! $this->fileReady($generated)) {
            File::deleteDirectory($workDir);
            $details = trim(implode("\n", array_filter($errors)));
            throw new RuntimeException(
                'Conversion Word/Excel vers PDF impossible'.($details !== '' ? ' : '.Str::limit($details, 220) : '.')
            );
        }

        @unlink($targetPdf);
        File::move($generated, $targetPdf);
        File::deleteDirectory($workDir);
    }

    /**
     * @return list<Process>
     */
    private function conversionCommands(string $soffice, string $programDir, string $workDir, string $outDir, string $input): array
    {
        $base = [
            $soffice,
            '--headless',
            '--nologo',
            '--norestore',
            '--nolockcheck',
            '--nodefault',
            '--nofirststartwizard',
            '--convert-to',
            'pdf',
            '--outdir',
            $outDir,
            $input,
        ];

        $plain = new Process($base, $programDir, $this->libreOfficeEnv($programDir));
        $plain->setTimeout(120);

        $profile = $workDir.DIRECTORY_SEPARATOR.'profile';
        File::ensureDirectoryExists($profile);
        $isolated = new Process(array_merge([
            $soffice,
            '-env:UserInstallation=file:///'.str_replace('\\', '/', $profile),
        ], array_slice($base, 1)), $programDir, $this->libreOfficeEnv($programDir));
        $isolated->setTimeout(120);

        return [$plain, $isolated];
    }

    private function libreOfficeEnv(string $programDir): array
    {
        $env = [];
        foreach ($_ENV + $_SERVER as $key => $value) {
            if (! is_string($key) || ! is_scalar($value)) {
                continue;
            }
            $env[$key] = (string) $value;
        }
        $env['PATH'] = $programDir.';'.($env['PATH'] ?? getenv('PATH') ?: '');
        $env['SystemRoot'] = $env['SystemRoot'] ?? 'C:\\Windows';
        $env['TEMP'] = $env['TEMP'] ?? sys_get_temp_dir();
        $env['TMP'] = $env['TMP'] ?? sys_get_temp_dir();

        return $env;
    }

    private function fileReady(string $path): bool
    {
        clearstatcache(true, $path);

        return is_file($path) && filesize($path) > 32;
    }

    private function waitForFile(string $path, int $seconds): void
    {
        $deadline = microtime(true) + $seconds;
        while (microtime(true) < $deadline) {
            if ($this->fileReady($path)) {
                return;
            }
            usleep(200000);
        }
    }

    private function libreOfficeBinary(): ?string
    {
        $configured = trim((string) config('services.libreoffice.path', env('LIBREOFFICE_PATH')), " \t\n\r\0\x0B\"'");
        $candidates = array_filter([
            $configured,
            'C:\\Program Files\\LibreOffice\\program\\soffice.com',
            'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            '/usr/bin/soffice',
            '/usr/bin/libreoffice',
        ]);

        foreach ($candidates as $path) {
            if (! is_file($path)) {
                continue;
            }

            if (str_ends_with(strtolower($path), '.exe')) {
                $com = substr($path, 0, -4).'.com';
                if (is_file($com)) {
                    return $com;
                }
            }

            return $path;
        }

        return null;
    }
}
