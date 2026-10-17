param()
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = [IO.Path]::GetFullPath((Join-Path $workspacePath '.test-data'))
$growthVersion = (Get-Content -LiteralPath (Join-Path $workspacePath 'growth\package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
foreach ($kind in @('daily-experience', 'robotics-topic', 'dsh-agent')) {
  $reportPath = Join-Path $workspacePath ('artifacts\' + $kind + '-smoke-' + $growthVersion + '.json')
  $report = Get-Content -LiteralPath $reportPath -Encoding UTF8 -Raw | ConvertFrom-Json
  if (-not $report.passed) { throw ('Keep failed test data for diagnosis: ' + $kind) }
  $removed = @()
  foreach ($directory in (Get-ChildItem -LiteralPath $testRoot -Directory)) {
    if ($directory.Name -notmatch ('^' + [regex]::Escape($kind) + '-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) { continue }
    $targetPath = [IO.Path]::GetFullPath($directory.FullName)
    if (-not $targetPath.StartsWith($testRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup target escapes synthetic test root.' }
    if (Test-Path -LiteralPath (Join-Path $targetPath 'instance.json')) { throw 'Synthetic instance may still be running; cleanup stopped.' }
    if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cleanup refuses reparse points.' }
    if (Get-ChildItem -LiteralPath $targetPath -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) { throw 'Cleanup refuses nested reparse points.' }
    Remove-Item -LiteralPath $targetPath -Recurse -Force
    $removed += $targetPath
  }
  $report | Add-Member -NotePropertyName syntheticDataRemoved -NotePropertyValue (-not (Test-Path -LiteralPath $report.syntheticHome)) -Force
  [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
  $cleanup = @{ passed = $report.syntheticDataRemoved; at = [DateTime]::UtcNow.ToString('o'); growthVersion = $growthVersion; removed = $removed; preserved = @('personal learner data', 'previous deliveries', 'original runtime', 'unrelated test directories') }
  $cleanupPath = Join-Path $workspacePath ('artifacts\' + $kind + '-cleanup-' + $growthVersion + '.json')
  [IO.File]::WriteAllText($cleanupPath, ($cleanup | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
  Write-Output ($kind + ': removed ' + $removed.Count + ' isolated test directories.')
}
