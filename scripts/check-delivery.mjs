import assert from 'node:assert/strict'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openArchive } from './archive.mjs'
const version = JSON.parse(readFileSync('growth/package.json')).version
const path = 'artifacts/MIMIR-growth-' + version + '.zip', zip = openArchive(path)
try {
  const names = [...zip.entries.keys()]
  assert.ok(names.includes('growth/lib/client.js'))
  assert.ok(names.includes('Install MIMIR.cmd'))
  assert.ok(names.includes('Start MIMIR.cmd'))
  assert.ok(names.includes('docs/validation.md'))
  assert.ok(!names.some(name => /(^|\/)(runtime|data|\.test-data|node_modules|browser-profile|browser-validation)(\/|$)/.test(name) || /instance\.json|model\.secret|\.log$/i.test(name)))
  for (const name of names) assert.deepEqual(zip.contents(name), readFileSync(name), 'Packaged content mismatch: ' + name)
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  assert.ok(readFileSync(path + '.sha256', 'utf8').startsWith(sha256))
  assert.ok(statSync(path).size < 100 * 1024 * 1024)
  writeFileSync('artifacts/delivery-check.json', JSON.stringify({ passed: true, growthVersion: version, at: new Date().toISOString(), files: names.length, bytes: statSync(path).size, sha256, excludes: ['original runtime', 'learner databases', 'instance credentials', 'logs', 'browser profiles'] }, null, 2))
  console.log('Delivery passed: ' + names.length + ' entries, CRC and SHA-256 verified, ' + statSync(path).size + ' bytes.')
} finally { zip.close() }
