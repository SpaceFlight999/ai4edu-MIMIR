// Read-only recreation of the installer environment changes from the original archive.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openArchive } from './archive.mjs'
import { applyModelProfileSeed } from '../growth/overrides/app/model-profile-seed.mjs'
import { applyProductConfigWrite } from '../growth/overrides/app/product-config-write.mjs'

const archivePath = process.argv[2] || '../release/Mimir-0.12.0-beta.1-Windows-x64.zip'
const archive = openArchive(archivePath)
let original
try { original = archive.contents('Mimir-0.12.0-beta.1-Windows-x64/system/app/environment.mjs').toString('utf8') }
finally { archive.close() }
const installer = readFileSync('scripts/install-growth.mjs', 'utf8')
assert.ok(installer.includes('environment = applyProductConfigWrite(environment)'))
assert.ok(original.includes("'@mimir/dsh-workbench-bundle']"))
let recreated = original.replace("'@mimir/dsh-workbench-bundle']", "'@mimir/dsh-workbench-bundle','@mimir/growth-layer']")
recreated = applyModelProfileSeed(recreated)
recreated = applyProductConfigWrite(recreated)
const current = readFileSync('runtime/system/app/environment.mjs', 'utf8')
assert.equal(recreated, current, 'Original baseline plus installer transforms must exactly reproduce the runtime environment source.')
assert.equal(applyProductConfigWrite(recreated), recreated)
const hash = value => createHash('sha256').update(value).digest('hex')
const report = { at: new Date().toISOString(), passed: true, readOnlyProduction: true, noInstallation: true, paidModelCalls: 0, baseline: archivePath, sourceEntry: 'system/app/environment.mjs', baselineSha256: hash(original), recreatedSha256: hash(recreated), currentRuntimeSha256: hash(current), installerCarriesConfigWriteRepair: true, recreatedExactly: true, repeatedTransformUnchanged: true, earlierFailurePreserved: 'artifacts/config-source-reinstall-review-20261011.json' }
writeFileSync('artifacts/config-source-reinstall-recheck-20261011.json', JSON.stringify(report, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ passed: true, recreatedExactly: true, repeatedTransformUnchanged: true, paidModelCalls: 0 }))
