$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot ('shortcut-test-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$desktop = Join-Path $root ('Desktop ' + [char]0x4e2d + [char]0x6587)
$installBase = Join-Path $root 'app'
$runtime = Join-Path $installBase 'versions\b2-test\runtime'
$data = Join-Path $installBase 'data\0.12.10'
foreach ($directory in @($desktop,$runtime,$data)) { [IO.Directory]::CreateDirectory($directory) | Out-Null }
$exe = Join-Path $runtime 'Mimir.exe'
$icon = Join-Path $runtime 'Mimir.ico'
[IO.File]::WriteAllText($exe,'fixture')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'package\lib\mimir.ico') -Destination $icon
$script = Join-Path $PSScriptRoot 'package\lib\shortcut.ps1'
& $script -Executable $exe -DataHome $data -Icon $icon -InstallBase $installBase -Desktop $desktop
$shell = New-Object -ComObject WScript.Shell
$linkPath = Join-Path $desktop 'MIMIR.lnk'
$link = $shell.CreateShortcut($linkPath)
if ($link.TargetPath -ne $exe -or $link.Arguments -ne ('--data-home "' + $data + '"') -or $link.IconLocation -ne ($icon + ',0') -or $link.WorkingDirectory -ne $runtime) { throw 'Shortcut fields did not match.' }
# Re-running may update only our managed shortcut.
& $script -Executable $exe -DataHome $data -Icon $icon -InstallBase $installBase -Desktop $desktop
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = Join-Path $env:SystemRoot 'System32\notepad.exe'
$link.Save()
$before = [IO.File]::ReadAllBytes($linkPath)
$rejected = $false
try { & $script -Executable $exe -DataHome $data -Icon $icon -InstallBase $installBase -Desktop $desktop } catch { $rejected = $true }
if (-not $rejected -or [Convert]::ToBase64String($before) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($linkPath))) { throw 'An unrelated shortcut was overwritten.' }
Write-Output 'Desktop shortcut passed: real .lnk target, data argument, tray icon, working directory, redirected desktop and unrelated shortcut preservation.'
