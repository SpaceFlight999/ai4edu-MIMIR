import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { initialState, makeDraft, confirmDraft, templatePlan } from '../src/domain.mjs'

const orderPlanChanges = runInNewContext(readFileSync(new URL('../client/daily.js', import.meta.url), 'utf8') + '\norderPlanChanges')
test('plan changes prioritize changed/new goals, learner weights and earlier weeks without mutating source', () => {
  const tasks = [{ id: 'new-low', area: 'interest', week: 1 }, { id: 'new-high-later', area: 'gpa', week: 2 }, { id: 'new-high-first', area: 'gpa', week: 1 }, { id: 'changed', area: 'interest', week: 2 }, { id: 'carried', area: 'gpa', week: 1 }]
  const changeSet = [{ taskId: 'carried', kind: 'continue' }, { previousTaskId: 'old', kind: 'defer' }, { taskId: 'new-low', kind: 'new' }, { taskId: 'new-high-later', kind: 'new' }, { taskId: 'new-high-first', kind: 'new' }, { taskId: 'changed', kind: 'replace' }]
  const draft = { tasks, profile: { weights: { gpa: 70, interest: 30 } }, changeSet }, before = structuredClone(draft)
  const actual = orderPlanChanges(draft, { tasks: [{ id: 'old', area: 'gpa', week: 1 }] })
  assert.deepEqual([...actual].map(change => change.taskId || change.previousTaskId), ['changed', 'new-high-first', 'new-high-later', 'new-low', 'carried', 'old'])
  assert.deepEqual(draft, before)
  assert.equal(orderPlanChanges({}, null).length, 0)
})

test('full reconfiguration starts on confirmation day and retains old history and evidence', () => {
  for (const source of ['generate', 'review', 'import']) {
    const state = initialState(), first = makeDraft(state, templatePlan(state.profile))
    confirmDraft(state, first.id, '2026-10-05T01:00:00.000Z')
    const oldTask = first.tasks[0], evidence = { artifactText: '已有成果', status: 'completed' }
    state.evidence[oldTask.id] = evidence
    const draft = makeDraft(state, templatePlan(state.profile), { source })
    assert.equal(first.startsAt, '2026-10-05T01:00:00.000Z')
    assert.equal(draft.startsAt, null)
    confirmDraft(state, draft.id, '2026-10-08T09:00:00.000Z')
    assert.equal(draft.startsAt, '2026-10-08T09:00:00.000Z')
    assert.equal(draft.checkInAt, '2026-10-15T09:00:00.000Z')
    assert.equal(draft.endsAt, '2026-10-22T09:00:00.000Z')
    assert.equal(first.status, 'historical')
    assert.equal(first.startsAt, '2026-10-05T01:00:00.000Z')
    assert.deepEqual(state.evidence[oldTask.id], evidence)
  }
})

test('course adjustments preserve the active stage dates; advancing a course starts a new stage', () => {
  for (const advance of [false, true]) {
    const state = initialState(), first = makeDraft(state, templatePlan(state.profile))
    confirmDraft(state, first.id, '2026-10-05T01:00:00.000Z')
    const draft = makeDraft(state, templatePlan(state.profile), { source: 'course-next', advance })
    confirmDraft(state, draft.id, '2026-10-08T09:00:00.000Z')
    assert.equal(draft.startsAt, advance ? '2026-10-08T09:00:00.000Z' : first.startsAt)
    assert.equal(draft.checkInAt, advance ? '2026-10-15T09:00:00.000Z' : first.checkInAt)
    assert.equal(draft.endsAt, advance ? '2026-10-22T09:00:00.000Z' : first.endsAt)
  }
})
