param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination,
  [Parameter(Mandatory=$true)][int]$ExpectedFiles,
  [Parameter(Mandatory=$true)][long]$ExpectedBytes
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
if (-not ('MimirLongPath' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'long-path.cs') }
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
if (Test-Path -LiteralPath $root) {
  if (@(Get-ChildItem -LiteralPath $root -Force).Count -gt 0) { throw 'Extraction destination must be empty.' }
}
[IO.Directory]::CreateDirectory($root) | Out-Null
$archiveStream = [MimirLongPath]::Open([IO.Path]::GetFullPath($Archive), $false)
$zip = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Read, $false)
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$count = 0
$total = [long]0
try {
  # Validate the entire central directory before writing any archive entry.
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName
    if (-not $name.StartsWith('runtime/', [StringComparison]::Ordinal) -or $name.Contains('\') -or $name -match '[<>:"|?*\x00-\x1f]') { throw 'Unexpected archive path.' }
    $components = $name.TrimEnd('/').Split('/')
    foreach ($part in $components) {
      if (-not $part -or $part.Length -gt 255 -or $part -eq '.' -or $part -eq '..' -or $part.EndsWith('.') -or $part.EndsWith(' ') -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') { throw 'Unsafe archive path component.' }
    }
    # Components were validated above: concatenate instead of legacy GetFullPath,
    # which itself rejects valid paths over MAX_PATH on older Windows setups.
    $target = $root + $name.Replace('/','\')
    if (-not $target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not $seen.Add($target)) { throw 'Duplicate or escaping archive path.' }
    if ((($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Archive symbolic links are not supported.' }
    if (-not $name.EndsWith('/')) { $count++; $total += $entry.Length }
    if ($count -gt $ExpectedFiles -or $total -gt $ExpectedBytes) { throw 'Archive exceeds its size manifest.' }
  }
  if ($count -ne $ExpectedFiles -or $total -ne $ExpectedBytes) { throw 'Archive size manifest mismatch.' }
  $written = 0
  foreach ($entry in $zip.Entries) {
    $target = $root + $entry.FullName.Replace('/','\')
    if ($entry.FullName.EndsWith('/')) { [MimirLongPath]::EnsureDirectory($target.TrimEnd('\')); continue }
    [MimirLongPath]::EnsureDirectory($target.Substring(0,$target.LastIndexOf('\')))
    $source = $entry.Open()
    try {
      $output = [MimirLongPath]::Open($target, $true)
      try {
        $source.CopyTo($output)
        if ($output.Length -ne $entry.Length) { throw 'Extracted file size mismatch.' }
      } finally { $output.Dispose() }
    } finally { $source.Dispose() }
    $written++
    if ($written % 10000 -eq 0) { Write-Output ('Extracted ' + $written + ' files') }
  }
} finally { $zip.Dispose() }
