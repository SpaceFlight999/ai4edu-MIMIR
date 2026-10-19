param([string]$Project = 'D:\Xiaorui Wang\AI+竞赛资料\v0.12.10')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$version = '0.12.11-beta.2'
$output = Join-Path $PSScriptRoot 'release'
[IO.Directory]::CreateDirectory($output) | Out-Null
$archiveName = 'MIMIR-' + $version + '-Windows-x64.zip'
$archive = Join-Path $output $archiveName
if (Test-Path -LiteralPath $archive) { throw 'Refusing to overwrite an existing beta2 release ZIP.' }
$source = Join-Path $Project 'npm-distribution\release\MIMIR-0.12.10-Windows-x64.zip'
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sourceHash -ne '4fb1588e98f989ee4f36aa7260d39bf8f98f9d110b5af186823a9fc1091bfcef') { throw 'Published base archive hash mismatch.' }
Write-Output 'Verified original published runtime archive; preparing beta2 document and icon overrides.'
$utf8 = New-Object Text.UTF8Encoding($false)
$guide = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'user-guide-original.txt'),$utf8)
if (-not $guide.Contains('0.12.0-beta.2')) { throw 'Expected the edited beta2 user guide.' }
$guide = $guide.Replace('0.12.0-beta.2',$version)
$guide = $guide.Replace('资料保存在 %LOCALAPPDATA%\Mimir Beta，与解压目录分开。','通过 npx 安装时，资料保存在 %LOCALAPPDATA%\MIMIR-Evaluation\data\0.12.10。直接解压 ZIP 并运行 Mimir.exe 时，资料默认保存在 %LOCALAPPDATA%\Mimir Beta。资料均与程序目录分开。')
$guide = $guide.Replace('更新时退出软件，将新包解压到新目录，启动新的 Mimir.exe。','更新前请从托盘退出软件。npx 安装的用户运行新版安装命令，并使用自动创建的桌面快捷方式启动；资料目录保持不变。直接解压 ZIP 的用户将新包解压到新目录，再启动新的 Mimir.exe。')
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '使用说明.txt'),$guide,$utf8)
[IO.File]::Copy($source,$archive,$false)
$zip = [IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Update)
try {
  $productEntry = $zip.GetEntry('runtime/system/product.json')
  $reader = New-Object IO.StreamReader($productEntry.Open(),$utf8)
  try { $product = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  $product.version = $version
  $productBytes = $utf8.GetBytes(($product | ConvertTo-Json) + "`n")
  $overrides = @{
    'runtime/使用说明.txt' = $utf8.GetBytes($guide)
    'runtime/Mimir.ico' = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'package\lib\mimir.ico'))
    'runtime/system/product.json' = $productBytes
  }
  foreach ($name in $overrides.Keys) {
    $previous = $zip.GetEntry($name)
    if ($null -ne $previous) { $previous.Delete() }
    $entry = $zip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()
    try { $bytes = $overrides[$name]; $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
  }
} finally { $zip.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
  $files = 0; $total = [long]0
  foreach ($entry in $zip.Entries) { if (-not $entry.FullName.EndsWith('/')) { $files++; $total += $entry.Length } }
} finally { $zip.Dispose() }
if ($files -ne 64115) { throw 'Unexpected beta2 runtime file count.' }
$release = [ordered]@{
  version = $version
  runtimeVersion = '0.12.10'
  url = 'https://github.com/SpaceFlight999/ai4edu-MIMIR/releases/download/v' + $version + '/' + $archiveName
  sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  bytes = (Get-Item -LiteralPath $archive).Length
  files = $files
  unpackedBytes = $total
}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'package\release.json'),($release | ConvertTo-Json) + "`n",$utf8)
[IO.File]::WriteAllText(($archive + '.sha256'),$release.sha256 + '  ' + $archiveName + "`n",$utf8)
$report = [ordered]@{ release=$release; sourceSha256=$sourceHash; overrides=@($overrides.Keys); personalDataIncluded=$false; builtAt=[DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText((Join-Path $output 'build-report.json'),($report | ConvertTo-Json -Depth 6),$utf8)
Write-Output ($release | ConvertTo-Json)
