// Explicit human findings from full reading of this synthetic online report.
import { readFileSync, writeFileSync } from 'node:fs'
const sourceReport = 'artifacts/live-native-selected-final-20261010.json'
const source = JSON.parse(readFileSync(sourceReport, 'utf8'))
const findings = {
  'assist-word': { passed: true, findings: ['The actual patch keeps One, discussed, idealized scope and the exact hardware-test negation. Notes identify the single change and retain uncertainty about the defined term and scope. No file edits were claimed.'] },
  'assist-markdown': { passed: false, findings: ['Discussing an ideal simulation was changed to treating the simulation as ideal; that changes the reported action. Notes acknowledge the ambiguity only after proposing the new meaning. Notes also call the modified first body sentence the second sentence.'] }
}
const entries = Object.entries(findings).map(([entry, review]) => {
  const actual = source.entries.find(row => row.entry === entry)
  if (!actual?.actualResponse || !actual.sourceFixture) throw new Error('Full writing evidence is missing: ' + entry)
  return { entry, ...review, sourceFixture: actual.sourceFixture, actualResponse: actual.actualResponse, transportAndSchemaPassed: actual.passed, wireStart: actual.wireStart, wireEnd: actual.wireEnd }
})
const report = { at: new Date().toISOString(), sourceReport, reviewMode: 'human full-source and response reading, not keyword certification', manualQualityPassed: entries.every(row => row.passed), primarySources: ['https://owl.purdue.edu/owl/general_writing/academic_writing/active_and_passive_voice/active_versus_passive_voice.html'], entries, limitations: ['Two synthetic samples; this does not certify other manuscripts or future outputs.'] }
writeFileSync('artifacts/live-native-selected-writing-quality-review-20261010.json', JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ reviewed: entries.length, manualQualityPassed: report.manualQualityPassed }))
