import {normalizeWorkbenchImport} from '../overrides/host/workbench-import-format.mjs';
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync, mkdirSync, writeFileSync, existsSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { mkdir, realpath } from 'node:fs/promises'
const source = readFileSync('growth/overrides/host/index.js', 'utf8')
class DocumentError extends Error { constructor(code, message) { super(message); this.code = code } }
function core() {
  const directory = mkdtempSync(resolve('.test-data/paper-removal-'))
  class DocumentService {
    constructor() {
      this.db = new DatabaseSync(':memory:')
      this.db.exec('PRAGMA foreign_keys=ON; CREATE TABLE documents(document_id TEXT PRIMARY KEY,project_id TEXT,referenced_artifact_ids_json TEXT); CREATE TABLE proposals(project_id TEXT,evidence_ids_json TEXT);')
    }
    transaction(work) { this.db.exec('BEGIN'); try { const result = work(); this.db.exec('COMMIT'); return result } catch (error) { this.db.exec('ROLLBACK'); throw error } }
  }
  const start = source.indexOf('var sha ='), end = source.indexOf('// src/agent-tools.js', start)
  const ResearchCore = vm.runInNewContext(source.slice(start, end) + '\nResearchCore', {
    normalizeWorkbenchImport, DocumentService, DocumentError, createHash2: createHash, existsSync, mkdirSync, readFileSync, writeFileSync,
    unlinkResearchAsset: unlinkSync, join, contextFor(context) { if (!context.permissions.includes('document:write')) throw new DocumentError('SCOPE_DENIED', 'write denied') }
  })
  const service = new ResearchCore({ directory }), context = { projectId: randomUUID(), permissions: ['document:write'] }
  function paper(label) {
    const bytes = Buffer.from('synthetic-' + label), sourceSha256 = createHash('sha256').update(bytes).digest('hex')
    const paper = { paperId: randomUUID(), projectId: context.projectId, sourceSha256, title: label, version: 1, parseStatus: 'ready', parserVersion: 'fixture' }
    const row = { ...paper, evidenceId: randomUUID(), page: 1, quote: 'Synthetic fact ' + label, bbox: [0, 0, 1, 1] }
    service.registerPaper(context, paper, bytes, [row])
    return { paper, bytes, evidenceId: service.db.prepare('SELECT evidence_id FROM research_evidence WHERE artifact_id=?').get(paper.paperId).evidence_id }
  }
  return { service, context, paper, directory }
}
test('unreferenced paper removal deletes only its evidence and managed copy', () => {
  const f = core()
  try {
    const first = f.paper('first'), second = f.paper('second')
    const result = f.service.deletePaper(f.context, first.paper.paperId)
    assert.equal(f.service.cleanupPaperCopy(f.context, result.sourceSha256), true)
    assert.equal(existsSync(join(f.directory, 'assets', first.paper.sourceSha256 + '.pdf')), false)
    assert.deepEqual(readFileSync(join(f.directory, 'assets', second.paper.sourceSha256 + '.pdf')), second.bytes)
    assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM research_assets').get().n, 1)
    assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM research_evidence').get().n, 1)
  } finally { f.service.db.close() }
})
test('citation, proposal, document references and project ownership each protect removal', () => {
  for (const kind of ['citation', 'proposal', 'document', 'scope']) {
    const f = core()
    try {
      const { paper, evidenceId } = f.paper(kind)
      if (kind === 'citation') {
        const id = randomUUID(); f.service.db.prepare('INSERT INTO documents VALUES(?,?,?)').run(id, f.context.projectId, '[]')
        f.service.db.prepare('INSERT INTO document_citations VALUES(?,?,?,?,?)').run(id, f.context.projectId, randomUUID(), evidenceId, new Date().toISOString())
      }
      if (kind === 'proposal') f.service.db.prepare('INSERT INTO proposals VALUES(?,?)').run(f.context.projectId, JSON.stringify([evidenceId]))
      if (kind === 'document') f.service.db.prepare('INSERT INTO documents VALUES(?,?,?)').run(randomUUID(), f.context.projectId, JSON.stringify([paper.paperId]))
      const context = kind === 'scope' ? { ...f.context, projectId: randomUUID() } : f.context
      assert.throws(() => f.service.deletePaper(context, paper.paperId), error => error.code === (kind === 'scope' ? 'SCOPE_DENIED' : 'PAPER_IN_USE'))
      assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM research_assets').get().n, 1)
      assert.equal(existsSync(join(f.directory, 'assets', paper.sourceSha256 + '.pdf')), true)
    } finally { f.service.db.close() }
  }
})
test('script cancellation acknowledgement waits for the owned execution to finish', async () => {
  const start = source.indexOf('var ToolService ='), end = source.indexOf('// src/workspace-files.js', start)
  const ToolService = vm.runInNewContext(source.slice(start, end) + '\nToolService', { resolve4: resolve, join5: join, AbortController, AbortSignal, ExecutionError: DocumentError, PythonRuntime: class {} })
  const service = new ToolService({ files: { root: resolve('.test-data') }, pythonRoot: resolve('runtime') })
  const id = randomUUID(), controller = new AbortController()
  let finish, acknowledged = false
  const done = new Promise(resolveDone => { finish = resolveDone })
  service.executions.set(id, { controller, done })
  const pending = service.run({ operation: 'runtime.cancel', executionId: id }).then(value => { acknowledged = true; return value })
  await Promise.resolve()
  assert.equal(controller.signal.aborted, true)
  assert.equal(acknowledged, false)
  finish()
  assert.equal((await pending).cancelled, true)
  assert.equal((await service.run({ operation: 'runtime.cancel', executionId: randomUUID() })).cancelled, false)
  await assert.rejects(service.run({ operation: 'runtime.cancel', executionId: '../other' }), /任务编号/)
})
test('actual local process cancellation settles only after its process exits', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(resolve('.test-data/process-stop-'))
  const start = source.indexOf('var MAX_TIMEOUT_MS ='), end = source.indexOf('// ../latex-local/src/index.js', start)
  assert.ok(start >= 0 && end > start)
  const runLocal = vm.runInNewContext(source.slice(start, end) + '\nrunLocal', {
    spawn, mkdir2: mkdir, realpath, resolve, relative, isAbsolute, process, Buffer, setTimeout, clearTimeout,
    localBinaryStat: () => { throw new Error('not needed for powershell') }, join5: join
  })
  const controller = new AbortController()
  const pending = runLocal({ runtime: 'powershell', code: '[System.IO.File]::WriteAllText("started.txt", [string]$PID); Start-Sleep -Seconds 10; [System.IO.File]::WriteAllText("late.txt", "late")', workspace: directory, signal: controller.signal })
  const started = join(directory, 'started.txt'), endWait = Date.now() + 7000
  while (!existsSync(started) && Date.now() < endWait) await new Promise(done => setTimeout(done, 50))
  assert.equal(existsSync(started), true)
  const pid = Number(readFileSync(started, 'utf8'))
  controller.abort()
  await assert.rejects(pending, error => error.code === 'CANCELLED')
  assert.throws(() => process.kill(pid, 0))
  assert.equal(existsSync(join(directory, 'late.txt')), false)
})
