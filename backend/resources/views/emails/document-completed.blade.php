<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Document signe</title>
</head>
<body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <h2>Bonjour {{ $recipientName }},</h2>
    <p>
        Le document <strong>{{ $document->title }}</strong>
        ({{ $document->reference }}) a ete signe par tous les signataires.
    </p>
    <p>
        Le PDF final signe est joint a cet e-mail. Conservez-le comme copie officielle.
    </p>
    <p style="font-size: 12px; color: #6b7280;">
        Message automatique envoye par SignFlow.
    </p>
</body>
</html>
