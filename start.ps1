Write-Host "Demarrage SignFlow (Docker Compose)..." -ForegroundColor Cyan
docker info > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Desktop n'est pas demarre. Lancez-le puis relancez ce script." -ForegroundColor Red
  exit 1
}
docker compose up --build
