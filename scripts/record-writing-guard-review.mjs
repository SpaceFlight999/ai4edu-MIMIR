// Full reading of two targeted actual responses after the writing guard was installed.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const sourceReport = 'artifacts/live-native-writing-guard-followup-20261011.json'
const sourceBytes = readFileSync(sourceReport), source = JSON.parse(sourceBytes)
const findings = {
  'assist-word': { passed: true, findings: ['The actual candidate changes ideal to idealized while keeping One, was discussed and the exact hardware-test negation. It does not introduce We or a file edit; notes preserve uncertainty about whether ideal is a defined term.'], minorObservations: ['Completion-tense terminology is imprecise for English simple past.', 'Notes should describe the sentence as reporting discussion without asserting that a simulation was never executed; the source only explicitly rules out hardware tests.'] },
  'assist-markdown': { passed: true, findings: ['The model kept the original body; the backend removed the unchanged patch and returned the accurate no-change summary. The heading, ideal scope, hardware limitation and unknown actor remain intact.'] },
}
const entries = Object.entries(findings).map(([entry, review]) => {
  const row = source.entries.find(item => item.entry === entry)
  assert.ok(row?.actualResponse && row.passed)
  return { entry, ...review, sourceFixture: row.sourceFixture, actualResponse: row.actualResponse, wireStart: row.wireStart, wireEnd: row.wireEnd }
})
const report = { at: new Date().toISOString(), sourceReport, sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'), manualQualityPassed: true, reviewed: 2, accepted: 2, actualProviderRequests: source.wire.length, previousFailurePreserved: 'artifacts/live-native-writing-final-quality-review-20261011.json', primarySources: ['https://owl.purdue.edu/owl/general_writing/academic_writing/active_and_passive_voice/active_versus_passive_voice.html'], entries, limitations: ['Two targeted samples establish their own body-edit quality only; they do not prove future outputs or all notes flawless.', 'The exact historical invented-We sample is rejected in the actual backend regression fixture; these two new responses did not trigger that guard.'] }
writeFileSync('artifacts/live-native-writing-guard-quality-review-20261011.json', JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ reviewed: 2, accepted: 2, manualQualityPassed: true }))
