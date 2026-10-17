param([string]$BaselineArchive, [switch]$RepairRuntime, [switch]$RebuildClient)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $workspacePath
$nodePath = Join-Path $workspacePath 'runtime\system\node\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
  & (Join-Path $PSScriptRoot 'restore-runtime.ps1')
}
$verifyArguments = @((Join-Path $PSScriptRoot 'verify-runtime.mjs'))
if ($BaselineArchive) { $verifyArguments += @('--baseline', [IO.Path]::GetFullPath($BaselineArchive)) }
if ($RepairRuntime) { $verifyArguments += '--repair' }
& $nodePath @verifyArguments
if ($LASTEXITCODE -ne 0) { throw 'Runtime verification failed.' }
if ($RebuildClient) {
  & $nodePath (Join-Path $PSScriptRoot 'build-growth.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Growth build failed.' }
}
& $nodePath (Join-Path $PSScriptRoot 'install-growth.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Growth installation failed.' }
Write-Output 'MIMIR is ready. Run Start MIMIR.cmd to open it.'
