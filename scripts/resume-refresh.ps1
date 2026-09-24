# Re-enables the Naukri automation that pause-refresh.ps1 switched off.
# Also triggers an immediate run so you can confirm it is back live
# (it is a safe no-op if nothing is due yet).

# Enabling the scheduled task requires elevation, so relaunch as admin if needed.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$ErrorActionPreference = 'Stop'

$taskNames = @('NaukriProfileRefresh', 'NaukriJobScout')

foreach ($taskName in $taskNames) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Enable-ScheduledTask -TaskName $taskName | Out-Null
        Write-Host "Scheduled task '$taskName' enabled."
        Start-ScheduledTask -TaskName $taskName
        Write-Host 'Triggered an immediate run (safe no-op if nothing is due).'
    } else {
        Write-Host "Scheduled task '$taskName' not found. Did it get deleted?"
    }
}