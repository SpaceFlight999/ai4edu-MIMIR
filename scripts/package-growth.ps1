param()
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifactPath = Join-Path $workspacePath 'artifacts'
[IO.Directory]::CreateDirectory($artifactPath) | Out-Null
$growthVersion = (Get-Content -LiteralPath (Join-Path $workspacePath 'growth\package.json') -Encoding UTF8 -Raw | ConvertFrom-Json).version
$growthPackageName = 'MIMIR-growth-' + $growthVersion + '.zip'
$packagePath = Join-Path $artifactPath $growthPackageName
if (Test-Path -LiteralPath $packagePath) { throw 'Package already exists. Choose a new version before replacing a delivery.' }
$filesToInclude = @('README.md', 'package.json', '.gitignore', 'Start MIMIR.cmd', 'Install MIMIR.cmd')
foreach ($directory in @('growth','scripts','docs')) {
  foreach ($file in (Get-ChildItem -LiteralPath (Join-Path $workspacePath $directory) -Recurse -File)) {
    $filesToInclude += $file.FullName.Substring($workspacePath.Length + 1)
  }
}
# Evidence is synthetic and selected explicitly. Exclude all logs, instance
# credentials, browser profiles and learner databases.
$historicalVersion = '0.8.0'
foreach ($name in @('wisdom-well.png','growth-configuration.png','configuration-confirmation.png','configuration-narrow.png','plan-proposal.png','growth-journey.png','robotics-learning.png','sharing-grove.png','shared-plans.png','forest-forum.png','wisdom-well-dark.png','wisdom-well-narrow.png','world-tree-todo.png','world-tree-checklist.png','world-tree-focus.png','world-tree-topology.png','world-tree-narrow.png','world-tree-narrow-focus.png','world-tree-dark.png','host-smoke.json','ui-smoke.json','journey-smoke.json','compatibility.json','restart-check.json','runtime-verification.json')) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @('learning-home-entrances.png','learning-home-narrow.png','learning-interest-entrance.png','learning-paper-workshop.png','learning-checkpoint.png','learning-public-course.png','learning-competition-workspace.png','learning-research-feed.png','learning-studio-narrow.png','learning-smoke.json','entrance-smoke.json','research-live.json')) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @('course-loop-proposal.png','course-loop-workshop.png','course-loop-next-candidate.png','course-loop-narrow.png','course-loop-dark.png','core-courses-recommendation.png','core-course-materials-search.png','core-courses-narrow.png','interactive-todo-list.png','course-loop-smoke-2026-10-07.json','course-loop-unit-tests-2026-10-07.json','course-loop-test-cleanup-2026-10-07.json')) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @(('daily-experience-smoke-' + $historicalVersion + '.json'), ('unit-tests-' + $historicalVersion + '.json'), ('daily-experience-cleanup-' + $historicalVersion + '.json'), ('installed-growth-check-' + $historicalVersion + '.json'))) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @('daily-search','daily-draft-recovery','daily-error-recovery','daily-research-10','daily-competition-20','daily-interest-40','course-loop-dark','core-courses-narrow')) {
  $filesToInclude += 'artifacts\' + $historicalVersion + '-' + $name + '.png'
}
foreach ($name in @(('robotics-topic-smoke-' + $historicalVersion + '.json'), ('robotics-synthetic-analysis-' + $historicalVersion + '.md'), ('robotics-topic-cleanup-' + $historicalVersion + '.json'))) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @('prerequisites','workbench','analysis-report','knowledge-map','narrow','dark')) {
  $filesToInclude += 'artifacts\' + $historicalVersion + '-robotics-' + $name + '.png'
}
foreach ($name in @(('dsh-agent-smoke-' + $historicalVersion + '.json'), ('dsh-agent-cleanup-' + $historicalVersion + '.json'))) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @('unit-tests', 'installed-growth-check')) {
  $filesToInclude += 'artifacts\' + $name + '-' + $growthVersion + '.json'
}
$featureVersion = '0.10.0'
foreach ($name in @('customization-smoke', 'dsh-agent-smoke')) {
  $filesToInclude += 'artifacts\' + $name + '-' + $featureVersion + '.json'
}
foreach ($name in @('prompt5-smoke.json','prompt5-home.png','prompt5-research.png','prompt5-library-collapsed.png','prompt5-library-expanded.png','prompt5-practice.png','prompt5-plan-changes.png','prompt5-world-tree.png','prompt5-narrow.png','prompt5-dark.png')) {
  $filesToInclude += 'artifacts\' + $name
}
foreach ($name in @('home', 'home-narrow', 'goals', 'research', 'settings', 'settings-dark', 'settings-narrow', 'topics', 'custom-selected', 'custom-workbench', 'topic-coordinate', 'paper-selection', 'paper-question', 'paper-processing', 'paper-error', 'research-processing', 'research-error', 'growth-processing', 'growth-error', 'writer-processing', 'writer-error', 'paper-research-processing', 'paper-research-error')) {
  $filesToInclude += 'artifacts\' + $featureVersion + '-custom-' + $name + '.png'
}
foreach ($name in @('prompt6-smoke.json','prompt6-brand.png','prompt6-annotation.png','prompt6-research-selection.png','prompt6-research-draft.png','prompt6-error.png','prompt6-narrow.png','prompt6-dark.png')) {
  $filesToInclude += 'artifacts\' + $name
}
$filesToInclude += 'artifacts\input-budget-smoke.json'
$filesToInclude += 'artifacts\research-model-smoke.json'
$filesToInclude += 'artifacts\output-smoke.json'
$filesToInclude += 'artifacts\comparison-smoke.json'
$filesToInclude += 'artifacts\history-smoke.json'
$filesToInclude += 'artifacts\question-smoke.json'
$filesToInclude += 'artifacts\prompt6-question-selection.png'
$filesToInclude += 'artifacts\prompt6-question-history.png'
$filesToInclude += 'artifacts\document-smoke.json'
$filesToInclude += 'artifacts\prompt6-document-review.png'
$filesToInclude += 'artifacts\prompt6-home-spacing.png'
$filesToInclude += 'artifacts\prompt6-home-spacing-narrow.png'
# Keep historical JSON reports, but package only screenshots of this release.
$filesToInclude = @($filesToInclude | Where-Object { -not $_.EndsWith('.png', [StringComparison]::OrdinalIgnoreCase) -or $_.StartsWith('artifacts\prompt6-', [StringComparison]::OrdinalIgnoreCase) })
$zip = [IO.Compression.ZipFile]::Open($packagePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $filesToInclude) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $workspacePath $relative))
    if (-not $absolute.StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Package entry escapes workspace.' }
    if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) { throw ('Missing delivery evidence: ' + $relative) }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $absolute, $relative.Replace('\','/'), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose() }
$hash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($packagePath + '.sha256', $hash + '  ' + $growthPackageName + [Environment]::NewLine)
Write-Output ('Growth delivery packaged: ' + (Get-Item -LiteralPath $packagePath).Length + ' bytes, ' + $filesToInclude.Count + ' files.')
