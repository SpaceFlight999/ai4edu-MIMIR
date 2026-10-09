import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { CORE_COURSES } from '../src/core-courses.mjs'
import { COURSES, COURSE_VARIANTS, courseUnit } from '../src/course-catalog.mjs'
import { curriculumSearch } from '../src/curriculum.mjs'
const xml = '<feed><entry><id>http://arxiv.org/abs/2609.12345v1</id><title>Robot sensor processing</title><published>2026-09-30T12:00:00Z</published><updated>2026-10-01T00:00:00Z</updated><summary>Synthetic abstract</summary></entry></feed>'
function setup(fetcher) {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } }, { researchFetch: fetcher })
  return { store, service, run: (op, payload) => service.execute(op, { ...payload, version: store.read().version, requestKey: randomUUID() }), close() { service.dispose(); store.close() } }
}
test('the eight core subjects form a valid prerequisite route with source-bound public courses and authored units', () => {
  assert.equal(CORE_COURSES.length, 8)
  for (const [index, core] of CORE_COURSES.entries()) {
    assert.ok(core.prerequisites.every(id => CORE_COURSES.slice(0, index).some(item => item.id === id)))
    for (const id of core.courseIds) {
      assert.ok(COURSES.some(course => course.id === id))
      for (const variant of COURSE_VARIANTS) { const unit = courseUnit(id, variant); assert.ok(unit.guide); assert.ok(unit.questions.every(q => Number.isInteger(q.correct))); assert.equal(unit.workshop.blocks.length, 3) }
    }
  }
})
test('core recommendations explain missing prerequisites, progress, and correction practice without changing plans', async () => {
  const t = setup()
  try {
    let core = t.service.library().curriculum.cores.find(core => core.id === 'robotics')
    assert.ok(core.missing.includes('linear')); assert.equal(core.recommendedVariant, 'foundation')
    await t.run('content-concept', { conceptId: 'core:linear', status: 'familiar' })
    core = t.service.library().curriculum.cores.find(core => core.id === 'robotics'); assert.ok(!core.missing.includes('linear'))
    assert.equal(t.service.library().curriculum.cores.find(core => core.id === 'linear').recommendedVariant, 'transfer')
    await t.run('course-quiz', { courseId: 'mit-python', answers: [2, 0] })
    core = t.service.library().curriculum.cores.find(core => core.id === 'python'); assert.equal(core.recommendedVariant, 'support'); assert.ok(core.reason.includes('纠错'))
    assert.equal(t.store.read().activePlanId, null)
    assert.ok(!JSON.stringify(t.service.library()).includes('"correct":'))
    assert.ok(!JSON.stringify(t.service.library()).includes('"compare":'))
    await assert.rejects(t.run('content-concept', { conceptId: 'core:invented', status: 'familiar' }))
  } finally { t.close() }
})
test('recommended correction practice is a genuine source-specific candidate and returns to an existing target', async () => {
  const t = setup()
  try {
    const draft = (await t.run('course-plan', { courseId: 'mit-python', variant: 'support' })).result
    const task = draft.tasks.find(task => task.courseRef); assert.equal(task.courseRef.variant, 'support')
    assert.ok(task.title.includes('Python'))
    await t.run('confirm', { planId: draft.id })
    const core = t.service.library().curriculum.cores.find(core => core.id === 'python')
    assert.equal(core.recommendedVariant, 'support'); assert.ok(core.reason.includes('继续'))
    await assert.rejects(t.run('course-plan', { courseId: 'mit-python' }), error => error.code === 'COURSE_ALREADY_ACTIVE')
  } finally { t.close() }
})
test('material search sends only bounded query terms to arXiv, caches results, and never writes learner state', async () => {
  let calls = 0
  const t = setup(async url => { calls++; assert.equal(url.hostname, 'export.arxiv.org'); assert.ok(url.searchParams.get('search_query').includes('all:"sensor"')); return new Response(xml) })
  try {
    const before = t.store.read(), result = await t.service.materials('python', 'sensor processing', 5)
    assert.equal(result.items[0].url, 'https://arxiv.org/abs/2609.12345v1'); assert.equal(result.cached, false)
    assert.equal((await t.service.materials('python', 'sensor processing', 5)).cached, true); assert.equal(calls, 1)
    assert.deepEqual(t.store.read(), before)
    await assert.rejects(t.service.materials('invented', 'x', 5)); await assert.rejects(t.service.materials('python', 'x', 500))
    assert.throws(() => curriculumSearch('python', 'x'.repeat(121)))
    assert.ok(!curriculumSearch('python', 'sensor" OR all:secret').query.includes('all:secret'))
  } finally { t.close() }
})
test('no search matches is an empty result; offline failure is explicit and does not show synthetic papers', async () => {
  const empty = setup(async () => new Response('<feed></feed>')), offline = setup(async () => { throw new Error('offline') })
  try {
    assert.deepEqual((await empty.service.materials('linear', '', 5)).items, [])
    await assert.rejects(offline.service.materials('linear', '', 5), error => error.code === 'RESEARCH_UNAVAILABLE')
    assert.equal(offline.store.read().version, 0)
  } finally { empty.close(); offline.close() }
})
test('to-do marking is explicit self-report, reversible, versioned; it cannot bypass course requirements', async () => {
  const t = setup()
  try {
    const draft = (await t.run('course-plan', { courseId: 'mit-python' })).result, plan = (await t.run('confirm', { planId: draft.id })).result
    const task = plan.tasks.find(task => task.area === 'research'), course = plan.tasks.find(task => task.courseRef)
    await t.run('complete', { taskId: task.id, completed: true, selfReport: true })
    assert.equal(t.store.read().evidence[task.id].status, 'completed'); assert.equal(t.store.read().evidence[task.id].source, 'self-report')
    assert.ok(t.store.read().evidence[task.id].completionNote.includes('尚无成果'))
    await t.run('complete', { taskId: task.id, completed: false, selfReport: true })
    assert.equal(t.store.read().evidence[task.id].status, 'pending')
    const before = t.store.read()
    await assert.rejects(t.run('complete', { taskId: course.id, completed: true, selfReport: true }))
    assert.deepEqual(t.store.read(), before)
  } finally { t.close() }
})
