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

    $localStorageResetFile = Join-Path $PSScriptRoot 'reset-localstorage.html'
    $localStorageKeys = @(
        'itanimUsers',
        'itanimPrograms',
        'itanimCerts',
        'itanimSkills',
        'itanimRestrictions',
        'itanimBadges',
        'itanimNotifications',
        'itanimAdminLogs',
        'itanimLocalPrograms',
        'users',
        'programs',
        'badges',
        'certifications',
        'notifications',
        'growsauyouRoleCache',
        'PROFILE_CACHE_KEY',
        'activeTab'
    )

    $keysJson = '[' + (($localStorageKeys | ForEach-Object { "'$_'" }) -join ', ') + ']' 

    $htmlContent = @"
<!DOCTYPE html>
<html lang='en'>
<head>
    <meta charset='utf-8'>
    <title>GrowSauYOU Local Cache Reset</title>
    <style>
        body { font-family: Segoe UI, sans-serif; background: #f7f7f7; color: #333; padding: 30px; }
        button { padding: 12px 22px; border: none; border-radius: 8px; background: #4b7f38; color: #fff; cursor: pointer; font-size: 1rem; }
        .status { margin-top: 20px; }
    </style>
</head>
<body>
    <h1>GrowSauYOU Local Cache Reset</h1>
    <p>This helper page will clear the browser local storage keys used by the i-tanim admin and volunteer dashboard.</p>
    <button id='resetBtn'>Clear local cache now</button>
    <div class='status' id='status'></div>
    <script>
        const keys = $keysJson;
        document.getElementById('resetBtn').addEventListener('click', () => {
            keys.forEach(key => localStorage.removeItem(key));
            document.getElementById('status').textContent = 'Cleared localStorage keys. Reload the app pages now.';
        });
    </script>
</body>
</html>
"@

    Set-Content -Path $localStorageResetFile -Value $htmlContent -Encoding UTF8
    Write-Host "A local cache reset page was created at: $localStorageResetFile" -ForegroundColor Green
    Write-Host "Opening your default browser so you can clear localStorage for the app..." -ForegroundColor Cyan
    Start-Process $localStorageResetFile
}
