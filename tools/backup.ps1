# PostgreSQL backup for student_followup.
# Reads DATABASE_URL from packages/db/.env unless already set.
# Usage:  .\tools\backup.ps1 [-OutDir .\backups]
# Requires pg_dump on PATH (ships with PostgreSQL).
# Schedule daily via Task Scheduler in production.

param(
  [string]$OutDir = ".\backups"
)

$envFile = Join-Path $PSScriptRoot "..\packages\db\.env"
if (-not $env:DATABASE_URL) {
  if (-not (Test-Path $envFile)) {
    Write-Error "DATABASE_URL not set and $envFile missing"
    exit 1
  }
  $line = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  $env:DATABASE_URL = ($line -replace '^DATABASE_URL=', '').Trim('"', "'")
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  $candidate = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
  if (Test-Path $candidate) { $pgDumpPath = $candidate }
  else {
    Write-Error "pg_dump not found on PATH - add PostgreSQL bin directory"
    exit 1
  }
} else {
  $pgDumpPath = $pgDump.Source
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$file = Join-Path $OutDir "student_followup_$stamp.dump"

# Prisma appends ?schema=public which pg_dump rejects - strip the query
$conn = $env:DATABASE_URL -replace '\?.*$', ''

& $pgDumpPath --format=custom --compress=6 --file="$file" "$conn"
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed ($LASTEXITCODE)"; exit $LASTEXITCODE }

$size = [math]::Round((Get-Item $file).Length / 1KB, 1)
Write-Host "Backup written: $file ($size KB)"

# Keep only the newest 30 backups
Get-ChildItem $OutDir -Filter "student_followup_*.dump" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 |
  Remove-Item -Force

# Restore when needed:
#   pg_restore --clean --if-exists -d "<DATABASE_URL>" <file.dump>
