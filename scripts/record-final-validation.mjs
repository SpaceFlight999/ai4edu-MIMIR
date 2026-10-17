// Consolidate existing evidence only; no host, model, network, packaging or data migration.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

function evidence(name) {
  const path = 'artifacts/' + name, bytes = readFileSync(path)
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), value: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) }
}
const unit = evidence('unit-tests-0.12.8.json'), installed = evidence('installed-growth-check-0.12.8.json'), runtime = evidence('runtime-verification-final-20261011.json'), preserved = evidence('final-preservation-20261011.json')
assert.equal(unit.value.passed, true)
assert.equal(unit.value.pass, unit.value.tests)
assert.equal(unit.value.tests, 258)
assert.equal(unit.value.fail, 0)
assert.equal(installed.value.passed, true)
assert.equal(installed.value.checked, 43)
assert.equal(runtime.value.failures.length, 0)
assert.equal(runtime.value.checked, 64078)
assert.equal(runtime.value.overlayChecked, installed.value.checked)
assert.equal(preserved.value.passed, true)
const functionalFiles = [
  'user-loop-20261010.json', 'workbench-functions-final-20261010.json', 'workbench-research-title-followup-20261010.json',
  'feature-followup-20261010.json', 'editor-tool-ui-followup-20261011.json', 'editor-remaining-ui-final-20261011.json',
  'session-management-followup-20261010.json', 'paper-question-history-followup-20261010.json', 'paper-long-final-quality-20261010.json',
]
const functionality = functionalFiles.map(name => {
  const item = evidence(name), value = item.value
  return { path: item.path, sha256: item.sha256, passed: value.passed, checks: typeof value.checks === 'number' ? value.checks : Array.isArray(value.checks) ? value.checks.length : null,
    checkDetails: Array.isArray(value.checks) ? value.checks.map(row => ({ name: typeof row === 'string' ? row : row.name, passed: row.passed ?? null, available: row.available ?? null, status: row.status ?? null, error: row.error ?? null })) : undefined,
    scenarios: value.scenarios?.map(row => ({ name: row.name, passed: row.passed, checks: Array.isArray(row.checks) ? row.checks.length : row.checks, modelCalls: row.localModelRequests ?? null })), summary: value.summary, capabilities: value.capabilities, cleanup: value.cleanup, paidModelCalls: value.paidModelCalls ?? null, scope: value.scope ?? null }
})
const qualityFiles = [
  'live-growth-selected-quality-review-20261011.json', 'live-growth-import-time-quality-review-20261011.json',
  'live-native-selected-final-quality-review-20261010.json', 'live-native-writing-final-quality-review-20261011.json', 'live-native-writing-guard-quality-review-20261011.json',
]
const quality = qualityFiles.map(name => {
  const item = evidence(name), value = item.value
  assert.equal(typeof value.manualQualityPassed, 'boolean')
  return { path: item.path, sha256: item.sha256, sourceReport: value.sourceReport, manualQualityPassed: value.manualQualityPassed,
    entries: value.entries.map(row => ({ entry: row.entry ?? row.operation, manualQualityPassed: row.manualQualityPassed ?? row.passed ?? null, findings: row.findings, minorObservations: row.minorObservations })) }
})
const sourcePaths = ['growth/src/model.mjs', 'growth/src/dsh-agent.mjs', 'growth/overrides/host/index.js', 'growth/overrides/host/unified.js', 'growth/overrides/app/product-config-write.mjs', 'scripts/install-growth.mjs', 'runtime/system/app/environment.mjs']
const report = {
  at: new Date().toISOString(), version: '0.12.8', packagingPerformed: false, olderPackagesContainLatestChanges: false,
  scope: 'Existing backend repairs and available functional/UI checks on this Windows host; all historical failures retained.',
  unit: { path: unit.path, sha256: unit.sha256, ...unit.value }, installed: { path: installed.path, sha256: installed.sha256, ...installed.value },
  runtime: { path: runtime.path, sha256: runtime.sha256, checked: runtime.value.checked, overlayChecked: runtime.value.overlayChecked, failures: runtime.value.failures, regeneratedCaches: runtime.value.regeneratedCaches.length },
  preservation: { path: preserved.path, sha256: preserved.sha256, passed: preserved.value.passed, frontendFiles: preserved.value.frontendFiles, partnerDataFiles: preserved.value.partnerDataFiles, originalZipUnchanged: preserved.value.originalZipUnchanged },
  functionality, quality, allRecordedFunctionalChecksPassed: functionality.every(row => row.passed === true), allReviewedAiSamplesPassed: quality.every(row => row.manualQualityPassed),
  sourceSnapshot: sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })),
  knownIssues: ['Original learning navigation clips at 390px; original frontend was preserved.', 'The existing editor duplicated block IDs after real keyboard paragraph insertion; actual save was rejected with 400 INVALID_ARGUMENT, preserving the backend identity contract.', 'Latest import candidate called two identical 90-degree second-link global angles different, and retained an impossible four-session option for 90 minutes under a 20-minute cap; its title-duration inconsistency did not recur in this sample.', 'Latest evidence scorer missed a correct concept distinction; status-count summary was made consistent but the actual wrong judgment remains unresolved.', 'Paper guide/question contain redundant or overbroad claims; synthesis retains three unresolved citation/content issues.', 'Research chat returned 159 characters against a 120-character request and confused relative versus absolute link angles.'],
  limitations: ['Narrow validators and sampled model responses do not certify arbitrary scientific facts or future outputs.', 'Unavailable controls are explicitly distinguished from passed controls in their UI report.', 'A second clean Windows machine, full desktop tray/first-Key interaction, and real hardware were not certified.'],
}
writeFileSync('artifacts/final-feature-quality-20261011.json', JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ unit: report.unit.pass, installed: report.installed.checked, runtime: report.runtime.checked, preserved: report.preservation.passed, allRecordedFunctionalChecksPassed: report.allRecordedFunctionalChecksPassed, allReviewedAiSamplesPassed: report.allReviewedAiSamplesPassed, packaged: false }))
