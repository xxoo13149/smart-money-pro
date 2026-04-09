param(
  [int]$StartPort = 3000,
  [switch]$NoBrowser
)

function Get-FreePort {
  param([int]$Port)

  while ($true) {
    $activePorts = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
      Select-Object -ExpandProperty Port

    if ($activePorts -notcontains $Port) {
      return $Port
    } else {
      $Port++
    }
  }
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = Get-FreePort -Port $StartPort
$url = "http://localhost:$port"

$command = "Set-Location '$projectRoot'; npm.cmd run dev -w apps/web -- -p $port"
$process = Start-Process powershell -PassThru -ArgumentList "-NoExit", "-Command", $command

Write-Host "Dev server starting on $url"
Write-Host "Process ID: $($process.Id)"

if (-not $NoBrowser) {
  $opened = $false

  for ($i = 0; $i -lt 60 -and -not $opened; $i++) {
    Start-Sleep -Seconds 1

    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200) {
        Start-Process $url
        $opened = $true
      }
    } catch {
    }
  }

  if (-not $opened) {
    Start-Process $url
  }
}
