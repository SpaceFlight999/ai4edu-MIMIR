// Recheck the installed growth files after a rebuild, preserving the completed
// original-runtime inventory verification and any non-overlay failures.
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const root = resolve('runtime')
const manifest = JSON.parse(readFileSync('artifacts/growth-overlay.json'))
const report = JSON.parse(readFileSync('artifacts/runtime-verification.json'))
assert.equal(report.checked, 64078, 'Run the full original-runtime verification first.')
const failures = report.failures.filter(path => !Object.hasOwn(manifest.files, path))
for (const [path, expected] of Object.entries(manifest.files)) {
  const target = resolve(root, path), location = relative(root, target)
  assert.ok(!location.startsWith('..' + sep) && location !== '..' && !location.includes(':'))
  if (statSync(target).size !== expected.bytes || createHash('sha256').update(readFileSync(target)).digest('hex') !== expected.sha256) failures.push(path)
}
writeFileSync('artifacts/runtime-verification.json', JSON.stringify({ ...report, failures, overlayChecked: Object.keys(manifest.files).length, overlayVersion: manifest.version, overlayRecheckedAt: new Date().toISOString() }, null, 2))
assert.deepEqual(failures, [])
console.log('Installed growth overlay verified: ' + Object.keys(manifest.files).length + ' files; original-runtime baseline verification retained.')
