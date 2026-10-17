param(
  [string]$Archive = (Join-Path $PSScriptRoot '..\Mimir-0.12.0-beta.1-Windows-x64.zip'),
  [string]$Destination = (Join-Path $PSScriptRoot '..\runtime')
)
$ErrorActionPreference = 'Stop'
$archivePath = [IO.Path]::GetFullPath($Archive)
$runtimePath = [IO.Path]::GetFullPath($Destination)
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $runtimePath.StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Runtime destination must be inside this workspace.'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Directory]::CreateDirectory($runtimePath) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
$restored = 0
$unchanged = 0
try {
  foreach ($entry in $zip.Entries) {
    $prefix = 'Mimir-0.12.0-beta.1-Windows-x64/'
    if (-not $entry.FullName.StartsWith($prefix, [StringComparison]::Ordinal)) { throw 'Unexpected archive root.' }
    $relative = $entry.FullName.Substring($prefix.Length)
    if (-not $relative) { continue }
    $target = [IO.Path]::GetFullPath((Join-Path $runtimePath $relative))
    if (-not $target.StartsWith($runtimePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw ('Archive path escapes runtime: ' + $relative)
    }
    if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
    if ([IO.File]::Exists($target)) {
      if ((Get-Item -LiteralPath $target).Length -ne $entry.Length) { throw ('Existing file differs: ' + $relative) }
      $unchanged++
      continue
    }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    $inputStream = $entry.Open()
    $outputStream = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { if ($entry.Length -gt 0) { $inputStream.CopyTo($outputStream) } } finally { $outputStream.Dispose(); $inputStream.Dispose() }
    $restored++
    if ($restored % 5000 -eq 0) { Write-Output ('Restored ' + $restored + ' files') }
  }
} finally { $zip.Dispose() }
$inventory = Get-Content -LiteralPath (Join-Path $runtimePath 'system\inventory.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$verified = 0
foreach ($record in $inventory.checksums) {
  $target = Join-Path $runtimePath $record.path
  if (-not [IO.File]::Exists($target)) { throw ('Missing file: ' + $record.path) }
  if ((Get-Item -LiteralPath $target).Length -ne $record.bytes) { throw ('Wrong file size: ' + $record.path) }
  $verified++
}
Write-Output ("Runtime ready: $restored restored, $unchanged existing, $verified manifest entries verified.")
