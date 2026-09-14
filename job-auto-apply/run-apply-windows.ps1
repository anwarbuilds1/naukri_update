# Windows wrapper for the job-auto-apply module.
# Makes sure the dedicated Naukri Chrome (CDP on 127.0.0.1:9222) is running,
# then runs node naukri-apply.js. Passes through CLI args (e.g. --dry-run).
# Safe no-op pattern copied from run-refresh-windows.ps1.

$ErrorActionPreference = 'Continue'

$repoDir  = Split-Path -Parent $PSScriptRoot
$modDir   = $PSScriptRoot
$nodeBin  = (Get-Command node.exe -ErrorAction Stop).Source
$cdpUrl   = 'http://127.0.0.1:9222/json/version'
$runnerLog = Join-Path $modDir 'logs'
if (-not (Test-Path -LiteralPath $runnerLog)) { New-Item -ItemType Directory -Force -Path $runnerLog | Out-Null }
$runnerLogFile = Join-Path $runnerLog 'runner-apply.log'

function Write-Log {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    ("$stamp $Message") | Tee-Object -FilePath $runnerLogFile -Append
}

function Test-CdpReady {
    try {
        $null = Invoke-WebRequest -Uri $cdpUrl -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Start-DedicatedChrome {
    $candidates = @(
        (Join-Path ${env:ProgramFiles}     'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:LocalAppData}      'Google\Chrome\Application\chrome.exe')
    )
    $exe = $null
    foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { $exe = $c; break } }
    if (-not $exe) { Write-Log 'ERROR: Google Chrome not found.'; return $false }

    $profileDir = Join-Path $repoDir '.naukri-chrome-profile'
    $lockFile = Join-Path $profileDir 'SingletonLock'
    if (-not (Test-Path -LiteralPath $lockFile)) {
        Write-Log "Starting dedicated Chrome: $exe"
        Start-Process -FilePath $exe -ArgumentList @(
            '--remote-debugging-address=127.0.0.1',
            '--remote-debugging-port=9222',
            "--user-data-dir=`"$profileDir`"",
            'https://www.naukri.com/mnjuser/profile'
        )
    } else {
        Write-Log 'Profile lock present; waiting for CDP instead of relaunching.'
    }
    return $true
}

Write-Log '=== RUN START ==='

if (-not (Test-CdpReady)) {
    Write-Log 'CDP unavailable; starting the dedicated Naukri Chrome.'
    if (-not (Start-DedicatedChrome)) { exit 1 }
    $ready = $false
    for ($i = 1; $i -le 45; $i++) {
        Start-Sleep -Seconds 1
        if (Test-CdpReady) { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Log 'ERROR: Chrome did not expose CDP on 127.0.0.1:9222 within 45 seconds.'
        exit 1
    }
    Write-Log 'Dedicated Chrome CDP is ready.'
} else {
    Write-Log 'Dedicated Chrome CDP is already available.'
}

$tmpOut = Join-Path $env:TEMP ("naukri-apply-" + [guid]::NewGuid().ToString('N') + '.log')
& $nodeBin (Join-Path $modDir 'naukri-apply.js') @args > $tmpOut 2>&1
$code = $LASTEXITCODE
if (Test-Path -LiteralPath $tmpOut) {
    $null = Get-Content -LiteralPath $tmpOut | Tee-Object -FilePath $runnerLogFile -Append
    Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
}
Write-Log "Apply bot exit code: $code"
exit $code