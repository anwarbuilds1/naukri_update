# Windows Launcher for Dedicated Naukri Chrome
# Starts Google Chrome with CDP bound only to 127.0.0.1:9222 and a dedicated profile.

$script_dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo_dir = Split-Path -Parent $script_dir
$profile_dir = Join-Path $repo_dir ".naukri-chrome-profile"
$profile_url = "https://www.naukri.com/mnjuser/profile"

if ($args -contains "--help") {
    Write-Host "Usage: .\start-naukri-chrome.ps1"
    Write-Host "Starts dedicated Chrome with CDP bound to 127.0.0.1:9222."
    exit 0
}

# Check if profile directory is already in use (SingletonLock exists)
$lockFile = Join-Path $profile_dir "SingletonLock"
if (Test-Path $lockFile) {
    Write-Warning "The dedicated Naukri Chrome profile is already in use. If Chrome is not running, delete the SingletonLock file in .naukri-chrome-profile/ and retry."
    exit 1
}

# Common paths where Google Chrome is installed on Windows
$chromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
)

$chrome = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chrome = $path
        break
    }
}

if (-not $chrome) {
    Write-Error "Google Chrome was not found. Please install Google Chrome or add it to your PATH."
    exit 1
}

if (-not (Test-Path $profile_dir)) {
    New-Item -ItemType Directory -Force -Path $profile_dir | Out-Null
}

Write-Host "Starting dedicated Chrome..."
Start-Process -FilePath $chrome -ArgumentList "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9222", "--user-data-dir=`"$profile_dir`"", "`"$profile_url`""
