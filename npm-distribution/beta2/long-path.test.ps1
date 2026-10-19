$ErrorActionPreference = 'Stop'
# Reproduce older Windows PowerShell/.NET path handling without changing Windows settings.
[AppContext]::SetSwitch('Switch.System.IO.UseLegacyPathHandling', $true)
[AppContext]::SetSwitch('Switch.System.IO.BlockLongPaths', $true)
# PowerShell may have cached these switches before this script starts. Set only
# this isolated regression process's cached values; never alter machine policy.
$switchType = [IO.File].Assembly.GetType('System.AppContextSwitches')
foreach ($field in @('_useLegacyPathHandling','_blockLongPaths')) {
  $switchType.GetField($field,[Reflection.BindingFlags]'Static,NonPublic').SetValue($null,1)
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$testRoot = Join-Path $PSScriptRoot ('long-path-test-' + [guid]::NewGuid().ToString('N').Substring(0,8))
[IO.Directory]::CreateDirectory($testRoot) | Out-Null
$archive = Join-Path $testRoot 'fixture.zip'
$destination = Join-Path $testRoot 'stage'
$relative = 'runtime/system/engine/node_modules/@aws-sdk/client-bedrock-runtime/dist-types/ts3.4/commands/InvokeModelWithBidirectionalStreamCommand.d.ts'
$zip = [IO.Compression.ZipFile]::Open($archive, [IO.Compression.ZipArchiveMode]::Create)
try {
  $entry = $zip.CreateEntry($relative)
  $stream = $entry.Open()
  try { $stream.WriteByte(65) } finally { $stream.Dispose() }
} finally { $zip.Dispose() }
$target = $destination + '\' + $relative.Replace('/','\')
if ($target.Length -le 260) { throw 'Regression fixture did not exceed MAX_PATH.' }
& (Join-Path $PSScriptRoot 'package\lib\extract.ps1') -Archive $archive -Destination $destination -ExpectedFiles 1 -ExpectedBytes 1
$verifiedStream = [MimirLongPath]::Open($target,$false)
try { if ($verifiedStream.Length -ne 1 -or $verifiedStream.ReadByte() -ne 65) { throw 'Long-path extracted content mismatch.' } } finally { $verifiedStream.Dispose() }
Write-Output ('Long-path regression passed in Windows PowerShell ' + $PSVersionTable.PSVersion + ': ' + $target.Length + ' characters, legacy path handling enabled.')
