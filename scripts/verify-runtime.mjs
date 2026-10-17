import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative, sep, join } from 'node:path'
import { createHash } from 'node:crypto'
import { openArchive } from './archive.mjs'

const root = resolve('runtime'), repair = process.argv.includes('--repair'), prefix = 'Mimir-0.12.0-beta.1-Windows-x64/'
const baselineAt = process.argv.indexOf('--baseline')
const baselinePath = baselineAt >= 0 ? process.argv[baselineAt + 1] : 'Mimir-0.12.0-beta.1-Windows-x64.zip'
if (baselineAt >= 0 && !baselinePath) throw new Error('--baseline requires an archive path.')
const zip = existsSync(resolve(baselinePath)) ? openArchive(resolve(baselinePath)) : null
if (!zip && (repair || baselineAt >= 0)) throw new Error('The requested original baseline archive is required for repair or explicit archive verification.')
const inventory = JSON.parse(zip ? zip.contents(prefix + 'system/inventory.json') : readFileSync(join(root, 'system/inventory.json'), 'utf8'))
if (zip) for (const [name, entry] of zip.entries) if (entry.method === 0 && entry.size === 0 && entry.crc === 0 && entry.compressed === 2) zip.contents(name)
const baselineDiscrepancies = [], repairs = [], failures = [], regeneratedCaches = []
const records = new Map(inventory.checksums.map(record => [record.path, record]))
const overlay = existsSync(resolve('artifacts/growth-overlay.json')) ? JSON.parse(readFileSync(resolve('artifacts/growth-overlay.json'))) : { files: {} }
let checked = 0
try {
  for (const record of inventory.checksums) {
    const target = resolve(root, record.path)
    const location = relative(root, target)
    if (location.startsWith('..' + sep) || location === '..' || location.includes(':')) throw new Error('Manifest path escapes runtime.')
    const baseline = zip?.entries.get(prefix + record.path)
    if (zip && !baseline) throw new Error('Manifest entry absent from ZIP: ' + record.path)
    const expected = overlay.files[record.path] ?? record
    const hash = existsSync(target) ? createHash('sha256').update(readFileSync(target)).digest('hex') : null
    if (hash !== expected.sha256 || (existsSync(target) && statSync(target).size !== expected.bytes)) {
      if (overlay.files[record.path]) { failures.push(record.path); continue }
      // Python rebuilds timestamp-sensitive bytecode after relocation. Accept
      // the disposable cache only when its corresponding .py source still
      // exactly matches the original inventory; never exempt source files.
      const cacheSource = record.path.replace(/\/__pycache__\/(.+)\.cpython-312(?:\.opt-\d+)?\.pyc$/, '/$1.py')
      const sourceRecord = cacheSource !== record.path ? records.get(cacheSource) : null
      if (sourceRecord && existsSync(target) && existsSync(resolve(root, cacheSource)) && createHash('sha256').update(readFileSync(resolve(root, cacheSource))).digest('hex') === sourceRecord.sha256) {
        regeneratedCaches.push(record.path); checked++; continue
      }
      if (!zip) { failures.push(record.path); checked++; continue }
      const original = zip.contents(prefix + record.path)
      const originalHash = createHash('sha256').update(original).digest('hex')
      if (originalHash !== record.sha256 || original.length !== record.bytes) baselineDiscrepancies.push({ path: record.path, manifestBytes: record.bytes, archiveBytes: original.length })
      if (repair) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, original); repairs.push(record.path) }
      else if (hash !== originalHash) failures.push(record.path)
    }
    checked++
    if (checked % 10000 === 0) console.log('Verified ' + checked + ' baseline files')
  }
  let overlayChecked = 0
  for (const [path, expected] of Object.entries(overlay.files)) {
    const target = resolve(root, path), location = relative(root, target)
    if (location.startsWith('..' + sep) || location === '..' || location.includes(':')) throw new Error('Overlay path escapes runtime.')
    if (!existsSync(target) || statSync(target).size !== expected.bytes || createHash('sha256').update(readFileSync(target)).digest('hex') !== expected.sha256) {
      if (!failures.includes(path)) failures.push(path)
    }
    overlayChecked++
  }
  const report = { checkedAt: new Date().toISOString(), baselineMode: zip ? 'original-archive-and-inventory' : 'delivered-inventory-and-overlay', checked, overlayChecked, repaired: repairs.length, baselineDiscrepancies, regeneratedCaches, archiveEmptyFileAnomalies: [...new Set(zip?.anomalies ?? [])], failures, overlayVersion: overlay.version ?? null }
  mkdirSync('artifacts', { recursive: true })
  writeFileSync('artifacts/runtime-verification.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ checked, overlayChecked, regeneratedCaches: regeneratedCaches.length, repaired: repairs.length, baselineDiscrepancies: baselineDiscrepancies.length, archiveEmptyFileAnomalies: report.archiveEmptyFileAnomalies.length, failures: failures.length }))
  if (failures.length) process.exitCode = 1
} finally { zip?.close() }
