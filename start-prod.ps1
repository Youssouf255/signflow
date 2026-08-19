Write-Host "Demarrage SignFlow PRODUCTION (Docker Compose)..." -ForegroundColor Cyan
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Desktop n'est pas demarre. Lancez-le puis relancez ce script." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path .env.production)) {
  Copy-Item .env.production.example .env.production
  $raw = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($raw)
  $key = "base64:" + [Convert]::ToBase64String($raw)
  (Get-Content .env.production -Raw) -replace 'APP_KEY=.*', "APP_KEY=$key" | Set-Content .env.production -Encoding UTF8
  Write-Host "Fichier .env.production cree. Renseignez APP_URL / FRONTEND_URL (IP ou domaine) puis relancez." -ForegroundColor Yellow
  exit 0
}
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
Write-Host "Application : http://localhost/" -ForegroundColor Green
