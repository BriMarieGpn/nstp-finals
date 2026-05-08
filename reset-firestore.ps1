param(
    [string]$ProjectId = '',
    [switch]$DryRun,
    [switch]$Force
)

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Error "Firebase CLI not found. Install it and sign in with 'firebase login' first."
    exit 1
}

$collections = @(
    'programs',
    'programs_empty',
    'volunteers',
    'certificates',
    'skills',
    'admin',
    'admin_logs'
    # Preserve greencommunity-related collections by not listing them here.
)

Write-Host "The following Firestore collections will be deleted:" -ForegroundColor Yellow
Write-Host "This reset also clears volunteer/dashboard state so deleted people no longer remain visible." -ForegroundColor Cyan
$collections | ForEach-Object { Write-Host " - $_" }
Write-Host "greencommunity collections will be preserved." -ForegroundColor Green
Write-Host "This script does not delete Firebase Authentication accounts such as admin@test.local or user@test.local." -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "\nDry run mode enabled. No collections will be deleted." -ForegroundColor Cyan
}

if (-not $Force -and -not $DryRun) {
    $confirm = Read-Host "Type YES to confirm deletion"
    if ($confirm -ne 'YES') {
        Write-Warning "Operation cancelled. No collections were deleted."
        exit 0
    }
}

$firebasePath = (Get-Command firebase -ErrorAction Stop).Source

foreach ($collection in $collections) {
    $args = @('firestore:delete', $collection, '--recursive', '-f')
    if ($ProjectId) { $args += @('--project', $ProjectId) }

    Write-Host "\nPreparing to delete collection: $collection" -ForegroundColor Yellow
    if ($DryRun) {
        Write-Host "firebase $($args -join ' ')" -ForegroundColor Cyan
        continue
    }

    & $firebasePath @args
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to delete collection $collection. Exit code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}

if ($DryRun) {
    Write-Host "\nDry run complete. No changes were made." -ForegroundColor Green
} else {
    Write-Host "\nFirestore reset complete. greencommunity collections are preserved." -ForegroundColor Green
}