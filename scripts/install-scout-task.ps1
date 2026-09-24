# Installs the Windows Scheduled Task that regenerates the Naukri job
# openings report (job-scout\run-scout-windows.ps1 -> naukri-scout.js).
# Clock-based trigger, daily, repeating every 3 hours indefinitely.
# Run as the normal logged-in user (elevation is requested automatically).

$ErrorActionPreference = 'Stop'

# Task registration requires elevation. If we are not admin, relaunch elevated.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$taskName = 'NaukriJobScout'
$repoDir  = Split-Path -Parent $PSScriptRoot
$runner   = Join-Path $repoDir 'job-scout\run-scout-windows.ps1'

if (-not (Test-Path -LiteralPath $runner)) {
    Write-Error "Runner not found: $runner"
    exit 1
}

$userId = "$env:USERDOMAIN\$env:USERNAME"
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
$actionArgsXml = $actionArgs.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;')

$startBoundary = (Get-Date).ToString('yyyy-MM-dd') + 'T00:00:00'

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Regenerate the Naukri job openings report (bucketed, scored, Pune-preferred flagged).</Description>
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
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
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
Write-Host 'Regenerates job-scout\reports\job-openings-latest.json every 3 hours.'
Write-Host ''
Write-Host 'Useful commands:'
Write-Host ("  View task:      Get-ScheduledTask -TaskName {0}" -f $taskName)
Write-Host ("  Run task now:   Start-ScheduledTask -TaskName {0}" -f $taskName)
Write-Host ("  Disable task:   Disable-ScheduledTask -TaskName {0}" -f $taskName)
Write-Host ("  Delete task:    SchTasks /Delete /TN {0} /F" -f $taskName)