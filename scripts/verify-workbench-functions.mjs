// Exercise real installed tools with disposable synthetic files, without model calls.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { longPaperFixture } from './long-paper-fixture.mjs'

const root = resolve('.'), runId = 'workbench-functions-' + randomUUID()
const home = join(root, '.test-data', runId)
const reportAt = process.argv.indexOf('--report')
const reportPath = reportAt < 0 ? join(root, 'artifacts', 'workbench-functions-followup-20261010.json') : resolve(process.argv[reportAt + 1] ?? '')
assert.equal(dirname(reportPath), join(root, 'artifacts'), 'A report must stay in the artifacts directory.')
assert.match(reportPath, /\.json$/i)
if (reportAt >= 0) assert.equal(existsSync(reportPath), false, 'Use a new report path; historical attempts must be retained.')
const onlyAt = process.argv.indexOf('--only'), only = onlyAt < 0 ? null : process.argv[onlyAt + 1]
if (onlyAt >= 0) assert.ok(only, 'Missing --only scenario.')
const report = { at: new Date().toISOString(), version: JSON.parse(readFileSync('growth/package.json')).version,
  installedRuntime: true, syntheticFilesOnly: true, realDataRead: false, paidModelCalls: 0,
  networkEnabled: process.argv.includes('--network'), checks: [], cleanup: {}, passed: false }
const env = { ...process.env }
for (const name of Object.keys(env)) if (/(?:api.?key|token|secret|password)/i.test(name)) delete env[name]
mkdirSync(home, { recursive: true })
writeFileSync(join(home, 'owned-by-workbench-functions.json'), JSON.stringify({ root, runId }))
let host, instance, origin, cookie, hostOutput = ''
const delay = ms => new Promise(done => setTimeout(done, ms))
async function wait(check, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw new Error('Owned fixture readiness timed out.')
}
async function api(path, data, bytes) {
  const response = await fetch(origin + path, { method: data === undefined && !bytes ? 'GET' : 'POST',
    headers: { cookie, origin, ...(bytes ? { 'x-mimir-filename': bytes.name } : { 'content-type': 'application/json' }) },
    body: bytes?.body ?? (data === undefined ? undefined : JSON.stringify(data)), signal: AbortSignal.timeout(180000) })
  const body = await response.json()
  if (!response.ok || body.ok === false) throw Object.assign(new Error(body.error?.message ?? 'Native operation rejected.'), { code: body.error?.code ?? 'HTTP_' + response.status })
  return body.data ?? body
}
const tool = input => api('/api/mimir/tools', input)
const upload = (name, body) => api('/api/mimir/files/import', undefined, { name, body })
async function sample(name, run) {
  if (only && name !== only) return
  const row = { name, passed: false }, start = Date.now(); report.checks.push(row)
  try { row.evidence = await run(); row.passed = true }
  catch (error) { row.error = { code: error.code ?? error.name, message: String(error.message).replace(/token=[^\s&]+/g, 'token=[redacted]').slice(0, 500) } }
  row.seconds = Math.round((Date.now() - start) / 1000)
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log((row.passed ? 'PASS ' : 'FAIL ') + name + ' (' + row.seconds + 's)')
}
async function download(file) {
  assert.ok(file?.id)
  const response = await fetch(origin + '/api/mimir/file?id=' + encodeURIComponent(file.id), { headers: { cookie }, signal: AbortSignal.timeout(10000) })
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 0)
  return bytes
}
try {
  host = spawn(process.execPath, [join(root, 'runtime/system/app/app.mjs'), '--headless', '--data-home', home], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [host.stdout, host.stderr]) stream.on('data', bytes => { hostOutput = (hostOutput + bytes).slice(-4000) })
  await wait(() => { if (host.exitCode !== null) throw new Error('Owned fixture host exited.'); return existsSync(join(home, 'instance.json')) })
  instance = JSON.parse(readFileSync(join(home, 'instance.json'))); origin = new URL(instance.url).origin
  const login = await fetch(instance.url, { redirect: 'manual' }); cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const original = await api('/api/mimir/document')
  let word, pdf, merged, csv, figure
  await sample('docx-create-inspect-download', async () => {
    const result = await tool({ operation: 'docx.create', name: 'synthetic.docx', spec: { title: 'Synthetic verification', header: 'Synthetic header', footer: 'Synthetic footer', page_numbers: true, toc: true,
      blocks: [{ type: 'heading', level: 1, text: 'Scope' }, { type: 'paragraph', text: 'One ideal simulation. No hardware test.' }, { type: 'table', rows: [['case', 'value'], ['zero', '2']] }] } })
    word = result.files[0]; const preview = await tool({ operation: 'file.inspect', sourceId: word.id })
    assert.equal(preview.kind, 'docx'); assert.match(JSON.stringify(preview), /One ideal simulation/); assert.match(JSON.stringify(preview.tables), /zero/)
    const bytes = await download(word); assert.equal(bytes.readUInt16LE(), 0x4b50)
    return { paragraphs: preview.paragraphs.length, tables: preview.tables.length, bytes: bytes.length }
  })
  await sample('docx-edit-preserves-source', async () => {
    assert.ok(word); const before = await download(word)
    const result = await tool({ operation: 'docx.edit', sourceId: word.id, replacements: [{ find: 'One ideal simulation.', replace: 'One ideal planar simulation.' }] })
    const preview = await tool({ operation: 'file.inspect', sourceId: result.files[0].id })
    assert.match(JSON.stringify(preview), /One ideal planar simulation/); assert.match(JSON.stringify(preview), /No hardware test/)
    assert.deepEqual(await download(word), before)
    return { replacementCount: result.details.replacement_counts['One ideal simulation.'], originalUnchanged: true }
  })
  await sample('docx-tracked-change-visible-final', async () => {
    assert.ok(word); const result = await tool({ operation: 'docx.edit', sourceId: word.id, trackedChanges: [{ find_paragraph: 'One ideal simulation. No hardware test.', replace: 'One ideal planar simulation. No hardware test.', author: 'Synthetic reviewer' }] })
    const preview = await tool({ operation: 'file.inspect', sourceId: result.files[0].id })
    assert.equal(preview.hasPendingRevisions, true); assert.match(JSON.stringify(preview), /One ideal planar simulation/)
    return { pendingRevisionsPreserved: true, revisionView: preview.revisionView }
  })
  await sample('markdown-import-inspect-download', async () => {
    const file = await upload('synthetic.md', '# Synthetic\n\nNo hardware test.\n')
    const preview = await tool({ operation: 'file.inspect', sourceId: file.id })
    assert.match(JSON.stringify(preview), /No hardware test/); assert.match((await download(file)).toString(), /# Synthetic/)
    return { bytes: (await download(file)).length }
  })
  await sample('pdf-import-extract-page-range', async () => {
    pdf = await upload('synthetic-three-pages.pdf', longPaperFixture(3, 'function-scope'))
    const result = await tool({ operation: 'pdf.extract', sourceId: pdf.id, start: 2, end: 2 })
    assert.equal(result.pages.length, 1); assert.equal(result.pages[0].page, 2); assert.match(result.pages[0].text, /page 2 row 0/)
    return { pages: result.pages.map(page => page.page) }
  })
  await sample('pdf-split-merge', async () => {
    assert.ok(pdf); const split = await tool({ operation: 'pdf.split', sourceId: pdf.id, ranges: [[1, 1], [2, 3]] })
    assert.equal(split.files.length, 2)
    const result = await tool({ operation: 'pdf.merge', sourceIds: split.files.map(file => file.id) }); merged = result.files[0]
    const extracted = await tool({ operation: 'pdf.extract', sourceId: merged.id }); assert.equal(extracted.pages.length, 3)
    for (let i = 0; i < 3; i++) assert.match(extracted.pages[i].text, new RegExp('page ' + (i + 1) + ' row 0'))
    return { splitFiles: split.files.length, mergedPages: extracted.pages.length }
  })
  await sample('pdf-watermark-preserves-page-count', async () => {
    assert.ok(merged); const mark = await upload('synthetic-mark.pdf', longPaperFixture(1, 'synthetic-mark'))
    const result = await tool({ operation: 'pdf.watermark', sourceId: merged.id, watermarkId: mark.id })
    const extracted = await tool({ operation: 'pdf.extract', sourceId: result.files[0].id })
    assert.equal(extracted.pages.length, 3); assert.match(extracted.pages[0].text, /synthetic-mark/)
    return { pages: extracted.pages.length }
  })
  await sample('figure-csv-line-png-pdf-svg', async () => {
    csv = await upload('synthetic.csv', 'time,distance\n0,0\n1,1\n2,2\n')
    const preview = await tool({ operation: 'file.inspect', sourceId: csv.id }); assert.match(JSON.stringify(preview), /distance/)
    const result = await tool({ operation: 'figure.plot', sourceId: csv.id, name: 'synthetic-line', kind: 'line', x: 'time', y: 'distance', style: 'journal', formats: 'png,pdf,svg' })
    assert.equal(result.files.length, 3); figure = result.files
    for (const file of result.files) await download(file)
    return { formats: result.files.map(file => file.name.split('.').at(-1)), warnings: result.warnings }
  })
  await sample('figure-diagram-editable-svg', async () => {
    const result = await tool({ operation: 'figure.diagram', name: 'synthetic-flow', spec: { layout: 'layered', direction: 'RIGHT', nodes: [{ id: 'a', label: 'Input', width: 100, height: 50 }, { id: 'b', label: 'Check', width: 100, height: 50 }], edges: [{ from: 'a', to: 'b' }] } })
    const bytes = await download(result.files[0]); assert.match(bytes.toString(), /<svg/); assert.match(bytes.toString(), /Input/)
    return { bytes: bytes.length, svg: true }
  })
  await sample('figure-history-read-and-annotate', async () => {
    assert.ok(figure); const history = await tool({ operation: 'figure.history' })
    const versions = history.versions ?? history.entries ?? history
    assert.ok(Array.isArray(versions) && versions.length > 0)
    const id = versions[0].id ?? versions[0].versionId
    assert.ok(id); await tool({ operation: 'figure.history', action: 'annotate', versionId: id, note: 'Synthetic verified output only.' })
    const after = await tool({ operation: 'figure.history' }); assert.match(JSON.stringify(after), /Synthetic verified output only/)
    return { versions: versions.length, annotationSaved: true }
  })
  await sample('runtime-python-input-output', async () => {
    assert.ok(csv); const result = await tool({ operation: 'runtime.run', runtime: 'python', fileIds: [csv.id], code: 'import csv\nfrom pathlib import Path\nrows=list(csv.DictReader(Path("synthetic.csv").open()))\nprint(sum(float(r["distance"]) for r in rows))\nPath("result.txt").write_text("synthetic total=3")\n' })
    assert.equal(result.execution.exitCode, 0); assert.match(result.execution.stdout, /3\.0/)
    const file = result.files.find(file => file.name === 'result.txt'); assert.ok(file); assert.equal((await download(file)).toString(), 'synthetic total=3')
    return { exitCode: result.execution.exitCode, stdout: result.execution.stdout.trim(), generatedResult: true }
  })
  await sample('runtime-powershell', async () => {
    const result = await tool({ operation: 'runtime.run', runtime: 'powershell', code: 'Write-Output (1 + 1)' })
    assert.equal(result.execution.exitCode, 0); assert.equal(result.execution.stdout.trim(), '2')
    return { exitCode: 0, stdout: '2' }
  })
  await sample('runtime-bash', async () => {
    const result = await tool({ operation: 'runtime.run', runtime: 'bash', code: "printf '%s\\n' 2" })
    assert.equal(result.execution.exitCode, 0); assert.equal(result.execution.stdout.trim(), '2')
    return { exitCode: 0, stdout: '2' }
  })
  await sample('latex-template-and-real-compile', async () => {
    const templates = await tool({ operation: 'latex.templates' }); assert.ok(templates.templates.length > 0)
    const first = templates.templates[0]; const made = await tool({ operation: 'latex.template.create', template: first.id ?? first.name ?? first, name: 'synthetic-template' }); assert.ok(made.files[0])
    const source = await upload('synthetic-minimal.tex', '\\documentclass{article}\n\\begin{document}\nSynthetic test: $1+1=2$. No hardware test.\n\\end{document}\n')
    const result = await tool({ operation: 'latex.compile', sourceId: source.id, maxPasses: 2, timeoutMs: 120000 })
    assert.equal(result.ok, true); const output = result.files.find(file => file.name.endsWith('.pdf')); assert.ok(output)
    assert.equal((await download(output)).subarray(0, 4).toString(), '%PDF')
    return { templates: templates.templates.length, compileSucceeded: true, passes: result.passes }
  })
  await sample('bibliography-create-download', async () => {
    const result = await tool({ operation: 'research.bibtex', metadata: { title: 'Synthetic fixture', authors: ['Synthetic Author'], year: 2026, doi: '10.0000/synthetic-fixture' } })
    const bytes = await download(result.files[0]); assert.match(bytes.toString(), /Synthetic fixture/)
    return { bytes: bytes.length, syntheticMetadata: true }
  })
  await sample('invalid-file-and-page-range-rejected', async () => {
    await assert.rejects(tool({ operation: 'file.inspect', sourceId: randomUUID() }))
    assert.ok(pdf); await assert.rejects(tool({ operation: 'pdf.extract', sourceId: pdf.id, start: 0, end: 1 }))
    return { absentFileRejected: true, invalidRangeRejected: true }
  })
  if (report.networkEnabled) {
    await sample('research-crossref-live-official', async () => {
      const value = await tool({ operation: 'research.crossref', doi: '10.1073/pnas.1821936116' })
      assert.match(JSON.stringify(value), /1821936116/); assert.match(JSON.stringify(value), /learn/i)
      return { doiMatched: true, metadataRetrieved: true }
    })
    await sample('research-search-live-arxiv-crossref', async () => {
      const value = await tool({ operation: 'research.search', query: 'robot control', sources: ['arxiv', 'crossref'], limitPerSource: 2 })
      assert.ok(value.results.length > 0)
      return { results: value.results.map(row => ({ source: row.source, title: row.title, url: row.url })), providerErrors: value.errors }
    })
    await sample('research-read-and-verify-original-page', async () => {
      const url = 'https://arxiv.org/abs/1706.03762'
      const read = await tool({ operation: 'research.read', url, query: 'Attention', maxChars: 1000 })
      assert.match(JSON.stringify(read), /Attention/i)
      const verify = await tool({ operation: 'research.verify', url, expected: { title: 'Attention Is All You Need' } })
      assert.equal(verify.fields?.title?.status, 'matched', 'The original page must match the requested title.')
      return { originalRead: true, verification: verify }
    })
  }
  report.manuscriptUnchanged = JSON.stringify(await api('/api/mimir/document')) === JSON.stringify(original)
  assert.equal(report.manuscriptUnchanged, true)
} catch (error) { report.failure = { code: error.code ?? error.name, message: error.message }; writeFileSync(join(home, 'host-diagnostic.log'), hostOutput) }
finally {
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  if (host) await wait(() => host.exitCode !== null, 15000).catch(() => { host.kill(); report.cleanup.forcedStop = true })
  report.cleanup.hostStopped = host?.exitCode !== null
  for (const name of ['instance.json', '.credentials.yaml', '.credentials.yaml.lock', 'model.secret']) rmSync(join(home, name), { force: true, maxRetries: 10, retryDelay: 100 })
  report.passed = !report.failure && report.checks.length > 0 && report.checks.every(row => row.passed) && report.manuscriptUnchanged === true && report.cleanup.hostStopped && !report.cleanup.forcedStop
  report.completedAt = new Date().toISOString(); mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.checks.filter(row => !row.passed).map(row => row.name), paidModelCalls: 0 }))
  if (!report.passed) process.exitCode = 1
}
