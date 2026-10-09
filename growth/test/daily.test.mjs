import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'

function client(storage = new Map()) {
  const context = vm.createContext({ Date, crypto: { randomUUID }, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
  vm.runInContext(readFileSync(new URL('../client/daily.js', import.meta.url), 'utf8'), context)
  return context
}
const draft = () => ({ step: 1, workIndex: 0, minutes: 10, scopeStart: 0, fields: { prediction: '我的判断' }, form: { artifactText: '草稿', reflection: '', confidence: 3 }, answers: [-1, 0], choice: '', answer: '', focus: 'concept' })

test('browser backup survives a fresh page context and is isolated by plan and task', () => {
  const storage = new Map(), first = client(storage)
  const at = first.writeLearningDraft('plan-a', 'task-a', draft(), '2026-10-06T00:00:00Z')
  const second = client(storage)
  assert.ok(at); assert.equal(second.readLearningDraft('plan-a', 'task-a').data.fields.prediction, '我的判断')
  assert.equal(second.readLearningDraft('plan-b', 'task-a'), null)
  assert.equal(second.readLearningDraft('plan-a', 'task-b'), null)
  second.removeLearningDraft('plan-a', 'task-a'); assert.equal(storage.size, 0)
})
test('invalid, expired and unavailable browser storage never prevents opening learning', () => {
  const storage = new Map(), context = client(storage), key = context.draftKey('a', 'b')
  for (const value of ['broken json', JSON.stringify({ planId: 'a', taskId: 'b', at: 'bad' }), JSON.stringify({ planId: 'a', taskId: 'b', at: '2020-01-01', data: draft() }), JSON.stringify({ planId: 'a', taskId: 'b', at: new Date().toISOString(), data: { ...draft(), fields: { x: 5 } } })]) {
    storage.set(key, value); assert.equal(context.readLearningDraft('a', 'b'), null)
  }
  vm.runInContext("localStorage.setItem = () => { throw new Error('quota'); }; localStorage.getItem = () => { throw new Error('restricted'); };", context)
  assert.equal(context.writeLearningDraft('a', 'b', draft(), ''), null)
  assert.equal(context.readLearningDraft('a', 'b'), null)
})
test('home continuation prefers the newest current task and excludes completed and historical backups', () => {
  const context = client(), plan = { id: 'active', tasks: [{ id: 'one' }, { id: 'two' }, { id: 'done' }] }
  context.writeLearningDraft('active', 'two', draft(), '')
  context.writeLearningDraft('historical', 'one', draft(), '')
  context.writeLearningDraft('active', 'done', draft(), '')
  const state = { learningSessions: { one: { at: '2026-10-06T00:00:00Z' } }, evidence: { done: { status: 'completed' } } }
  const result = context.learningResume(plan, state)
  assert.equal(result.length, 2); assert.equal(result[0].task.id, 'two'); assert.equal(result[1].task.id, 'one')
})
test('10, 20 and 40 minute actions cover one, two and three remaining blocks without wrapping', () => {
  const context = client(), blocks = ['read', 'practice', 'explain']
  assert.equal(context.learningScope(blocks, 0, 10).join(','), 'read')
  assert.equal(context.learningScope(blocks, 0, 20).join(','), 'read,practice')
  assert.equal(context.learningScope(blocks, 0, 40).join(','), 'read,practice,explain')
  assert.equal(context.learningScope(blocks, 2, 40).join(','), 'explain')
})
test('independent page backups survive another page saving, even when saved records are newer', () => {
  const context = client(), original = draft(), second = { ...draft(), fields: { prediction: '另一页的输入' } }
  context.writeLearningDraft('p', 't', original, '2026-10-06T00:00:00Z', 'page-a')
  context.writeLearningDraft('p', 't', second, '2026-10-06T00:00:00Z', 'page-b')
  context.removeLearningDraft('p', 't', 'page-b')
  assert.equal(context.readLearningDraft('p', 't').data.fields.prediction, original.fields.prediction)
  const resumes = context.learningResume({ id: 'p', tasks: [{ id: 't' }] }, { learningSessions: { t: { at: new Date(Date.now() + 5000).toISOString() } }, evidence: {} })
  assert.ok(resumes[0].local, 'A newer server time is not proof that independent edits were saved')
})
test('copied browser sessions still get independent document owners and acknowledged content leaves different edits intact', () => {
  const storage = new Map(), a = client(storage), b = client(storage)
  assert.equal(a.draftOwner(), a.draftOwner()); assert.notEqual(a.draftOwner(), b.draftOwner())
  const original = draft(), changed = { ...draft(), answer: '后来继续写的内容' }
  a.writeLearningDraft('p', 't', original, '', a.draftOwner())
  b.writeLearningDraft('p', 't', changed, '', b.draftOwner())
  a.acknowledgeLearningDrafts('p', 't', original)
  assert.equal(a.readLearningDraft('p', 't').data.answer, changed.answer)
})
test('recovery actions distinguish lost connection, version conflicts, model failure and incomplete coursework', () => {
  const context = client()
  assert.equal(context.recoveryFor('TRANSPORT').retry, true)
  assert.equal(context.recoveryFor('VERSION_CONFLICT').retry, undefined)
  assert.equal(context.recoveryFor('VERSION_CONFLICT').refresh, true)
  assert.equal(context.recoveryFor('MODEL_UNAVAILABLE').record, true)
  assert.equal(context.recoveryFor('COURSE_INCOMPLETE').record, undefined)
})
test('catalog search matches names and compound keywords and returns genuinely empty results', () => {
  const context = client(), course = { title: 'Python 程序设计', provider: 'MIT' }, text = item => item.title + ' ' + item.provider
  assert.equal(context.optionMatches(course, ' python MIT ', text), true)
  assert.equal(context.optionMatches(course, '不存在的课', text), false)
  assert.equal(context.optionMatches(course, ' ', text), true)
})
test('legacy exercise drafts retain ungraded choices; invalid options and historical writes cannot commit', async () => {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  const run = (op, payload) => service.execute(op, { ...payload, version: store.read().version, requestKey: randomUUID() })
  try {
    const created = await run('generate', { mode: 'template' }), plan = (await run('confirm', { planId: created.result.id })).result
    const task = plan.tasks.find(item => item.resourceId === 'robot-kinematics'), payload = { taskId: task.id, step: 1, workIndex: 1, minutes: 20, fields: {}, quizAnswers: [-1, 1] }
    await run('learning', payload)
    assert.deepEqual(store.read().learningSessions[task.id].quizAnswers, [-1, 1]); assert.equal(store.read().evidence[task.id], undefined)
    const before = store.read(); await assert.rejects(run('learning', { ...payload, quizAnswers: [9, 1] })); assert.deepEqual(store.read(), before)
    const revised = await run('review', { mode: 'template', advance: true }); await run('confirm', { planId: revised.result.id })
    await assert.rejects(run('learning', payload), error => error.code === 'STALE_TASK')
  } finally { service.dispose(); store.close() }
})
