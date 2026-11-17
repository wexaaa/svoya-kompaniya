param([switch]$Remove,[int]$Port=3100)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskNode = Join-Path $taskRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $taskNode)) { $taskNode = (Get-Command node.exe -ErrorAction Stop).Source }
$taskStatus = Join-Path $taskRoot 'data\radmin-firewall.json'
New-Item -ItemType Directory -Path (Join-Path $taskRoot 'data') -Force | Out-Null
try {
  $taskPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $taskArguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Port ' + $Port
    if ($Remove) { $taskArguments += ' -Remove' }
    $taskChild = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList $taskArguments -PassThru -Wait
    exit $taskChild.ExitCode
  }
  if ($Port -lt 1 -or $Port -gt 65535) { throw 'Invalid port' }
  $taskHash = [Security.Cryptography.SHA256]::Create()
  $taskDigest = ([BitConverter]::ToString($taskHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskNode.ToLowerInvariant())))).Replace('-','').Substring(0,12)
  $taskRuleName = 'SvoyaKompaniya-Radmin-' + $taskDigest + '-' + $Port
  $taskExisting = Get-NetFirewallRule -Name $taskRuleName -ErrorAction SilentlyContinue
  if ($Remove) {
    if ($taskExisting) { Remove-NetFirewallRule -Name $taskRuleName }
    @{ok=$true;removed=$true;rule=$taskRuleName} | ConvertTo-Json | Set-Content -LiteralPath $taskStatus -Encoding UTF8
    exit 0
  }
  if (-not (Test-Path -LiteralPath $taskNode)) { throw 'Node.js not found' }
  $taskAdapters = @(Get-NetAdapter | Where-Object { $_.Name -match 'Radmin' -or $_.InterfaceDescription -match 'Radmin' })
  if ($taskAdapters.Count -ne 1) { throw 'Enable Radmin VPN and retry' }
  if ($taskExisting) { Remove-NetFirewallRule -Name $taskRuleName }
  New-NetFirewallRule -Name $taskRuleName -DisplayName 'Svoya Kompaniya - Radmin VPN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program $taskNode -InterfaceAlias $taskAdapters[0].Name -RemoteAddress '26.0.0.0/8' -Profile Any -Enabled True | Out-Null
  @{ok=$true;removed=$false;rule=$taskRuleName;port=$Port;interface=$taskAdapters[0].Name} | ConvertTo-Json | Set-Content -LiteralPath $taskStatus -Encoding UTF8
} catch {
  @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $taskStatus -Encoding UTF8
  Write-Error $_.Exception.Message
  exit 1
}
