# Génère une clé SSH pour la VM Oracle Cloud Always Free (à coller dans la console OCI).
$keyPath = Join-Path $env:USERPROFILE ".ssh\oracle_signflow"
$pubPath = "$keyPath.pub"

New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".ssh") | Out-Null

if (Test-Path $keyPath) {
    Write-Host "Clé déjà présente : $keyPath"
} else {
    ssh-keygen -t rsa -b 4096 -f $keyPath -N ([string]::Empty) -C "signflow-oracle"
    Write-Host "Clé créée : $keyPath"
}

Write-Host ""
Write-Host "Collez cette clé PUBLIQUE dans Oracle (Create instance → SSH keys → Paste public key) :"
Write-Host "-----"
Get-Content $pubPath
Write-Host "-----"
Write-Host ""
Write-Host "Connexion ensuite :"
Write-Host "  ssh -i `"$keyPath`" ubuntu@IP_PUBLIQUE_ORACLE"
