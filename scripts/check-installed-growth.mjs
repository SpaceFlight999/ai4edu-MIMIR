import assert from 'node:assert/strict'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, sep } from 'node:path'
const version = JSON.parse(readFileSync('growth/package.json', 'utf8')).version
const overlay = JSON.parse(readFileSync('artifacts/growth-overlay.json', 'utf8'))
assert.equal(overlay.version, version)
const root = resolve('runtime'), files = Object.entries(overlay.files)
assert.ok(files.length > 0)
for (const [name, expected] of files) {
  const path = resolve(root, name), location = relative(root, path)
  assert.ok(location !== '..' && !location.startsWith('..' + sep) && !location.includes(':'))
  assert.equal(statSync(path).size, expected.bytes, name)
  assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected.sha256, name)
}
writeFileSync(`artifacts/installed-growth-check-${version}.json`, JSON.stringify({
  passed: true, at: new Date().toISOString(), growthVersion: version, checked: files.length,
  scope: 'All installed growth overlay files; original runtime baseline retains its earlier full verification.',
  failures: [],
}, null, 2))
console.log(`Installed growth passed: ${files.length} overlay files, version ${version}.`)
