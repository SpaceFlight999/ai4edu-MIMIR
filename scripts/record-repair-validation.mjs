// Offline consolidation. Preserve raw failures; do not start hosts or call models.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, sep } from 'node:path'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const evidence = name => {
  const path = 'artifacts/' + name, bytes = readFileSync(path)
  return { path, sha256: hash(bytes), value: JSON.parse(bytes) }
}
const reference = item => ({ path: item.path, sha256: item.sha256 })
const save = (name, value) => writeFileSync('artifacts/' + name, JSON.stringify(value, null, 2), { flag: 'wx' })
const version = JSON.parse(readFileSync('growth/package.json')).version
assert.equal(version, '0.12.9')

const unit = evidence('unit-tests-0.12.9-closed.json')
const installed = evidence('installed-growth-check-0.12.9.json')
const rawRuntime = evidence('runtime-verification-repair-scan-20261011.json')
const preserved = evidence('final-preservation-user-data-closed-20261011.json')
const ui = evidence('editor-remaining-ui-release-20261011.json')
const chatUi = evidence('research-chat-quality-ui-final-20261011.json')
assert.equal(unit.value.passed, true)
assert.equal(unit.value.tests, 282)
assert.equal(unit.value.fail, 0)
assert.equal(installed.value.passed, true)
assert.equal(preserved.value.passed, true)
assert.equal(preserved.value.userCurrentDataPreserved, true)
assert.equal(preserved.value.unauthorizedFrontendChanges.length, 0)
assert.equal(ui.value.passed, true)
assert.equal(ui.value.checks.length, 12)
assert.ok(ui.value.checks.every(check => check.passed))
assert.equal(chatUi.value.passed, true)

// The scan loaded its overlay before unified.js was finalized. Resolve only
// that explicitly authorized overlay mismatch against the frozen final files.
const overlay = evidence('growth-overlay.json')
assert.equal(overlay.value.version, version)
assert.equal(Object.keys(overlay.value.files).length, 46)
const root = resolve('runtime')
for (const [name, expected] of Object.entries(overlay.value.files)) {
  const path = resolve(root, name), location = relative(root, path)
  assert.ok(location !== '..' && !location.startsWith('..' + sep) && !location.includes(':'))
  assert.equal(statSync(path).size, expected.bytes, name)
  assert.equal(hash(readFileSync(path)), expected.sha256, name)
}
const correctedPath = 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/unified.js'
assert.deepEqual(rawRuntime.value.failures, [correctedPath])
assert.equal(rawRuntime.value.checked, 64077)
assert.equal(rawRuntime.value.overlayChecked, 46)
assert.equal(rawRuntime.value.baselineDiscrepancies.length, 0)
assert.equal(rawRuntime.value.repaired, 0)
assert.equal(JSON.parse(readFileSync('runtime/system/inventory.json')).checksums.length, 64078)
const runtime = {
  at: new Date().toISOString(), version, passed: true,
  rawScan: reference(rawRuntime), rawScanPassed: false,
  inventoryEntries: 64078, rawCheckedCounter: 64077,
  counterExplanation: 'The scanner continues before incrementing checked on an overlay mismatch. All 64078 inventory entries were visited; the single excluded overlay file is checked again below.',
  finalOverlay: reference(overlay), finalOverlayChecked: 46,
  resolvedOverlayFailures: [{ path: correctedPath, finalSha256: overlay.value.files[correctedPath].sha256,
    reason: 'The final installed overlay supersedes the earlier overlay snapshot loaded by the long scan; fresh hash and byte-size checks passed.' }],
  remainingFailures: [], regeneratedCaches: rawRuntime.value.regeneratedCaches.length,
  cachePolicy: 'Only relocated Python bytecode whose corresponding .py source still matches the original inventory is accepted.',
  baselineDiscrepancies: [], filesRepairedDuringVerification: 0,
  archiveEmptyFileAnomalies: rawRuntime.value.archiveEmptyFileAnomalies.length,
  note: 'A composite verification, not a rewritten claim that the raw scan passed. The immutable raw scan is retained.'
}
save('runtime-verification-repair-closed-20261011.json', runtime)

const growth = evidence('live-growth-repairs-20261011.json')
const native = evidence('live-native-acceptance-repairs-20261011.json')
const sparse = evidence('live-native-sparse-quality-20261011.json')
const word = evidence('live-native-repairs-20261011.json')
assert.equal(growth.value.realOnlineProviderRequests, 3)
assert.equal(native.value.wire.length, 8)
assert.equal(growth.value.credentialsRemovedFromSyntheticHome, true)
for (const item of [native, sparse, word]) assert.equal(item.value.credentialsRemoved, true)
for (const record of growth.value.sourceVerification) assert.equal(hash(readFileSync(record.file)), record.sourceSha256, record.file)
const synthesis = native.value.entries.find(row => row.entry === 'research-synthesis-writing').actualResponse
const chat = sparse.value.entries.find(row => row.entry === 'research-chat').actualResponse.text
const wordEntry = word.value.entries.find(row => row.entry === 'assist-word')
assert.equal(Array.from(chat).length <= 120, true)
assert.equal(synthesis.result.analysis.papers[0].methods.length, 0)
assert.equal(synthesis.result.review.issues.length, 3)
assert.equal(wordEntry.quality.noAutomaticExecutionClaim, false)

const manual = {
  at: new Date().toISOString(), version, type: 'offline-full-response-quality-review',
  standard: 'User accepts occasional errors. Reject broken functionality, loss of data, material factual or numerical errors, fabricated results and misleading citation scope. Record limited wording or reviewer mistakes without unbounded paid sampling.',
  newProviderCalls: 0, originalReportsModified: false, acceptedWithKnownLimitations: true,
  mainOutputQualityPassed: true, independentReviewReliabilityPassed: false,
  scope: 'Seven affected outputs reviewed against the retained complete responses and supplied synthetic material. Earlier accepted unchanged entries are carried separately, not counted as fresh runs.',
  entries: [
    { entry: 'growth-import', source: reference(growth), passed: true,
      findings: ['Two 90-minute tasks occupy 1.5 hours in each of two weeks, within the 2-hour weekly cap.', 'Each task is split into 5 sessions of about 18 minutes; the 20-minute single-session cap is feasible.', 'Theta2 is relative to the first link; second-link global direction is theta1+theta2. No identical-angle contradiction remains.', 'The output remains a candidate requiring learner confirmation.'] },
    { entry: 'growth-evidence', source: reference(growth), passed: true,
      findings: ['All three original criteria are credited against the unchanged supplied artifact.', 'The supplied (2,0) and (1,1) unit-link examples agree with the actual numerical tool checks.', 'The next example is a suggestion to calculate, not an unchecked supplied answer; the learner task remains submitted rather than automatically completed.'] },
    { entry: 'paper-guide', source: reference(native), passed: true,
      findings: ['One source-supported topic statement, one bounded uncertainty statement and one suggested next action.', 'Repeated fixture labels are not promoted to methods or measured findings.', 'The unknown applies to the cited text rather than asserting an absence throughout the paper.'] },
    { entry: 'paper-question', source: reference(native), passed: true,
      findings: ['The topic is supported by the actual quote.', 'The response does not invent device performance, specifications or measured metrics.'],
      minorObservations: ['The suggested check says synthetic data although the fixture explicitly labels the paper synthetic. This is a next-step suggestion, not a claim that a dataset exists; synthetic material would be more precise.'] },
    { entry: 'research-synthesis-writing', source: reference(native), mainOutputPassed: true, independentReviewPassed: false,
      findings: ['The three-paragraph draft retains the supported topic, the current-citation uncertainty and a next action.', 'No concrete methods, data, metric or protocol are invented; methods remains empty.', 'No manuscript is automatically written.'],
      retainedReviewIssues: synthesis.result.review.issues,
      reviewObservations: ['method_label_not_procedure complains despite methods being empty and no claimed method procedure.', 'unknown_kind_scope asks for the current-citation qualifier already present in the cited draft sentence.', 'coverage_not_in_draft asks for processing coverage in the draft although the contract retains it separately.'],
      minorObservations: ['The gap phrase can be narrower about which citations support the topic. Duplicate evidence IDs have judgments for different claim scopes, so evidence-level judgments should not be treated as a single proof of truth.'],
      disposition: 'Accepted with the visible reviewer limitations under the user standard; the three issues are neither deleted nor relabeled as passed.' },
    { entry: 'research-chat', source: reference(sparse), passed: true, unicodeCodePoints: Array.from(chat).length,
      findings: ['The complete reply meets the 120-code-point limit including punctuation and formulas.', 'Theta1 is measured from the base +x axis and theta2 from the first link.', 'Only the given zero-angle result (2,0) is repeated; no invented numerical example or hardware validation.', 'The actual native UI fixture separately proves one bounded full regeneration after an invalid first response.'],
      minorObservations: ['The proposed hand check describes the x components; checking y as well would be clearer.'] },
    { entry: 'assist-word', source: reference(word), passed: true, originalAutomaticPassed: false,
      findings: ['The complete response keeps discussed rather than claiming performed or validated.', 'The absence of hardware tests is not expanded into the absence of all simulations or tests.', 'The executed-simulation wording appears only as a conditional question for the author; the original substring heuristic is a false positive.', 'The patch is empty and no file is edited.'],
      disposition: 'Manual result stored separately; the original failed heuristic and original report remain intact.' }
  ],
  limitations: ['Passing samples and narrow validators do not guarantee all future scientific answers.', 'Semantic review remains advisory; original sources and learner confirmation remain necessary.']
}
save('live-repair-manual-quality-20261011.json', manual)

const historicalNames = [
  'user-loop-20261010.json', 'workbench-functions-final-20261010.json', 'workbench-research-title-followup-20261010.json',
  'feature-followup-20261010.json', 'editor-tool-ui-followup-20261011.json', 'session-management-followup-20261010.json',
  'paper-question-history-followup-20261010.json', 'paper-long-final-quality-20261010.json'
]
const historical = historicalNames.map(name => {
  const item = evidence(name)
  return { ...reference(item), originalPassed: item.value.passed,
    treatment: name === 'user-loop-20261010.json' ? 'Original 390px navigation failure retained; superseded by the fresh narrow-navigation UI check. Other eight scenarios passed.' : 'Earlier passing functional evidence carried; not claimed as a fresh full UI replay.' }
})
const liveHistory = readdirSync('artifacts').filter(name => /^live-(?:native|growth)-.*\.json$/.test(name)).flatMap(name => {
  const item = evidence(name), r = item.value
  if ((r.version ?? r.growthVersion) !== version || (!Array.isArray(r.wire) && typeof r.realOnlineProviderRequests !== 'number')) return []
  return [{ ...reference(item), originalPassed: r.passed, providerRequests: r.wire?.length ?? r.realOnlineProviderRequests, runId: r.runId ?? r.attemptId ?? null }]
})
const sourcePaths = [
  'growth/src/model.mjs', 'growth/src/plan-time-validation.mjs', 'growth/src/plan-science-validation.mjs',
  'growth/src/dsh-agent.mjs', 'growth/src/domain.mjs', 'growth/client/block-identity.js', 'growth/client/navigation.css',
  'growth/overrides/host/index.js', 'growth/overrides/host/unified.js', 'growth/overrides/app/model-policy.mjs',
  'growth/overrides/app/research-chat-quality.mjs', 'growth/overrides/workbench/client.js',
  'growth/overrides/paper/viewer/reader.html', 'growth/overrides/paper/viewer/reader.mjs',
  'growth/overrides/paper/viewer/session.mjs', 'scripts/build-growth.mjs', 'scripts/install-growth.mjs',
  'scripts/workbench-functional-patches.mjs'
]
const final = {
  at: new Date().toISOString(), version, packagingPerformed: false, olderPackagesContainLatestChanges: false,
  currentFunctionalAcceptancePassed: true, currentSampleMainOutputQualityPassed: true,
  independentAiReviewReliabilityPassed: false, acceptedWithKnownLimitations: true,
  unit: { ...reference(unit), ...unit.value }, installed: { ...reference(installed), ...installed.value },
  runtime: reference(evidence('runtime-verification-repair-closed-20261011.json')),
  preservation: { ...reference(preserved), passed: true, userCurrentDataPreserved: true, partnerDataFiles: 71,
    frontendFiles: 33, frontendUnchangedFiles: 27, authorizedFrontendChanges: preserved.value.authorizedFrontendRepairs,
    unauthorizedFrontendChanges: [], originalZipUnchanged: true, userConfirmedMimirUse: true,
    explanation: 'Six older runtime-data changes predate this isolated round; the user confirmed using Mimir. Fresh current-data hashes are preserved, without restoring the older data snapshot.' },
  freshUI: { ...reference(ui), checks: ui.value.checks.map(row => ({ name: row.name, passed: row.passed })), cleanup: ui.value.cleanup, paidModelCalls: 0 },
  freshNativeChatGuardUI: { ...reference(chatUi), passed: true, invalidFirstReplyBlocked: chatUi.value.invalidFirstReplyBlocked,
    singleCompleteRepair: chatUi.value.singleCompleteRepair, cleanup: chatUi.value.cleanup, paidModelCalls: 0 },
  manualQuality: reference(evidence('live-repair-manual-quality-20261011.json')),
  earlierFunctionalEvidence: historical, paidRepairAttemptHistory: liveHistory,
  previousFinalReport: reference(evidence('final-feature-quality-20261011.json')),
  sourceSnapshot: sourcePaths.map(path => ({ path, sha256: hash(readFileSync(path)) })),
  primaryResearch: { path: 'docs/repair-primary-sources-2026-10-11.md', sha256: hash(readFileSync('docs/repair-primary-sources-2026-10-11.md')) },
  nativeLoopStaticAnalysis: { ...reference(evidence('rea-chat-loop-20261011.json')),
    evidenceId: 'ev_ed87c62aab6c9f81f59c83d16353b86324546d91149488889e6c45a24452c8db',
    scope: 'REA inert static JS/TS analysis only; actual native chat UI evidence provides the runtime proof.' },
  knownLimitations: ['Independent synthesis review still yields three noncritical inaccurate comments; preserved visibly.',
    'No second clean Windows machine, full desktop tray/first-Key flow or real hardware certification.',
    'Online primary-source research occurred during this audit; the product is not claimed to browse the web for every AI answer.',
    'No new ZIP was created. Restart the native host to load the installed 0.12.9 changes.']
}
save('final-repair-validation-20261011.json', final)
console.log(JSON.stringify({ version, unitTests: unit.value.pass, freshUIChecks: ui.value.checks.length, installedFiles: 46,
  runtimeInventoryEntries: runtime.inventoryEntries, runtimeRemainingFailures: 0, currentUserDataPreserved: true,
  acceptedWithKnownLimitations: true, independentReviewReliabilityPassed: false, packaged: false }))
