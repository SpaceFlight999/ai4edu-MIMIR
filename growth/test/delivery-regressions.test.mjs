import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService, GROWTH_VERSION } from '../src/host.mjs'
import { initialState, templatePlan, makeDraft, confirmDraft, sharePlan, validateShare, adaptShare } from '../src/domain.mjs'
import { buildCourseCandidate } from '../src/course-plan.mjs'

test('the backend reports the delivered package version', () => {
  assert.equal(GROWTH_VERSION, JSON.parse(readFileSync('growth/package.json')).version)
  const store = new GrowthStore(':memory:')
  const service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  try { assert.equal(service.snapshot().growthVersion, GROWTH_VERSION) }
  finally { service.dispose(); store.close() }
})

test('shared plan adaptation preserves and remaps prerequisites', () => {
  const state = initialState(), output = templatePlan(state.profile)
  output.tasks[1].prerequisites = [0]
  const draft = makeDraft(state, output); confirmDraft(state, draft.id)
  const shared = sharePlan(state), before = structuredClone(shared)
  assert.deepEqual(adaptShare(shared, state.profile).tasks[1].prerequisites, [0])
  assert.deepEqual(shared, before)
  const profile = { ...state.profile, weights: { research: 0, competition: 45, gpa: 45, interest: 10 } }
  const adapted = adaptShare(shared, profile)
  assert.ok(adapted.rationale.includes('重建'), 'a missing prerequisite rebuilds rather than silently lifting requirements')
})

test('sharing whitelists nested profile fields and roadmap data', () => {
  const state = initialState(), draft = makeDraft(state, templatePlan(state.profile)); confirmDraft(state, draft.id)
  const shared = sharePlan(state)
  shared.weights.privateNotes = 'PRIVATE-WEIGHTS'; shared.depths.privateNotes = 'PRIVATE-DEPTHS'
  shared.roadmap[0].privateNotes = 'PRIVATE-ROADMAP'; shared.tasks[0].privateNotes = 'PRIVATE-TASK'
  assert.ok(!JSON.stringify(validateShare(shared)).includes('PRIVATE-'))
})

test('export sanitizes legacy nested state without losing courses, custom topics, or prerequisites', () => {
  for (const custom of [false, true]) {
    const state = initialState()
    const choice = { id: 'custom-' + randomUUID(), label: '深入学习主题', title: '载荷验证', detail: '比较同一条件', source: 'https://example.org/notes' }
    if (custom) state.customChoices = [choice]
    const candidate = buildCourseCandidate(state, custom ? choice.id : 'mit-linear')
    const courseIndex = candidate.output.tasks.findIndex(task => task.courseRef)
    candidate.output.tasks[courseIndex].prerequisites = [0]
    const plan = makeDraft(state, candidate.output, candidate); confirmDraft(state, plan.id)
    plan.profile.weights.privateNotes = 'PRIVATE-WEIGHTS'
    plan.profile.depths.privateNotes = 'PRIVATE-DEPTHS'
    plan.roadmap[0].privateNotes = 'PRIVATE-ROADMAP'
    plan.tasks[courseIndex].courseRef.privateNotes = 'PRIVATE-COURSE-REF'
    plan.tasks[courseIndex].privateNotes = 'PRIVATE-TASK'
    if (custom) plan.tasks[courseIndex].studyChoice.privateNotes = 'PRIVATE-TOPIC'
    const before = structuredClone(state), exported = sharePlan(state)
    assert.ok(!JSON.stringify(exported).includes('PRIVATE-'), 'export itself must sanitize old persisted state')
    assert.equal(exported.title, plan.title)
    assert.equal(exported.summary, plan.summary)
    assert.equal(exported.horizonWeeks, plan.profile.horizonWeeks)
    assert.deepEqual(exported.weights, initialState().profile.weights)
    assert.deepEqual(exported.depths, initialState().profile.depths)
    const task = exported.tasks[courseIndex]
    assert.deepEqual(task.courseRef, { id: custom ? choice.id : 'mit-linear', variant: 'foundation' })
    assert.deepEqual(task.prerequisites, [0])
    assert.deepEqual(task.criteria, plan.tasks[courseIndex].criteria)
    assert.equal(task.objective, plan.tasks[courseIndex].objective)
    assert.equal(task.hours, plan.tasks[courseIndex].hours)
    assert.deepEqual(exported.roadmap[0], { title: plan.roadmap[0].title, outcome: plan.roadmap[0].outcome,
      fromWeek: plan.roadmap[0].fromWeek, toWeek: plan.roadmap[0].toWeek })
    if (custom) assert.deepEqual(task.studyChoice, choice)
    assert.deepEqual(validateShare(exported).tasks[courseIndex].prerequisites, [0])
    assert.deepEqual(state, before)
    task.criteria.push('只修改导出的副本')
    task.prerequisites.length = 0
    assert.deepEqual(state, before, 'editing the exported copy must not mutate the active plan')
  }
})

test('custom topic export/import keeps its approved definition and candidate confirmation boundary', async () => {
  const state = initialState()
  state.customChoices = [{ id: 'custom-' + randomUUID(), label: '深入学习主题', title: '载荷验证', detail: '比较同一条件', source: 'https://example.org/notes', privateNotes: 'PRIVATE-DEFINITION' }]
  const choice = state.customChoices[0], candidate = buildCourseCandidate(state, choice.id)
  const draft = makeDraft(state, candidate.output, candidate); confirmDraft(state, draft.id)
  const shared = sharePlan(state), safe = validateShare(shared)
  assert.equal(safe.tasks.find(task => task.courseRef?.id === choice.id).studyChoice.title, choice.title)
  assert.ok(!JSON.stringify(safe).includes('PRIVATE-DEFINITION'))
  const store = new GrowthStore(':memory:')
  const service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  try {
    const result = await service.execute('import', { template: shared, mode: 'template', version: 0, requestKey: randomUUID() })
    assert.equal(result.result.tasks.find(task => task.courseRef?.id === choice.id).studyChoice.title, choice.title)
    assert.equal(result.state.activePlanId, null)
  } finally { service.dispose(); store.close() }
  for (const source of ['javascript:alert(1)', 'https://user:password@example.org/']) {
    const bad = structuredClone(shared); bad.tasks.find(task => task.studyChoice).studyChoice.source = source
    assert.throws(() => validateShare(bad))
  }
})
