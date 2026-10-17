// Review of preserved synthetic responses; this sends no model request and never overwrites history.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { hasAutomaticExecutionClaim } from './live-native-evidence.mjs'

const sourceReport = 'artifacts/live-native-writing-final-20261011.json'
const source = JSON.parse(readFileSync(sourceReport, 'utf8'))
const findings = {
  'suggest-paragraph': { passed: true, findings: ['The proposed conjunction keeps the example scope and the exact absence of a hardware test. No new actor, experiment or result is introduced.'] },
  'suggest-latex': { passed: true, findings: ['with two inputs becomes using two inputs; the section command, quantity, reported checking action and hardware limitation remain intact.'] },
  'assist-word': { passed: true, findings: ['The actual patch keeps a singular discussed idealized simulation and the exact hardware-test negation. Notes explicitly deny upgrading discussion to execution, validation or modelling; the old keyword check misread this denial. No file edit is claimed.'], minorObservations: ['One becomes An: singular quantity remains, but explicit emphasis is weaker.', 'The notes label the English tense as completion; this is imprecise grammar commentary, without changing the scientific claim.'] },
  'assist-markdown': { passed: false, findings: ['The source gives no actor, but both proposed body sentences introduce We. Asking the author to confirm only in notes does not make that assertion supported. The later backend guard rejects this exact unsupported-actor sample before returning a candidate.'] },
}
const entries = Object.entries(findings).map(([entry, review]) => {
  const actual = source.entries.find(row => row.entry === entry)
  assert.ok(actual?.actualResponse && actual.sourceFixture, 'Missing full writing evidence: ' + entry)
  return { entry, ...review, originalAutomatedPassed: actual.passed, sourceFixture: actual.sourceFixture, actualResponse: actual.actualResponse, wireStart: actual.wireStart, wireEnd: actual.wireEnd }
})
const word = source.entries.find(row => row.entry === 'assist-word')
assert.equal(hasAutomaticExecutionClaim(word.actualResponse.notes), false)
const derived = structuredClone(source)
const derivedWord = derived.entries.find(row => row.entry === 'assist-word')
derivedWord.quality.noAutomaticExecutionClaim = true
derivedWord.passed = Object.values(derivedWord.quality).every(Boolean)
derived.passed = derived.entries.every(row => row.passed)
derived.remainingEntries = derived.entries.filter(row => !row.passed).map(row => row.entry)
derived.derivedFrom = sourceReport
derived.derivation = { at: new Date().toISOString(), newPaidRequests: 0, change: 'Only the negated automatic-execution heuristic was corrected; raw responses, route, wire records and manual quality are preserved.' }
writeFileSync('artifacts/live-native-writing-final-derived-20261011.json', JSON.stringify(derived, null, 2), { flag: 'wx' })
const report = { at: new Date().toISOString(), sourceReport, reviewMode: 'Full-source and response reading; neither keyword checks nor transport certify content.', reviewed: entries.length, accepted: entries.filter(row => row.passed).length, manualQualityPassed: entries.every(row => row.passed), primarySources: ['https://owl.purdue.edu/owl/general_writing/academic_writing/active_and_passive_voice/active_versus_passive_voice.html'], entries, limitations: ['Four synthetic samples do not certify other documents or future outputs.', 'The actor guard is narrow; original responses remain evidence of actual model noncompliance.'] }
writeFileSync('artifacts/live-native-writing-final-quality-review-20261011.json', JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ reviewed: report.reviewed, accepted: report.accepted, manualQualityPassed: report.manualQualityPassed, correctedHeuristicWithoutNewRequests: true }))
