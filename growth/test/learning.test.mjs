import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { learningModelContext } from '../src/learning.mjs'
import { createResearchFeed, parseResearchFeed } from '../src/research.mjs'
import { agentFixture } from './agent-fixture.mjs'

const xml = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2609.12345v1</id><title>Robot learning &amp; control</title><published>2026-09-30T12:00:00Z</published><updated>2026-10-01T12:00:00Z</updated><summary>A test abstract.</summary><author><name>Test Author</name></author></entry><entry><id>https://malicious.example/abs/2609.22222</id><title>Not a source</title><published>2026-10-01T00:00:00Z</published></entry></feed>'
function setup(extra = {}) {
  const { researchFetch, ...modelContext } = extra
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, agentFixture({ agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) }, ...modelContext }).context, { researchFetch })
  const run = (operation, payload = {}) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() })
  return { store, service, run, close() { service.dispose(); store.close() } }
}
async function activate(run) { const draft = await run('generate', { mode: 'template' }); return (await run('confirm', { planId: draft.result.id })).result }

test('workshop records and purpose choices persist independently of evidence, idempotently, with historical writes rejected', async () => {
  const t = setup()
  try {
    const plan = await activate(t.run), task = plan.tasks.find(task => task.area === 'research')
    const payload = { taskId: task.id, step: 3, workIndex: 2, minutes: 20, fields: { paperTitle: 'My real paper', source: 'student provided source' }, checkpoint: { choice: 'deepen', answer: 'I want to compare the method in my own scene.' } }
    await t.run('learning', payload)
    assert.equal(t.store.read().evidence[task.id], undefined)
    assert.equal(t.store.read().activePlanId, plan.id)
    assert.equal(t.store.read().feedback.length, 1)
    await t.run('learning', payload)
    assert.equal(t.store.read().feedback.length, 1, 'Saving unchanged checkpoint must not duplicate feedback')
    const context = learningModelContext(t.store.read(), plan)
    assert.equal(context[0].checkpoint.choice, 'deepen'); assert.equal(context[0].fields.paperTitle, 'My real paper')
    const reviewed = await t.run('review', { mode: 'template', advance: true }); await t.run('confirm', { planId: reviewed.result.id })
    const before = t.store.read()
    await assert.rejects(t.run('learning', payload), error => error.code === 'STALE_TASK')
    assert.deepEqual(t.store.read(), before)
    assert.equal(learningModelContext(before, before.plans.find(item => item.id === before.activePlanId)).length, 0)
  } finally { t.close() }
})

test('invalid workbook fields and completed edits fail atomically; post-completion purpose choice remains available', async () => {
  const t = setup()
  try {
    const plan = await activate(t.run), task = plan.tasks.find(task => task.area === 'gpa')
    const payload = { taskId: task.id, step: 1, workIndex: 0, minutes: 10, fields: { angle1: '0', angle2: '90' } }
    await t.run('learning', payload)
    const before = t.store.read()
    for (const fields of [{ angle1: 'Infinity' }, { angle1: '181' }, { invented: 'x' }, { angle1: 20 }]) await assert.rejects(t.run('learning', { ...payload, fields }))
    assert.deepEqual(t.store.read(), before)
    await t.run('evidence', { taskId: task.id, artifactText: 'My observed positions', reflection: '', confidence: 3, mode: 'record' })
    await t.run('complete', { taskId: task.id, completed: true })
    await assert.rejects(t.run('learning', { ...payload, fields: { angle1: '15' } }), error => error.code === 'COMPLETED_TASK')
    await t.run('learning', { ...payload, step: 3, checkpoint: { choice: 'help', answer: 'I mix up the relative angle.', focus: 'concept' } })
    assert.equal(t.store.read().evidence[task.id].status, 'completed')
    assert.equal(t.store.read().journeyObstacles[task.id].reason, 'concept')
  } finally { t.close() }
})

test('course feedback and competition workspace are real learner records and cannot silently alter the active plan', async () => {
  const t = setup()
  try {
    const plan = await activate(t.run)
    assert.ok(t.service.library().courses.every(course => course.questions.every(question => !('correct' in question))))
    await t.run('course-quiz', { courseId: 'mit-linear', answers: [0, 1] })
    assert.equal(t.store.read().coursePractice['mit-linear'].correct, 2)
    await t.run('content-concept', { conceptId: 'vectors', status: 'learning' })
    await t.run('competition-workspace', { problemId: 'nuedc-2025-c', step: 2, fields: { requirements: 'Read official task', testPlan: 'Collect error measurements' } })
    assert.equal(t.store.read().competitionWorkspaces['nuedc-2025-c'].fields.testPlan, 'Collect error measurements')
    assert.equal(t.store.read().activePlanId, plan.id)
    const before = t.store.read()
    await assert.rejects(t.run('competition-workspace', { problemId: 'nuedc-2025-c', step: 2, fields: { privateKey: 'secret' } }))
    await assert.rejects(t.run('course-quiz', { courseId: 'mit-linear', answers: [1] }))
    assert.deepEqual(t.store.read(), before)
  } finally { t.close() }
})

test('research feed accepts only arXiv identifiers and valid dates, decodes text, caches requests and reports failures', async () => {
  const papers = parseResearchFeed(xml)
  assert.equal(papers.length, 1); assert.equal(papers[0].title, 'Robot learning & control'); assert.equal(papers[0].url, 'https://arxiv.org/abs/2609.12345v1')
  assert.throws(() => parseResearchFeed('<!DOCTYPE feed><feed></feed>'))
  let calls = 0
  const feed = createResearchFeed(async url => { calls++; assert.equal(url.hostname, 'export.arxiv.org'); assert.equal(url.searchParams.get('sortBy'), 'submittedDate'); return new Response(xml) })
  assert.equal((await feed.get('robot-learning', 5)).cached, false)
  assert.equal((await feed.get('robot-learning', 10)).cached, true); assert.equal(calls, 1)
  await assert.rejects(feed.get('unknown', 5))
  const failing = createResearchFeed(async () => { throw new Error('offline') })
  await assert.rejects(failing.get('robot-learning', 5), error => error.code === 'RESEARCH_UNAVAILABLE')
})

test('model digest cannot introduce invented papers or commit after malformed output', async () => {
  const t = setup({ researchFetch: async () => new Response(xml), llm: { prepareCall: async () => ({ config: {}, stream: async function* () { yield { type: 'text-delta', text: JSON.stringify({ overview: 'Overview', items: [{ id: 'invented-id', summary: 'Fake', question: 'Fake' }] }) }; yield { type: 'finish', reason: { kind: 'stop' } } } }) } })
  try {
    const before = t.store.read()
    await assert.rejects(t.run('research-digest', { topic: 'robot-learning', count: 5 }), error => error.code === 'INVALID_MODEL_OUTPUT')
    assert.deepEqual(t.store.read(), before)
  } finally { t.close() }
})
