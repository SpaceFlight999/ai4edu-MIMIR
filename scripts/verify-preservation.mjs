// Read-only comparison with the partner hashes captured before repair.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

const root = resolve('.'), baselineRoot = resolve(root, '..', '_inventory')
const reportAt = process.argv.indexOf('--report')
const reportPath = resolve(root, reportAt >= 0 ? process.argv[reportAt + 1] || '' : 'artifacts/final-preservation-20261010.json')
const reportLocation = relative(resolve(root, 'artifacts'), reportPath)
assert.ok(reportLocation && reportLocation !== '..' && !reportLocation.startsWith('..' + sep) && !reportLocation.includes(':') && reportPath.endsWith('.json'), '--report must name a new JSON file inside artifacts.')
const source = JSON.parse(readFileSync(resolve(baselineRoot, 'partner-source-baseline-20261010.json'), 'utf8'))
const dataBaseline=process.argv.includes('--user-current-data')?'partner-user-current-baseline-private-20261011.json':'partner-data-baseline-private-20261010.json'
const data = JSON.parse(readFileSync(resolve(baselineRoot, dataBaseline), 'utf8'))
const frontend = Object.entries(source).filter(([name]) => name.startsWith('growth/client/') || name === 'growth/lib/client.js' || /^growth\/overrides\/(?:chat|workbench)\/client\.js$/.test(name) || name.startsWith('growth/overrides/paper/viewer/'))
assert.equal(frontend.length, 33)
assert.equal(Object.keys(data).length, 71)
function matches(name, expected) {
  assert.match(expected, /^[a-f0-9]{64}$/)
  const file = resolve(root, name), inside = relative(root, file)
  assert.ok(inside && inside !== '..' && !inside.startsWith('..' + sep) && !inside.includes(':'))
  return createHash('sha256').update(readFileSync(file)).digest('hex') === expected
}
const frontendChanged = frontend.filter(([name, hash]) => !matches(name, hash)).map(([name]) => name)
const authorizedFrontendRepairs=process.argv.includes('--functional-repairs')?['growth/client/navigation.css','growth/lib/client.js','growth/overrides/workbench/client.js','growth/overrides/paper/viewer/reader.html','growth/overrides/paper/viewer/reader.mjs','growth/overrides/paper/viewer/session.mjs']:[]
if(process.argv.includes('--provider-restoration'))authorizedFrontendRepairs.push('growth/client/models.js','growth/client/app.js')
const unauthorizedFrontendChanges=frontendChanged.filter(name=>!authorizedFrontendRepairs.includes(name))
const partnerDataUnchanged = Object.entries(data).every(([name, hash]) => matches(name, hash))
const sourceChanged = Object.entries(source).filter(([name, hash]) => !matches(name, hash)).map(([name]) => name)
const originalZip = resolve(root, '..', 'ai4edu-MIMIR.zip'), zipHash = createHash('sha256')
for await (const chunk of createReadStream(originalZip)) zipHash.update(chunk)
const originalZipSha256 = zipHash.digest('hex')
const originalZipUnchanged = originalZipSha256 === '36ade4752159969b9a86bb74d19b34f8f5a1d6491014c22c80e6a88aa2a8e174'
const report = { at: new Date().toISOString(), frontendFiles: frontend.length, frontendUnchanged: frontendChanged.length === 0, frontendChanged, partnerDataFiles: Object.keys(data).length, partnerDataUnchanged, sourceChanged, originalZipSha256, originalZipUnchanged, realUserHomeUsed: false, packaged: false }
Object.assign(report,{dataBaseline,userCurrentDataPreserved:process.argv.includes('--user-current-data')?partnerDataUnchanged:null,authorizedFrontendRepairs,unauthorizedFrontendChanges,frontendUnchangedFiles:frontend.length-frontendChanged.length,changedFrontendHashes:frontendChanged.map(path=>({path,beforeSha256:source[path],afterSha256:createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')}))})
report.passed = unauthorizedFrontendChanges.length===0 && partnerDataUnchanged && originalZipUnchanged
writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ passed: report.passed, frontendFiles: frontend.length, partnerDataFiles: Object.keys(data).length, originalZipUnchanged, packaged: false }))
assert.ok(report.passed, 'Partner input preservation failed.')
