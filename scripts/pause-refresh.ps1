# Pauses the Naukri automation for as long as you want (e.g. office days):
#  - disables the scheduled task (no more auto-refresh, no Chrome being opened)
#  - closes the dedicated Naukri Chrome window if it is open
# Your login session stays saved in .naukri-chrome-profile, so nothing is lost.
# Turn it back on with: .\scripts\resume-refresh.ps1

# Disabling the scheduled task requires elevation, so relaunch as admin if needed.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$ErrorActionPreference = 'Stop'

$taskNames = @('NaukriProfileRefresh', 'NaukriJobApply')

foreach ($taskName in $taskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Disable-ScheduledTask -TaskName $taskName | Out-Null
        Write-Host "Scheduled task '$taskName' disabled. No more automatic runs."
    } else {
        Write-Host "Scheduled task '$taskName' not found; nothing to disable."
    }
}

$closed = 0
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*naukri-chrome-profile*' } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $closed++
    }

if ($closed -gt 0) {
    Write-Host "Closed $closed dedicated Naukri Chrome window(s)."
} else {
    Write-Host 'No dedicated Naukri Chrome window was open.'
}

Write-Host 'Resume anytime with:  .\scripts\resume-refresh.ps1'