param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [Parameter(Mandatory=$true)][string]$DataHome,
  [Parameter(Mandatory=$true)][string]$Icon,
  [Parameter(Mandatory=$true)][string]$InstallBase,
  [string]$Desktop
)
$ErrorActionPreference = 'Stop'
foreach ($file in @($Executable,$Icon)) {
  if (-not [IO.File]::Exists($file)) { throw ('Shortcut file is missing: ' + $file) }
}
# WSH resolves the user's redirected/OneDrive desktop as well as the default.
$shell = New-Object -ComObject WScript.Shell
if (-not $Desktop) { $Desktop = $shell.SpecialFolders.Item('Desktop') }
if (-not $Desktop -or -not [IO.Directory]::Exists($Desktop)) { throw 'Windows desktop folder is unavailable.' }
$path = Join-Path $Desktop 'MIMIR.lnk'
$link = $shell.CreateShortcut($path)
if ([IO.File]::Exists($path)) {
  $managedPrefix = [IO.Path]::GetFullPath((Join-Path $InstallBase 'versions')).TrimEnd('\') + '\'
  $oldTarget = $link.TargetPath
  if (-not $oldTarget.StartsWith($managedPrefix,[StringComparison]::OrdinalIgnoreCase) -or -not $oldTarget.EndsWith('\runtime\Mimir.exe',[StringComparison]::OrdinalIgnoreCase)) {
    throw 'An unrelated MIMIR.lnk already exists on the desktop. Rename it and run this installer again.'
  }
}
$link.TargetPath = [IO.Path]::GetFullPath($Executable)
$link.Arguments = '--data-home "' + $DataHome + '"'
$link.WorkingDirectory = [IO.Path]::GetDirectoryName($Executable)
$link.IconLocation = [IO.Path]::GetFullPath($Icon) + ',0'
$link.Description = 'MIMIR'
$link.WindowStyle = 1
$link.Save()
Write-Output ('Desktop shortcut: ' + $path)
