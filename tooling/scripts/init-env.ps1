# Creates .env with random local-only secrets if it does not exist.
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$env_ = Join-Path $root ".env"
if (Test-Path $env_) { Write-Host ".env already exists - leaving it untouched"; exit 0 }
function Rnd { -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | ForEach-Object {[char]$_}) }
(Get-Content (Join-Path $root ".env.example")) |
  ForEach-Object { $_ -replace '^AEGIS_DB_PASSWORD=.*', "AEGIS_DB_PASSWORD=$(Rnd)" -replace '^AEGIS_DEV_PASSWORD=.*', "AEGIS_DEV_PASSWORD=$(Rnd)" } |
  Set-Content $env_
Write-Host "Created .env (local only, gitignored). Dev login password is AEGIS_DEV_PASSWORD in .env"
