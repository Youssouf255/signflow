# Publie SignFlow (Docker local, port 80) sur Internet via Cloudflare Tunnel.
# Aucun compte Oracle / Render. L'URL change à chaque lancement.
$ErrorActionPreference = "Stop"

function Test-Port80 {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1/" -UseBasicParsing -TimeoutSec 5
        return $r.StatusCode -ge 200
    } catch {
        return $false
    }
}

Write-Host "Verification de SignFlow sur http://127.0.0.1/ ..."
if (-not (Test-Port80)) {
    Write-Host "L'app n'est pas joignable sur le port 80."
    Write-Host "Lancez d'abord :  .\start-prod.ps1"
    Write-Host "Puis rouvrez ce script."
    exit 1
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
    Write-Host "Installation de cloudflared (winget)..."
    winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
}

if (-not $cloudflared) {
    Write-Host "cloudflared introuvable. Installez-le : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    exit 1
}

Write-Host ""
Write-Host "Tunnel en cours. Une URL https://xxxxx.trycloudflare.com va s'afficher."
Write-Host "Partagez cette URL pour tester. Ctrl+C pour arreter."
Write-Host ""
cloudflared tunnel --url http://127.0.0.1:80
