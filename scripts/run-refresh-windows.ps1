# Windows auto-runner for the Naukri profile refresh.
# Mirrors the Linux naukri-refresh-runner.sh behaviour: it only executes tasks
# that are actually due (via scripts/scheduler.js), starts the dedicated Chrome
# automatically when its CDP endpoint is down, and updates the state file after
# a successful run. Exits instantly (cheap) when nothing is due.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$repoDir   = Split-Path -Parent $PSScriptRoot
$nodeBin   = (Get-Command node.exe -ErrorAction Stop).Source
$cdpUrl    = 'http://127.0.0.1:9222/json/version'
$runnerLog = Join-Path $repoDir 'naukri-windows-runner.log'
$chromeExe = $null

function Write-Log {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    ("$stamp $Message") | Tee-Object -FilePath $runnerLog -Append
}

function Test-CdpReady {
    try {
        $null = Invoke-WebRequest -Uri $cdpUrl -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

function Invoke-Node {
    param([string[]]$NodeArgs)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $null = & $nodeBin @NodeArgs 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previous
    return $code
}

function Invoke-NodeLogged {
    param([string[]]$NodeArgs)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $tmpOut = Join-Path $env:TEMP ("naukri-node-" + [guid]::NewGuid().ToString('N') + '.log')
    & $nodeBin @NodeArgs > $tmpOut 2>&1
    $code = $LASTEXITCODE
    if (Test-Path -LiteralPath $tmpOut) {
        $null = Get-Content -LiteralPath $tmpOut | Tee-Object -FilePath $runnerLog -Append
        Remove-Item -LiteralPath $tmpOut -Force -ErrorAction SilentlyContinue
    }
    $ErrorActionPreference = $previous
    return $code
}

function Find-Chrome {
    $candidates = @(
        (Join-Path ${env:ProgramFiles}     'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:LocalAppData}      'Google\Chrome\Application\chrome.exe')
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }
    return $null
}

function Start-DedicatedChrome {
    $script:chromeExe = Find-Chrome
    if (-not $script:chromeExe) {
        Write-Log 'ERROR: Google Chrome was not found.'
        return $false
    }

    $profileDir     = Join-Path $repoDir '.naukri-chrome-profile'
    $lockFile       = Join-Path $profileDir 'SingletonLock'
    $chromeRunning  = [bool](Get-Process chrome -ErrorAction SilentlyContinue)

    if (-not (Test-Path -LiteralPath $profileDir)) {
        New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    }

    if ((Test-Path -LiteralPath $lockFile) -and -not $chromeRunning) {
        Write-Log 'Stale SingletonLock found and no Chrome running; removing it.'
        Remove-Item -LiteralPath $lockFile -Force
    }

    if (Test-Path -LiteralPath $lockFile) {
        Write-Log 'Dedicated profile is already in use; waiting for CDP instead of relaunching.'
        return $true
    }

    Write-Log "Starting dedicated Chrome: $chromeExe"
    Start-Process -FilePath $chromeExe -ArgumentList @(
        '--remote-debugging-address=127.0.0.1',
        '--remote-debugging-port=9222',
        "--user-data-dir=`"$profileDir`"",
        'https://www.naukri.com/mnjuser/profile'
    )
    return $true
}

Write-Log '=== RUN START ==='

# 1) Validate scheduling configuration from .env
if ((Invoke-Node @((Join-Path $repoDir 'scripts\scheduler.js'), '--validate')) -ne 0) {
    Write-Log 'ERROR: scheduling configuration is invalid.'
    exit 1
}

# 2) Decide which tasks are actually due
$dueHeadline = ((Invoke-Node @((Join-Path $repoDir 'scripts\scheduler.js'), '--should-refresh')) -eq 0)
$dueResume   = ((Invoke-Node @((Join-Path $repoDir 'scripts\scheduler.js'), '--should-upload-resume')) -eq 0)

if (-not $dueHeadline -and -not $dueResume) {
    Write-Log 'No task is due; nothing to run.'
    exit 0
}
Write-Log "Tasks due: headline=$dueHeadline resume=$dueResume"

# 3) Make sure the dedicated Chrome with CDP is running (local, 127.0.0.1:9222)
if (Test-CdpReady) {
    Write-Log 'Dedicated Naukri Chrome CDP is already available.'
} else {
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
    Write-Log 'Dedicated Naukri Chrome CDP is ready.'
}

# 4) Run the due task(s)
if ($dueHeadline) {
    Write-Log 'Running Naukri headline refresh.'
    if ((Invoke-NodeLogged @((Join-Path $repoDir 'naukri-profile-refresh.js'), '--refresh-headline')) -ne 0) {
        Write-Log 'ERROR: headline refresh failed.'
        exit 1
    }
    $null = Invoke-Node @((Join-Path $repoDir 'scripts\scheduler.js'), '--update-refresh-time')
    Write-Log 'Naukri headline refresh completed.'
}

if ($dueResume) {
    Write-Log 'Running Naukri resume upload.'
    if ((Invoke-NodeLogged @((Join-Path $repoDir 'naukri-profile-refresh.js'), '--upload-resume')) -ne 0) {
        Write-Log 'ERROR: resume upload failed.'
        exit 1
    }
    $null = Invoke-Node @((Join-Path $repoDir 'scripts\scheduler.js'), '--update-resume-time')
    Write-Log 'Naukri resume upload completed.'
}

Write-Log 'RUN STATUS: SUCCESS'