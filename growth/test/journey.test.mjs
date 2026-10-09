import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { initialState, defaultProfile, templatePlan, makeDraft, confirmDraft } from '../src/domain.mjs'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { journeyModelContext, journeysForState, migrateJourneyState } from '../src/journey.mjs'
import { agentFixture } from './agent-fixture.mjs'

const context = { agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) } }
function setup() {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, context)
  const run = (operation, payload = {}) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() })
  return { store, service, run, close() { service.dispose(); store.close() } }
}
async function activate(run) {
  const generated = await run('generate', { mode: 'template', profile: defaultProfile() })
  return (await run('confirm', { planId: generated.result.id })).result
}

test('additive journey migration preserves legacy data and persists missing maps without a version change', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mimir-journey-migration-'))
  let store
  try {
    const path = join(directory, 'growth.sqlite'), legacy = initialState()
    delete legacy.journeyFocus; delete legacy.journeyChecklist; delete legacy.journeyObstacles
    legacy.version = 17; legacy.profile.name = 'legacy-student'; legacy.unknownField = { preserve: true }
    assert.deepEqual(migrateJourneyState(legacy), { ...legacy, journeyFocus: {}, journeyChecklist: {}, journeyObstacles: {} })
    store = new GrowthStore(path)
    store.db.prepare('UPDATE state SET value = ? WHERE id = 1').run(JSON.stringify(legacy))
    store.close(); store = new GrowthStore(path)
    const persisted = JSON.parse(store.db.prepare('SELECT value FROM state WHERE id = 1').get().value)
    assert.deepEqual(persisted, { ...legacy, journeyFocus: {}, journeyChecklist: {}, journeyObstacles: {}, learningSessions: {}, knowledgeSelfReport: {}, coursePractice: {}, competitionWorkspaces: {}, researchDigests: {}, roboticsSessions: {}, studySessions: {} })
    assert.equal(persisted.version, 17)
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }) }
})

test('knowledge map includes only relevant confirmed-plan resources and aggregates recorded task status', () => {
  const state = initialState(), profile = { ...defaultProfile(), weights: { research: 0, competition: 0, gpa: 100, interest: 0 } }
  const plan = makeDraft(state, templatePlan(profile), { profile, mode: 'template' })
  assert.deepEqual(journeysForState(state), {})
  confirmDraft(state, plan.id)
  let map = journeysForState(state)[plan.id]
  assert.equal(map.nodes.length, 3); assert.ok(map.nodes.every(node => node.area === 'gpa' && node.status === 'pending'))
  assert.ok(map.links.every(link => link.kind === 'concept' && map.nodes.some(node => node.id === link.from) && map.nodes.some(node => node.id === link.to)))
  state.evidence[plan.tasks[0].id] = { status: 'completed' }
  map = journeysForState(state)[plan.id]
  assert.ok(map.nodes.every(node => node.status === 'submitted'))
  state.evidence[plan.tasks[1].id] = { status: 'completed' }
  assert.ok(journeysForState(state)[plan.id].nodes.every(node => node.status === 'completed'))
  state.evidence[plan.tasks[0].id].status = 'submitted'
  assert.ok(journeysForState(state)[plan.id].nodes.every(node => node.status === 'submitted'))
  assert.ok(map.nodes.every(node => !('mastery' in node) && !('score' in node)))
})

test('focus, personal checklist and obstacles persist independently; checklist cannot complete a task', async () => {
  const t = setup()
  try {
    const plan = await activate(t.run), task = plan.tasks[0]
    await t.run('focus-task', { taskId: task.id })
    for (let index = 0; index < task.criteria.length; index++) await t.run('check-criterion', { taskId: task.id, index, checked: true })
    await t.run('task-obstacle', { taskId: task.id, reason: 'concept', note: '还分不清假设和结论。' })
    let state = t.service.snapshot()
    assert.equal(state.journeyFocus[plan.id], task.id)
    assert.equal(state.journeyChecklist[task.id][0], true)
    assert.equal(state.journeyObstacles[task.id].reason, 'concept')
    assert.equal(state.evidence[task.id], undefined)
    assert.equal(state.journeys[plan.id].taskStatus[task.id], 'pending')
    await assert.rejects(t.run('complete', { taskId: task.id, completed: true }))
    await t.run('check-criterion', { taskId: task.id, index: 0, checked: false })
    await t.run('task-obstacle', { taskId: task.id, reason: null })
    await t.run('focus-task', { taskId: null })
    state = t.service.snapshot()
    assert.equal(state.journeyChecklist[task.id][0], false)
    assert.equal(state.journeyFocus[plan.id], null)
    assert.equal(state.journeyObstacles[task.id], undefined)
    await t.run('evidence', { taskId: task.id, artifactText: '问题、方法和原文页码已记录。', reflection: '', confidence: 3, mode: 'record' })
    await t.run('complete', { taskId: task.id, completed: true })
    assert.equal(t.service.snapshot().journeys[plan.id].taskStatus[task.id], 'completed')
  } finally { t.close() }
})

test('journey references, checkbox types and obstacle text reject invalid and historical writes atomically', async () => {
  const t = setup()
  try {
    await assert.rejects(t.run('focus-task', { taskId: null }), error => error.code === 'STALE_TASK')
    const plan = await activate(t.run), task = plan.tasks[0]
    const invalid = [
      ['focus-task', { taskId: 'missing' }],
      ['check-criterion', { taskId: task.id, index: -1, checked: true }],
      ['check-criterion', { taskId: task.id, index: task.criteria.length, checked: true }],
      ['check-criterion', { taskId: task.id, index: 0.5, checked: true }],
      ['check-criterion', { taskId: task.id, index: 0, checked: 'true' }],
      ['task-obstacle', { taskId: task.id, reason: 'unknown' }],
      ['task-obstacle', { taskId: task.id, reason: 'time', note: 'x'.repeat(1001) }],
    ]
    const before = t.store.read()
    for (const [operation, payload] of invalid) await assert.rejects(t.run(operation, payload))
    assert.deepEqual(t.store.read(), before)
    await t.run('focus-task', { taskId: task.id })
    await t.run('check-criterion', { taskId: task.id, index: 0, checked: true })
    const draft = await t.run('review', { mode: 'template', advance: true })
    await t.run('confirm', { planId: draft.result.id })
    for (const [operation, payload] of [['focus-task', { taskId: task.id }], ['check-criterion', { taskId: task.id, index: 0, checked: false }], ['task-obstacle', { taskId: task.id, reason: 'other' }]]) {
      await assert.rejects(t.run(operation, payload), error => error.code === 'STALE_TASK')
    }
    assert.ok(t.service.snapshot().journeys[plan.id])
    assert.equal(t.store.read().journeyFocus[plan.id], task.id)
    assert.equal(t.store.read().journeyChecklist[task.id][0], true)
  } finally { t.close() }
})

test('checked goals do not bypass prerequisite completion requirements', async () => {
  const t = setup()
  try {
    const state = initialState(), output = templatePlan(state.profile)
    output.tasks[1].prerequisites = [0]
    const plan = makeDraft(state, output, { mode: 'template' }); confirmDraft(state, plan.id)
    t.store.db.prepare('UPDATE state SET value = ? WHERE id = 1').run(JSON.stringify(state))
    const task = plan.tasks[1]
    for (let index = 0; index < task.criteria.length; index++) await t.run('check-criterion', { taskId: task.id, index, checked: true })
    await t.run('evidence', { taskId: task.id, artifactText: '有了接口和异常处理说明。', reflection: '', confidence: 3, mode: 'record' })
    await assert.rejects(t.run('complete', { taskId: task.id, completed: true }))
    assert.equal(t.store.read().evidence[task.id].status, 'submitted')
    const prerequisite = plan.tasks[0]
    await t.run('evidence', { taskId: prerequisite.id, artifactText: '记录了问题、方法与页码。', reflection: '', confidence: 3, mode: 'record' })
    await t.run('complete', { taskId: prerequisite.id, completed: true })
    await t.run('complete', { taskId: task.id, completed: true })
    assert.equal(t.store.read().evidence[task.id].status, 'completed')
  } finally { t.close() }
})

test('journey interactions survive SQLite reopening and repeated requests remain idempotent', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mimir-journey-persistence-'))
  let store, service
  try {
    const path = join(directory, 'growth.sqlite')
    store = new GrowthStore(path); service = createGrowthService(store, context)
    const run = (operation, payload) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() })
    const plan = await activate(run), task = plan.tasks[0]
    const request = { taskId: task.id, index: 0, checked: true, version: store.read().version, requestKey: randomUUID() }
    await service.execute('check-criterion', request)
    const expectedVersion = store.read().version
    await service.execute('check-criterion', request)
    assert.equal(store.read().version, expectedVersion)
    await run('focus-task', { taskId: task.id }); await run('task-obstacle', { taskId: task.id, reason: 'resource', note: '需要先选一篇论文。' })
    const before = store.read()
    service.dispose(); store.close(); store = new GrowthStore(path); service = createGrowthService(store, context)
    assert.deepEqual(store.read(), before)
    assert.equal(service.snapshot().journeys[plan.id].taskStatus[task.id], 'pending')
  } finally { service?.dispose(); store?.close(); rmSync(directory, { recursive: true, force: true }) }
})

test('model generation and feedback receive filtered current-plan self-reports', async () => {
  const captured = [], ctx = { ...context, llm: { prepareCall: async () => ({ config: {}, async *stream(input) {
    captured.push(JSON.parse(input.messages[0].content[0].text))
    yield { type: 'text-delta', text: input.system.includes('只返回JSON') ? JSON.stringify(templatePlan(defaultProfile())) : '先澄清困难，再选择下一步。' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } }) } }
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, agentFixture(ctx).context)
  const run = (operation, payload) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() })
  try {
    const plan = await activate(run), task = plan.tasks[0]
    await run('check-criterion', { taskId: task.id, index: 0, checked: true })
    await run('task-obstacle', { taskId: task.id, reason: 'concept', note: '不知道如何判断局限。' })
    await run('focus-task', { taskId: task.id })
    store.mutate({ key: randomUUID(), fingerprint: 'unrelated-test', version: store.read().version, kind: 'test' }, state => {
      state.journeyObstacles['unrelated-task'] = { reason: 'other', note: 'PRIVATE-UNRELATED' }
      state.journeyFocus['unrelated-plan'] = 'unrelated-task'
    })
    const filtered = journeyModelContext(store.read(), plan)
    assert.equal(filtered.focusedTaskId, task.id)
    assert.deepEqual(filtered.tasks[0].checkedCriteria, [task.criteria[0]])
    assert.equal(JSON.stringify(filtered).includes('PRIVATE-UNRELATED'), false)
    await run('review', { mode: 'model', advance: true })
    await run('feedback', { mode: 'model', message: '我卡在论文局限分析上。' })
    assert.equal(captured.length, 2)
    for (const payload of captured) {
      assert.deepEqual(payload.journey, filtered)
      assert.equal(JSON.stringify(payload).includes('PRIVATE-UNRELATED'), false)
    }
  } finally { service.dispose(); store.close() }
})
