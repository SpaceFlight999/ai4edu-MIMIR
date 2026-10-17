param([string]$DataHome = (Join-Path $PSScriptRoot '..\data\student-1'))
$ErrorActionPreference = 'Stop'
$runtimePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\runtime'))
$dataPath = [IO.Path]::GetFullPath($DataHome)
if (-not (Test-Path -LiteralPath (Join-Path $runtimePath 'system\app\app.mjs'))) { throw 'Please restore the runtime first.' }
if (-not (Test-Path -LiteralPath (Join-Path $runtimePath 'system\engine\node_modules\@mimir\growth-layer\lib\client.js'))) { throw 'Please run Install MIMIR.cmd first.' }
& (Join-Path $runtimePath 'Mimir.exe') --data-home $dataPath
