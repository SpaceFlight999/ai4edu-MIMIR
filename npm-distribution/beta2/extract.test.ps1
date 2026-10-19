$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$root = Join-Path $PSScriptRoot ('extract-tests-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$unicodeName = 'runtime/' + [char]0x4e2d + [char]0x6587 + ' space.txt'
$cases = @(
  @{ Name='normal'; Entries=@($unicodeName); Pass=$true },
  @{ Name='traversal'; Entries=@('runtime/../outside.txt'); Pass=$false },
  @{ Name='case-duplicate'; Entries=@('runtime/A.txt','runtime/a.txt'); Pass=$false },
  @{ Name='alternate-stream'; Entries=@('runtime/file:stream'); Pass=$false },
  @{ Name='windows-device'; Entries=@('runtime/CON.txt'); Pass=$false },
  @{ Name='outside-root'; Entries=@('data/model.secret'); Pass=$false }
)
$results = @()
foreach ($case in $cases) {
  $archive = Join-Path $root ($case.Name + '.zip')
  $destination = Join-Path $root $case.Name
  if (Test-Path -LiteralPath $archive) { throw 'Test archive already exists.' }
  $zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($name in $case.Entries) {
      $entry = $zip.CreateEntry($name)
      $stream = $entry.Open()
      try { $stream.WriteByte(65) } finally { $stream.Dispose() }
    }
  } finally { $zip.Dispose() }
  $accepted = $true
  try {
    & (Join-Path $PSScriptRoot 'package\lib\extract.ps1') -Archive $archive -Destination $destination -ExpectedFiles $case.Entries.Count -ExpectedBytes $case.Entries.Count | Out-Null
  } catch { $accepted = $false }
  if ($accepted -ne $case.Pass) { throw ('Wrong extraction outcome: ' + $case.Name) }
  if (-not $case.Pass -and @(Get-ChildItem -LiteralPath $destination -Recurse -File -ErrorAction SilentlyContinue).Count -gt 0) { throw 'Unsafe extraction wrote a file before rejecting the archive.' }
  if ($case.Pass -and [IO.File]::ReadAllText((Join-Path $destination $unicodeName)) -ne 'A') { throw 'Normal extraction content mismatch.' }
  $results += @{ scenario=$case.Name; passed=$true }
}
$results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'results.json') -Encoding UTF8
Write-Output ('Passed ' + $results.Count + ' real ZIP extraction scenarios.')
