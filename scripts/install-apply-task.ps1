# Installs the Windows Scheduled Task that auto-runs the Naukri job auto-apply
# module (job-auto-apply\run-apply-windows.ps1 -> naukri-apply.js).
# The task runs daily on a clock-based trigger and repeats every 3 hours
# indefinitely (survives sleep/wake and reboots). Each run searches the
# configured keywords, scores JDs against your SKILLS, applies on Naukri where
# possible, and appends every decision to job-auto-apply\applications-report.csv.
# Run as the normal logged-in user (elevation is requested automatically).

$ErrorActionPreference = 'Stop'

# Task registration requires elevation. If we are not admin, relaunch elevated.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$taskName = 'NaukriJobApply'
$repoDir  = Split-Path -Parent $PSScriptRoot
$runner   = Join-Path $repoDir 'job-auto-apply\run-apply-windows.ps1'

if (-not (Test-Path -LiteralPath $runner)) {
    Write-Error "Runner not found: $runner"
    exit 1
}

$userId = "$env:USERDOMAIN\$env:USERNAME"
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
$actionArgsXml = $actionArgs.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')

# Clock-based start boundary (local time) so repetition keeps working after
# sleep/wake — same approach as the refresh task.
$startBoundary = (Get-Date).ToString('yyyy-MM-dd') + 'T00:00:00'

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Auto-apply to matching Naukri jobs and log every decision to applications-report.csv.</Description>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <StartBoundary>$startBoundary</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT3H</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$userId</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>$actionArgsXml</Arguments>
    </Exec>
  </Actions>
</Task>
"@

$xmlPath = Join-Path $env:TEMP "$taskName-task.xml"
# UTF-16 LE with BOM is what Register-ScheduledTask expects.
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)

try {
    Register-ScheduledTask -TaskName $taskName -Xml (Get-Content -LiteralPath $xmlPath -Raw) -Force | Out-Null
} catch {
    Write-Host "ERROR: could not create the task. If access was denied, run this script from an elevated PowerShell (Run as Administrator)." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
} finally {
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Scheduled task '$taskName' installed." -ForegroundColor Green
Write-Host 'Runs every 3 hours around the clock (survives sleep/wake and reboots).'
Write-Host 'Real applications are submitted; every decision is logged to job-auto-apply\applications-report.csv.'
Write-Host ''
Write-Host 'Useful commands:'
Write-Host ("  View task:      Get-ScheduledTask -TaskName {0}" -f $taskName)
Write-Host ("  Run task now:   Start-ScheduledTask -TaskName {0}" -f $taskName)
Write-Host ("  Disable task:   Disable-ScheduledTask -TaskName {0}" -f $taskName)
Write-Host ("  Delete task:    SchTasks /Delete /TN {0} /F" -f $taskName)