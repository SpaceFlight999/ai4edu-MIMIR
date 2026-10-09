import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { activePlan, assessQuiz, confirmDraft, defaultProfile, initialState, makeDraft, sharePlan, templatePlan, validatePlanOutput, validateProfile, validateShare } from '../src/domain.mjs'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { parseModelJson } from '../src/model.mjs'
import { sharingCatalog } from '../src/sharing.mjs'
import { agentFixture } from './agent-fixture.mjs'

const fakeContext = { agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) }, llm: { prepareCall: async () => ({ config: {}, async *stream() { yield { type: 'text-delta', text: JSON.stringify(templatePlan(defaultProfile())) }; yield { type: 'finish', reason: { kind: 'stop' } } } }) } }
function setup(ctx = fakeContext) {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, agentFixture(ctx).context)
  const run = (operation, payload = {}, overrides = {}) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID(), ...overrides })
  return { store, service, run, close: () => { service.dispose(); store.close() } }
}
async function activate(run) { const generated = await run('generate', { profile: defaultProfile(), mode: 'template' }); return (await run('confirm', { planId: generated.result.id })).result }

test('configuration requires total 100 and valid depth/time/horizon', () => {
  assert.deepEqual(validateProfile(defaultProfile()), defaultProfile())
  assert.throws(() => validateProfile({ ...defaultProfile(), weights: { research: 0, competition: 0, gpa: 0, interest: 0 } }))
  assert.throws(() => validateProfile({ ...defaultProfile(), weeklyHours: Infinity }))
  assert.throws(() => validateProfile({ ...defaultProfile(), horizonWeeks: 3.5 }))
})
test('one-hour and single-direction budgets still yield valid executable plans', () => {
  for (const hours of [1, 1.25, 8, 40]) for (const weights of [defaultProfile().weights, { research: 100, competition: 0, gpa: 0, interest: 0 }, { research: 20, competition: 20, gpa: 20, interest: 40 }]) {
    const profile = validateProfile({ ...defaultProfile(), weeklyHours: hours, weights }), output = validatePlanOutput(templatePlan(profile), profile)
    for (const week of [1, 2]) assert.ok(output.tasks.filter((task) => task.week === week).reduce((sum, task) => sum + task.hours, 0) <= hours)
    assert.ok(output.tasks.every((task) => weights[task.area] > 0))
  }
})
test('generation is a candidate; cancel never changes the active plan', async () => {
  const t = setup()
  try { const current = await activate(t.run), candidate = await t.run('generate', { mode: 'template' }); assert.equal(activePlan(t.store.read()).id, current.id); await t.run('decline', { planId: candidate.result.id }); assert.equal(activePlan(t.store.read()).id, current.id) } finally { t.close() }
})
test('completed evidence persists across review, history and completion undo', async () => {
  const t = setup()
  try {
    const plan = await activate(t.run), task = plan.tasks[0]
    await t.run('evidence', { taskId: task.id, artifactText: '我记录了论文问题、方法、页码与局限。', reflection: '希望继续理解控制方法。', confidence: 3, mode: 'record' })
    await t.run('complete', { taskId: task.id, completed: true })
    await t.run('complete', { taskId: task.id, completed: false }); assert.equal(t.store.read().evidence[task.id].status, 'submitted')
    await t.run('complete', { taskId: task.id, completed: true })
    const reviewed = await t.run('review', { mode: 'template', advance: true }); await t.run('confirm', { planId: reviewed.result.id })
    const state = t.store.read(); assert.equal(activePlan(state).stage, 2); assert.equal(state.plans.find((p) => p.id === plan.id).status, 'historical'); assert.equal(state.evidence[task.id].status, 'completed')
    await assert.rejects(t.run('complete', { taskId: task.id, completed: true }), (error) => error.code === 'STALE_TASK')
  } finally { t.close() }
})
test('CAS prevents stale writes and idempotency prevents duplicate changes', async () => {
  const t = setup()
  try {
    const payload = { profile: defaultProfile(), version: 0, requestKey: randomUUID() }
    await t.service.execute('profile', payload); await t.service.execute('profile', payload); assert.equal(t.store.read().version, 1)
    await assert.rejects(t.service.execute('profile', { ...payload, profile: { ...payload.profile, name: 'different' } }), (error) => error.code === 'IDEMPOTENCY_MISMATCH')
    await assert.rejects(t.run('feedback', { message: '旧窗口', mode: 'record' }, { version: 0 }), (error) => error.code === 'VERSION_CONFLICT')
  } finally { t.close() }
})
test('model failure leaves all persistent state unchanged', async () => {
  const t = setup({ ...fakeContext, llm: { prepareCall: async () => { throw new Error('credential-private') } } })
  try {
    await activate(t.run); const before = t.store.read()
    await assert.rejects(t.run('review', { mode: 'model' }), (error) => error.code === 'MODEL_UNAVAILABLE' && !error.message.includes('credential-private'))
    assert.deepEqual(t.store.read(), before)
  } finally { t.close() }
})
test('model stream is used for a genuine candidate and malformed output is rejected', async () => {
  const t = setup()
  try { const result = await t.run('generate', { mode: 'model' }); assert.equal(result.result.mode, 'model'); assert.equal(result.result.model.provider, 'test'); assert.equal(t.store.read().activePlanId, null); assert.throws(() => parseModelJson('not JSON')) } finally { t.close() }
})
test('explicit cancellation stops a stalled model and prevents committing', async () => {
  const t = setup({ ...fakeContext, llm: { prepareCall: async () => new Promise(() => {}) } })
  try {
    const key = randomUUID(), pending = t.run('generate', { mode: 'model' }, { requestKey: key })
    await new Promise((resolve) => setTimeout(resolve, 10)); t.service.cancel(key)
    await assert.rejects(pending, (error) => error.code === 'CANCELLED'); assert.equal(t.store.read().version, 0)
  } finally { t.close() }
})
test('model budgets, resource references, prerequisites and zero-weight tasks are validated', () => {
  const profile = defaultProfile(), output = templatePlan(profile)
  assert.throws(() => validatePlanOutput({ ...output, tasks: [{ ...output.tasks[0], hours: 40 }] }, profile))
  assert.throws(() => validatePlanOutput({ ...output, tasks: output.tasks.map((task, i) => i === 0 ? { ...task, resourceId: 'invented-url' } : task) }, profile))
  assert.throws(() => validatePlanOutput({ ...output, tasks: output.tasks.map((task, i) => i === 0 ? { ...task, prerequisites: [0] } : task) }, profile))
  assert.throws(() => validatePlanOutput({ ...output, questions: 'invalid' }, profile))
  const reversed = [...output.tasks.slice(4), ...output.tasks.slice(0, 4)].map((task, i) => i === 4 ? { ...task, prerequisites: [0] } : task)
  assert.throws(() => validatePlanOutput({ ...output, tasks: reversed }, profile))
})
test('share excludes personal data and import adapts to a new budget without auto-activation', async () => {
  const t = setup()
  try {
    await activate(t.run); await t.run('feedback', { message: 'PRIVATE-CONVERSATION', mode: 'record' })
    const exported = t.service.export(); assert.equal(JSON.stringify(exported).includes('PRIVATE-CONVERSATION'), false); assert.equal('profile' in exported, false); validateShare(exported)
    const imported = await t.run('import', { template: exported, profile: { ...defaultProfile(), weeklyHours: 2 }, mode: 'template' })
    assert.ok(imported.result.tasks.reduce((sum, task) => sum + task.hours, 0) <= 4); assert.notEqual(t.store.read().activePlanId, imported.result.id)
  } finally { t.close() }
})
test('a stale candidate cannot replace a newer active plan', () => {
  const state = initialState(), a = makeDraft(state, templatePlan(state.profile)), b = makeDraft(state, templatePlan(state.profile)); confirmDraft(state, a.id); assert.throws(() => confirmDraft(state, b.id)); assert.equal(state.activePlanId, a.id)
})
test('robotics exercises provide checked answers and useful feedback', () => {
  assert.equal(assessQuiz('robot-kinematics', [1, 0]).correct, 2)
  const wrong = assessQuiz('robot-kinematics', [0, 2]); assert.equal(wrong.correct, 0); assert.match(wrong.feedback[0].text, /x/)
  assert.throws(() => assessQuiz('robot-kinematics', [999, 0]))
})
test('SQLite state can be reopened, without affecting another learner profile', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mimir-growth-test-'))
  try {
    const a = new GrowthStore(join(directory, 'a.sqlite')); a.mutate({ key: 'a', fingerprint: 'a', version: 0, kind: 'profile' }, (state) => { state.profile.name = 'student-a' }); a.close()
    const reopened = new GrowthStore(join(directory, 'a.sqlite')), b = new GrowthStore(join(directory, 'b.sqlite'))
    assert.equal(reopened.read().profile.name, 'student-a'); assert.equal(b.read().profile.name, ''); reopened.close(); b.close()
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('Star is idempotent, reversible and cannot invent popularity or reference missing plans', async () => {
  const t = setup()
  try {
    const id = 'robot-control'
    await t.run('star', { planId: id, starred: true })
    await t.run('star', { planId: id, starred: true })
    assert.deepEqual(t.store.read().starredPlanIds, [id])
    assert.equal(t.service.snapshot().sharingCatalog.find(plan => plan.id === id).starCount, 1)
    await t.run('star', { planId: id, starred: false })
    assert.deepEqual(t.store.read().starredPlanIds, [])
    await assert.rejects(t.run('star', { planId: 'missing', starred: true }))
  } finally { t.close() }
})

test('saving a shared plan whitelists fields, deduplicates and survives reopening with Stars', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mimir-sharing-test-'))
  let store, service
  try {
    const file = join(directory, 'growth.sqlite')
    store = new GrowthStore(file); service = createGrowthService(store, fakeContext)
    const run = (operation, payload) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() })
    const template = { ...sharingCatalog(store.read())[0].template, privateConversation: 'PRIVATE' }
    const a = await run('save-share', { template }), b = await run('save-share', { template })
    assert.equal(a.result.id, b.result.id); assert.equal(store.read().sharedPlans.length, 1)
    assert.ok(!JSON.stringify(store.read().sharedPlans).includes('PRIVATE'))
    await run('star', { planId: a.result.id, starred: true })
    service.dispose(); store.close(); store = new GrowthStore(file)
    assert.equal(sharingCatalog(store.read()).find(plan => plan.id === a.result.id).starred, true)
  } finally { service?.dispose(); store?.close(); rmSync(directory, { recursive: true, force: true }) }
})
