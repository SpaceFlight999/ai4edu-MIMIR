import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { chineseError } from '../overrides/paper/viewer/session.mjs'
import vm from 'node:vm'

// Import the complete shipped service, including its real contracts and SQLite
// transactions. The runtime directory supplies the existing package dependencies.
const modulePath = resolve('runtime/system/engine/node_modules/@mimir/dsh-workbench-bundle/host/.mimir-import-test-' + randomUUID() + '.mjs')
writeFileSync(modulePath, readFileSync('growth/overrides/host/index.js', 'utf8') + '\nexport { ResearchCore };\n')
let ResearchCore
try { ({ ResearchCore } = await import(pathToFileURL(modulePath).href)) }
finally { unlinkSync(modulePath) }

function fixture({ count = 1, content } = {}) {
  const directory = mkdtempSync(resolve('.test-data/workbench-import-'))
  const service = new ResearchCore({ databasePath: join(directory, 'documents.sqlite'), directory })
  const context = { projectId: randomUUID(), actorId: randomUUID(), channel: 'user-ui', permissions: ['document:read', 'document:write', 'proposal:write', 'proposal:authorize', 'proposal:apply', 'proposal:reject'] }
  const documentId = randomUUID(), blockId = randomUUID()
  service.createDocument(context, { documentId, projectId: context.projectId, schemaVersion: '0.1.0', version: 1, title: '导入验收', content: content ?? { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId }, content: [] }] }, annotations: [], referencedArtifactIds: [], updatedAt: new Date().toISOString() })
  const bytes = Buffer.from('Synthetic source'), paper = { paperId: randomUUID(), projectId: context.projectId, sourceSha256: createHash('sha256').update(bytes).digest('hex'), version: 1, parserVersion: 'fixture-v1', parseStatus: 'ready', title: '合成来源' }
  const evidence = Array.from({ length: count }, (_, i) => ({ ...paper, evidenceId: randomUUID(), page: i + 1, bbox: [0, 0, 1, 1], quote: 'Located source ' + i }))
  service.registerPaper(context, paper, bytes, evidence)
  const manifest = evidence.map(e => ({ ...e, citationId: paper.paperId + '::' + e.evidenceId, paperVersion: 1, trust: 'host' }))
  const research = { paper: () => paper, evidence: () => evidence }
  const input = { projectId: context.projectId, runId: randomUUID(), documentId, expectedVersion: 1, evidenceManifest: manifest, draft: { kind: 'draft', synthesis: { draft: [{ text: '研究正文，保留原始条件。', kind: 'model_inference', evidenceIds: manifest.map(e => e.citationId) }], comparisons: [], gaps: [] } } }
  const publish = () => service.proposeResearchDraft(context, input, research)
  const accept = proposal => service.apply(context, { changeSetId: proposal.changeSetId, grantId: service.authorize(context, proposal.changeSetId).grantId, expectedVersion: proposal.baseVersion, requestId: randomUUID(), idempotencyKey: randomUUID() })
  return { service, directory, context, documentId, input, paper, evidence, research, publish, accept }
}

test('a rejected research import can be submitted again, while pending retries remain idempotent', () => {
  const f = fixture()
  try {
    const original = f.service.load(f.context, f.documentId)
    let previous
    for (let i = 0; i < 3; i++) {
      const proposal = f.publish()
      assert.notEqual(proposal.changeSetId, previous)
      assert.equal(proposal.status, 'proposed')
      assert.equal(f.publish().changeSetId, proposal.changeSetId)
      f.service.reject(f.context, proposal.changeSetId)
      previous = proposal.changeSetId
    }
    assert.deepEqual(f.service.load(f.context, f.documentId), original)
    const proposal = f.publish(), accepted = f.accept(proposal)
    assert.equal(accepted.version, 2)
    assert.equal(f.publish().status, 'applied', 'return persisted status rather than the original proposed snapshot')
    assert.equal(f.service.listProposals(f.context, f.documentId).length, 4)
  } finally { f.service.close() }
})

test('multi-paper drafts retain more than twenty verified citations through proposal and acceptance', () => {
  const f = fixture({ count: 25 })
  try {
    const proposal = f.publish()
    assert.equal(proposal.evidenceIds.length, 25)
    f.accept(proposal)
    assert.equal(f.service.listCitations(f.context, f.documentId).length, 25)
    f.evidence[24].quote = 'Changed source'
    assert.throws(f.publish, error => error.code === 'VERSION_CONFLICT')
  } finally { f.service.close() }
})

for (const [label, content] of [
  ['empty document', { type: 'doc', content: [] }],
  ['rich paragraphs', { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: randomUUID(), textAlign: 'center' }, content: [{ type: 'text', text: '原有加粗正文', marks: [{ type: 'bold' }] }] }] }],
  ['nested list', { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: '列表原文' }] }] }] }] }]
  ,['table at the end', { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: '表格前的段落' }] }, { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', attrs: { blockId: randomUUID() }, content: [{ type: 'text', text: '表格数据' }] }] }] }] }] }]
]) {
  test('imports append safely to ' + label + ' only after acceptance', () => {
    const f = fixture({ content })
    try {
      const original = f.service.load(f.context, f.documentId), proposal = f.publish()
      assert.deepEqual(f.service.load(f.context, f.documentId), original)
      const updated = f.accept(proposal)
      assert.deepEqual(updated.content.content.slice(0, content.content.length), content.content)
      assert.equal(updated.content.content.length, content.content.length + 1)
      assert.match(updated.content.content.at(-1).content[0].text, /研究正文/)
      assert.equal(f.service.listCitations(f.context, f.documentId).length, 1)
    } finally { f.service.close() }
  })
}

test('paper imports use the same safe fallback, preserve retries, and reject stale targets and cross-project evidence', () => {
  const f = fixture({ content: { type: 'doc', content: [] } })
  try {
    const input = { paperId: f.paper.paperId, documentId: f.documentId, expectedVersion: 1, text: '论文导读正文', evidenceIds: [f.evidence[0].evidenceId], requestId: randomUUID(), idempotencyKey: randomUUID() }
    const proposal = f.service.proposePaperNote(f.context, input)
    assert.equal(f.service.proposePaperNote(f.context, input).changeSetId, proposal.changeSetId)
    const updated = f.accept(proposal)
    assert.equal(f.service.proposePaperNote(f.context, input).status, 'applied')
    assert.match(updated.content.content[0].content[0].text, /原文引文：Located source 0/)
    assert.throws(() => f.service.proposePaperNote(f.context, { ...input, idempotencyKey: randomUUID() }), e => e.code === 'VERSION_CONFLICT')
    assert.throws(() => f.service.proposePaperNote({ ...f.context, projectId: randomUUID() }, { ...input, idempotencyKey: randomUUID() }), e => e.code === 'INVALID_ARGUMENT' || e.code === 'SCOPE_DENIED')
  } finally { f.service.close() }
})

for (const legacy of [false, true]) {
  test((legacy ? 'legacy replacement' : 'append paragraph') + ' proposals survive reopening, with existing pending approvals intact', () => {
    const f = fixture(legacy ? {} : { content: { type: 'doc', content: [] } })
    const proposal = f.publish()
    if (legacy) f.service.db.exec('ALTER TABLE proposals DROP COLUMN operation_kind')
    f.service.close()
    const reopened = new ResearchCore({ databasePath: join(f.directory, 'documents.sqlite'), directory: f.directory })
    try {
      assert.deepEqual(reopened.proposal(f.context, proposal.changeSetId), proposal)
      const grant = reopened.authorize(f.context, proposal.changeSetId)
      const saved = reopened.apply(f.context, { changeSetId: proposal.changeSetId, grantId: grant.grantId, expectedVersion: 1, requestId: randomUUID(), idempotencyKey: randomUUID() })
      assert.equal(saved.version, 2)
      assert.match(JSON.stringify(saved.content), /研究正文/)
    } finally { reopened.close() }
  })
}

test('append proposals cannot apply without approval, after a concurrent edit, or with a changed operation', () => {
  const f = fixture({ content: { type: 'doc', content: [] } })
  try {
    const proposal = f.publish()
    assert.throws(() => f.service.apply(f.context, { changeSetId: proposal.changeSetId, grantId: randomUUID(), expectedVersion: 1, requestId: randomUUID(), idempotencyKey: randomUUID() }), e => e.code === 'APPROVAL_REQUIRED')
    const grant = f.service.authorize(f.context, proposal.changeSetId)
    f.service.db.prepare("UPDATE proposals SET operation_kind='replaceBlockText' WHERE change_set_id=?").run(proposal.changeSetId)
    assert.throws(() => f.service.authorize(f.context, proposal.changeSetId), e => e.code === 'APPROVAL_REQUIRED')
    f.service.db.prepare("UPDATE proposals SET operation_kind='appendParagraph' WHERE change_set_id=?").run(proposal.changeSetId)
    f.service.save(f.context, { documentId: f.documentId, expectedVersion: 1, content: { type: 'doc', content: [] }, annotations: [], requestId: randomUUID(), idempotencyKey: randomUUID() })
    assert.throws(() => f.service.apply(f.context, { changeSetId: proposal.changeSetId, grantId: grant.grantId, expectedVersion: 1, requestId: randomUUID(), idempotencyKey: randomUUID() }), e => e.code === 'VERSION_CONFLICT')
    assert.equal(f.service.load(f.context, f.documentId).content.content.length, 0)
  } finally { f.service.close() }
})

test('workbench client validates appended paragraphs and rejects malformed operations without throwing', () => {
  const bundle = readFileSync('growth/overrides/workbench/client.js', 'utf8')
  const start = bundle.indexOf('function Phe('), end = bundle.indexOf('function Hhe(', start)
  const validate = vm.runInNewContext(bundle.slice(start, end) + ';Phe', { Ns: v => v && typeof v === 'object', kr: v => typeof v === 'string', $c: Number.isSafeInteger, an: v => typeof v === 'string', YB: v => typeof v === 'string', JB: Array.isArray, B7: v => typeof v === 'string' })
  const row = { changeSetId: 'proposal', projectId: 'project', documentId: 'document', baseVersion: 1, operations: [{ kind: 'appendParagraph', blockId: 'block', before: '', after: '正文' }], diffHash: 'hash', reason: '', evidenceIds: [], status: 'proposed', createdAt: 'time' }
  assert.equal(validate(row), true)
  for (const after of [null, undefined, {}, 42, '  ']) assert.equal(validate({ ...row, operations: [{ ...row.operations[0], after }] }), false)
  assert.equal(validate({ ...row, operations: [{ ...row.operations[0], before: 'unexpected' }] }), false)
})

test('import failures describe the import rather than asking users to regenerate a completed draft', () => {
  assert.match(chineseError({ workbenchImport: true, code: 'INVALID_ARGUMENT', message: '研究内容最多 400000 字 (INVALID_ARGUMENT)' }), /400000 字/)
  assert.doesNotMatch(chineseError({ workbenchImport: true, code: 'SCOPE_DENIED' }), /重新生成/)
})
