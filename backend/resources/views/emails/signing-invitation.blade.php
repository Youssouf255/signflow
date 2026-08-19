<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Invitation a signer</title>
</head>
<body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <h2>Bonjour {{ $signer->first_name }},</h2>
    <p>
        Vous etes invite(e) a
        @if($signer->role === 'observer')
            consulter
        @elseif($signer->role === 'approver')
            approuver
        @else
            signer
        @endif
        le document <strong>{{ $document->title }}</strong>
        ({{ $document->reference }}).
    </p>
    <p>Cliquez sur le bouton ci-dessous pour ouvrir le document et effectuer votre action.</p>
    @if($document->expires_at)
        <p>Date d'expiration : <strong>{{ $document->expires_at->format('d/m/Y H:i') }}</strong></p>
    @endif
    <p>
        <a href="{{ $link }}"
           style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">
            Ouvrir le document
        </a>
    </p>
    <p style="font-size: 12px; color: #6b7280;">
        Ce lien est personnel et securise. Ne le partagez pas.
    </p>
</body>
</html>
