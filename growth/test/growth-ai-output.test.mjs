import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProfile, GrowthError, initialState, templatePlan, validatePlanOutput } from '../src/domain.mjs'
import { canonicalEvidenceSummary, canonicalPlanNarrative, canonicalPlanRoadmap, evidenceWithModel, generateModelJson, parseModelJson, planWithModel, researchDigestWithModel } from '../src/model.mjs'
import { publicCourseUnit } from '../src/course-catalog.mjs'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { randomUUID } from 'node:crypto'
import { agentFixture } from './agent-fixture.mjs'

const context = { agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) } }
const fixture = output => agentFixture(context, { frames: [{ type: 'text-delta', text: JSON.stringify(output) }, { type: 'finish', reason: { kind: 'stop' } }] })
const task = { id: 'task', title: '解释运动学', criteria: ['说明角度定义'] }
const input = { artifactText: '第二关节角相对第一连杆。', reflection: '准备检查零角特例。', confidence: 3 }
const assessment = { summary: '成果支持角度定义。', checks: [{ criterion: task.criteria[0], status: 'supported', feedback: '成果写明第二关节的相对角。' }], nextStep: '记录零角输入和预期坐标，再核对计算。' }

test('nontext structured output and null assessment rows report a safe model contract error', async () => {
  assert.throws(() => parseModelJson(null), error => error.code === 'INVALID_MODEL_OUTPUT')
  const f = fixture({ ...assessment, checks: [null] })
  await assert.rejects(evidenceWithModel(f.context, initialState(), task, input), error => error.code === 'INVALID_MODEL_OUTPUT')
})

test('assessment cannot save blank summary, check feedback or next step', async () => {
  for (const output of [{ ...assessment, summary: '  ' }, { ...assessment, nextStep: '\n' }, { ...assessment, checks: [{ ...assessment.checks[0], feedback: '' }] }]) {
    const f = fixture(output)
    await assert.rejects(evidenceWithModel(f.context, initialState(), task, input), error => error.code === 'INVALID_MODEL_OUTPUT')
  }
})

test('assessment persists only its agreed schema and leaves task completion to the learner', async () => {
  const state = initialState(), before = structuredClone(state)
  const f = fixture({ ...assessment, completed: true, confidence: 5, checks: [{ ...assessment.checks[0], mastery: 100 }] })
  const result = await evidenceWithModel(f.context, state, task, input)
  assert.deepEqual(result.assessment, { ...assessment, summary: canonicalEvidenceSummary(assessment.checks) })
  assert.deepEqual(state, before)
})

test('plan rejects malformed task rows with a model contract error before persistence', async () => {
  for (const output of [{ ...templatePlan(defaultProfile()), tasks: [null] }, { ...templatePlan(defaultProfile()), title: '' }]) {
    const f = fixture(output)
    await assert.rejects(planWithModel(f.context, initialState(), defaultProfile()), error => error.code === 'INVALID_MODEL_OUTPUT')
  }
})

test('validated plans retain registered course references and remove model-added state fields', async () => {
  const plan = templatePlan(defaultProfile()), original = structuredClone(plan)
  const f = fixture({ ...plan, activePlanId: 'invented', tasks: plan.tasks.map(row => ({ ...row, status: 'completed', ...(row.courseRef ? { courseRef: { ...row.courseRef, verified: true } } : {}) })) })
  const result = await planWithModel(f.context, initialState(), defaultProfile())
  const { summary, rationale, roadmap, ...actualContent } = result.output
  const { summary: originalSummary, rationale: originalRationale, roadmap: originalRoadmap, ...originalContent } = original
  assert.deepEqual(actualContent, originalContent)
  assert.match(summary, /第1周安排8小时，第2周安排8小时，共16小时/)
  assert.match(rationale, /完整目标及标准见任务/)
  assert.deepEqual(roadmap.slice(2), originalRoadmap.filter(row => row.fromWeek >= 3))
  assert.deepEqual(roadmap.slice(0, 2).map(row => [row.fromWeek, row.toWeek]), [[1, 1], [2, 2]])
  assert.deepEqual(plan, original)
})

test('plan context includes built-in and currently authorized study topics without copying unrelated topic history', async () => {
  const state = initialState()
  const selected = { id: 'custom-selected', label: '深入学习主题', title: '我的采样验证', detail: '合成测试主题', source: 'https://example.org/selected' }
  state.customChoices = [selected, { ...selected, id: 'custom-unselected', title: '历史主题' }]
  state.customChoiceSelections = { '深入学习主题': selected.id }
  const f = fixture(templatePlan(defaultProfile()))
  await planWithModel(f.context, state, defaultProfile())
  const payload = JSON.parse(f.stats.messages[0].content[0].text), ids = new Set(payload.courseUnits.map(unit => unit.courseRef.id))
  for (const id of ['topic-coordinate', 'topic-ohm', 'topic-response', 'topic-data', selected.id]) assert.ok(ids.has(id))
  assert.ok(!ids.has('custom-unselected'))
  assert.ok(payload.courseUnits.find(unit => unit.courseRef.id === selected.id).note.includes('未经外部核验'))
})

test('AI import uses only the validated shared topic definition when a model invents replacement content', async () => {
  const studyChoice = { id: 'custom-shared', label: '深入学习主题', title: '共享采样主题', detail: '合成主题与条件', source: 'https://example.org/shared' }
  const plan = templatePlan(defaultProfile()), index = plan.tasks.findIndex(row => row.area === 'gpa')
  plan.tasks[index] = { ...plan.tasks[index], resourceId: 'course-study', courseRef: { id: studyChoice.id, variant: 'foundation' }, studyChoice: { ...studyChoice, source: 'https://example.org/invented' } }
  const shared = { tasks: [{ courseRef: plan.tasks[index].courseRef, studyChoice }] }, f = fixture(plan)
  const state = initialState()
  state.customChoices = [{ ...studyChoice, source: 'https://example.org/old-local-definition' }]
  const result = await planWithModel(f.context, state, defaultProfile(), undefined, { shared })
  assert.deepEqual(result.output.tasks[index].courseRef, { id: studyChoice.id, variant: 'foundation' })
  assert.equal('studyChoice' in result.output.tasks[index], false)
  const payload = JSON.parse(f.stats.messages[0].content[0].text)
  assert.equal(payload.courseUnits.find(unit => unit.courseRef.id === studyChoice.id).course.url, studyChoice.source)
})

const collection = { source: 'arXiv', items: [
  { id: '2609.12345v1', title: '机器人学习', abstract: '使用合成数据学习运动控制。' },
  { id: '2609.23456v1', title: '机器人规划', abstract: '比较同一场景中的路径。' },
] }
const digest = { overview: '摘要涉及控制与规划，实验细节还需读原文。', items: collection.items.map(item => ({ id: item.id, summary: item.abstract, question: '全文如何说明实验条件与适用范围？' })) }

test('research digest rejects null rows, unknown and duplicate sources, blank text and oversized fields', async () => {
  const invalid = [
    { ...digest, items: [null, digest.items[1]] },
    { ...digest, items: [digest.items[0], { ...digest.items[1], id: 'invented' }] },
    { ...digest, items: [digest.items[0], digest.items[0]] },
    { ...digest, overview: '  ' },
    { ...digest, items: [{ ...digest.items[0], question: '' }, digest.items[1]] },
    { ...digest, items: [{ ...digest.items[0], summary: 'x'.repeat(801) }, digest.items[1]] },
  ]
  for (const output of invalid) {
    const f = fixture(output)
    await assert.rejects(researchDigestWithModel(f.context, collection), error => error.code === 'INVALID_MODEL_OUTPUT')
    assert.equal(f.stats.disposed, 1)
  }
})

test('research digest preserves exact source IDs and only its existing schema, with no model call for empty sources', async () => {
  const f = fixture({ ...digest, qualityRanking: ['invented'], items: digest.items.map(item => ({ ...item, doi: 'invented' })) })
  const result = await researchDigestWithModel(f.context, collection)
  assert.deepEqual(result.digest, digest)
  const empty = fixture(digest)
  await assert.rejects(researchDigestWithModel(empty.context, { ...collection, items: [] }), error => error.code === 'RESEARCH_UNAVAILABLE')
  assert.equal(empty.stats.messages.length, 0)
  assert.equal(empty.stats.disposed, 0)
})

test('invalid model assessment never changes persistent learner records or completion', async () => {
  const f = fixture({ ...assessment, checks: [null] }), store = new GrowthStore(':memory:'), service = createGrowthService(store, f.context)
  const run = (operation, payload) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() })
  try {
    const generated = await run('generate', { mode: 'template' })
    const plan = (await run('confirm', { planId: generated.result.id })).result
    const before = store.read()
    await assert.rejects(run('evidence', { taskId: plan.tasks[0].id, ...input, mode: 'model' }), error => error.code === 'INVALID_MODEL_OUTPUT')
    assert.deepEqual(store.read(), before)
    assert.equal(f.stats.disposed, 2)
  } finally { service.dispose(); store.close() }
})

test('canonical plan prose replaces the observed wrong totals and partial-unit reasons while keeping all tasks', async () => {
  const profile = { ...defaultProfile(), weeklyHours: 2, weights: { research: 0, competition: 0, gpa: 100, interest: 0 }, constraints: '每次最多20分钟，无实体机械臂，仅做纸笔与理想模型核对。' }
  const plan = { title: 'Synthetic observed schedule', summary: '第1周2.0小时、总计3.75小时；只做诊断。', rationale: 'foundation是前半/后半；线代只在诊断失败后才安排。', tasks: [
    { area: 'gpa', title: 'Narrow diagnostic', objective: 'Diagnostic only', criteria: ['Narrow criterion'], resourceId: 'course-study', courseRef: { id: 'mit-linear', variant: 'support' }, hours: .33, week: 1, prerequisites: [] },
    { area: 'gpa', title: 'Front half', objective: 'Partial only', criteria: ['Narrow criterion'], resourceId: 'course-study', courseRef: { id: 'mit-robotics', variant: 'foundation' }, hours: 1.5, week: 1, prerequisites: [] },
    { area: 'gpa', title: 'Back half', objective: 'Partial only', criteria: ['Narrow criterion'], resourceId: 'course-study', courseRef: { id: 'mit-robotics', variant: 'foundation' }, hours: 1, week: 2, prerequisites: [1] },
    { area: 'gpa', title: 'Transfer', objective: 'Transfer objective', criteria: ['Criterion'], resourceId: 'course-study', courseRef: { id: 'mit-robotics', variant: 'transfer' }, hours: .75, week: 2, prerequisites: [2] },
  ], roadmap: [], questions: [] }
  const original = structuredClone(plan), f = fixture(plan)
  const result = await planWithModel(f.context, initialState(), profile)
  assert.equal(result.output.tasks.length, 4)
  assert.deepEqual(result.output.tasks.map((task, index) => ({ ...task, title: plan.tasks[index].title })), plan.tasks)
  assert.match(result.output.summary, /第1周安排1\.83小时，第2周安排1\.75小时，共3\.58小时/)
  assert.match(result.output.summary, /19\.8分钟，分1次、每次约19\.8分钟/)
  assert.match(result.output.summary, /90分钟，分5次、每次约18分钟/)
  assert.match(result.output.summary, /60分钟，分3次、每次约20分钟/)
  assert.match(result.output.summary, /完整单元复习/)
  assert.doesNotMatch(result.output.summary + result.output.rationale, /3\.75|前半|后半|只做诊断|诊断失败后才安排/)
  const normalized = validatePlanOutput(result.output, profile)
  assert.equal(normalized.tasks[1].criteria.length, 4)
  assert.deepEqual(normalized.tasks[1].criteria, normalized.tasks[2].criteria)
  assert.deepEqual(plan, original)
})

test('canonical descriptions fit existing limits for sixteen full tasks without changing their criteria', () => {
  const profile = { ...defaultProfile(), weeklyHours: 40, baseline: '基础'.repeat(600), purpose: '目的'.repeat(600), constraints: '每次最多20分钟' }
  const tasks = Array.from({ length: 16 }, (_, i) => ({ title: '标题'.repeat(80), objective: '完整目标'.repeat(250), criteria: ['原标准'.repeat(50)], hours: .25, week: i < 8 ? 1 : 2, resourceId: 'robot-kinematics' }))
  const before = structuredClone(tasks), result = canonicalPlanNarrative(profile, tasks)
  assert.ok(result.summary.length <= 2400)
  assert.ok(result.rationale.length <= 2400)
  assert.match(result.summary, /第1周安排2小时，第2周安排2小时，共4小时/)
  assert.deepEqual(tasks, before)
})

test('malformed structured output gets one complete-schema regeneration and retains original source constraints', async () => {
  const requests = [], broken = '{"overview":"对"同行评审状态未确认"需核实","items":[]}'
  const f = agentFixture({ ...context, llm: { async prepareCall() { return { async *stream(request) {
    requests.push({ system: request.system, payload: JSON.parse(request.messages[0].content[0].text) })
    yield { type: 'text-delta', text: requests.length === 1 ? broken : JSON.stringify(digest) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } } } })
  const result = await researchDigestWithModel(f.context, collection)
  assert.equal(requests.length, 2)
  assert.equal(requests[1].payload.modelOutputForRepair, broken)
  assert.deepEqual(requests[1].payload.items, collection.items)
  assert.match(requests[1].system, /上述完整schema重新生成全部结果/)
  assert.match(requests[1].system, /不要接写尾部、猜补残缺字段/)
  assert.deepEqual(result.digest, digest)
  assert.equal(result.model.structuredRegenerations, 1)
  assert.equal(f.stats.disposed, 2)
})

test('a second truncated JSON response still fails strictly, with no third call or learner-state mutation', async () => {
  const state = initialState(), before = structuredClone(state)
  const f = agentFixture(context, { frames: [{ type: 'text-delta', text: '{"summary":"partial","checks":[' }, { type: 'finish', reason: { kind: 'stop' } }] })
  await assert.rejects(evidenceWithModel(f.context, state, task, input), error => error.code === 'INVALID_MODEL_OUTPUT')
  assert.equal(f.stats.messages.length, 2)
  assert.equal(f.stats.disposed, 2)
  assert.deepEqual(state, before)
})

test('initial structured call and its sole regeneration share one deadline rather than two time budgets', async () => {
  let calls = 0, firstSignal, secondSignal
  const f = agentFixture({ ...context, llm: { async prepareCall(_selection, signal) { return { async *stream() {
    calls++
    if (calls === 1) {
      firstSignal = signal
      await new Promise(resolve => setTimeout(resolve, 15))
      yield { type: 'text-delta', text: '{"partial":' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } else {
      secondSignal = signal
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    }
  } } } } })
  const started = Date.now()
  await assert.rejects(generateModelJson(f.context, 'Return complete JSON.', {}, undefined, { timeoutMs: 35 }), error => error.code === 'MODEL_TIMEOUT')
  assert.equal(calls, 2)
  assert.equal(secondSignal.aborted, true)
  assert.equal(firstSignal.aborted, true)
  assert.equal(f.stats.disposed, 2)
  assert.ok(Date.now() - started < 1000)
})

test('user cancellation during the first malformed response prevents any regeneration', async () => {
  const controller = new AbortController()
  let calls = 0
  const f = agentFixture({ ...context, llm: { async prepareCall() { return { async *stream() {
    calls++
    controller.abort()
    yield { type: 'text-delta', text: '{"partial":' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } } } })
  await assert.rejects(generateModelJson(f.context, 'Return JSON.', {}, controller.signal), error => error.code === 'CANCELLED')
  assert.equal(calls, 1)
  assert.equal(f.stats.disposed, 1)
})

test('authentication and network failures do not trigger structured regeneration', async () => {
  for (const [upstream, expected] of [[{ status: 401 }, 'MODEL_AUTH'], [{ code: 'ECONNRESET' }, 'MODEL_NETWORK']]) {
    let calls = 0
    const f = agentFixture({ ...context, llm: { async prepareCall() { calls++; throw Object.assign(new Error('Synthetic failure'), upstream) } } })
    await assert.rejects(generateModelJson(f.context, 'Return JSON.', {}), error => error.code === expected)
    assert.equal(calls, 1)
    assert.equal(f.stats.disposed, 1)
  }
})

test('strict plan validation regenerates one complete result for invalid dependency, budget or source, preserving original context', async () => {
  const profile = defaultProfile(), state = initialState(), original = templatePlan(profile), before = structuredClone(state)
  for (const defect of ['self', 'future-week', 'budget', 'resource']) {
    const invalid = structuredClone(original)
    if (defect === 'self') invalid.tasks[1].prerequisites = [1]
    if (defect === 'future-week') {
      invalid.tasks[0].week = 2
      invalid.tasks[1].week = 1
      invalid.tasks[1].prerequisites = [0]
    }
    if (defect === 'budget') invalid.tasks[0].hours = profile.weeklyHours * 2
    if (defect === 'resource') invalid.tasks[0].resourceId = 'unregistered-resource'
    const requests = [], raw = JSON.stringify(invalid)
    const f = agentFixture({ ...context, llm: { async prepareCall() { return { async *stream(request) {
      requests.push({ system: request.system, payload: JSON.parse(request.messages[0].content[0].text) })
      yield { type: 'text-delta', text: requests.length === 1 ? raw : JSON.stringify(original) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } } } } })
    const result = await planWithModel(f.context, state, profile)
    assert.equal(requests.length, 2, defect)
    assert.equal(requests[1].payload.modelOutputForRepair, raw)
    assert.equal(requests[1].payload.modelValidationErrorForRepair.code, 'INVALID_MODEL_OUTPUT')
    assert.deepEqual(requests[1].payload.profile, profile)
    assert.deepEqual(requests[1].payload.courseUnits, requests[0].payload.courseUnits)
    assert.deepEqual(requests[1].payload.resources, requests[0].payload.resources)
    assert.deepEqual(result.output.tasks, original.tasks)
    assert.equal(result.model.structuredRegenerations, 1)
    assert.equal(f.stats.disposed, 2)
    assert.doesNotThrow(() => validatePlanOutput(result.output, profile))
    assert.deepEqual(state, before)
  }
})

test('JSON failure and subsequent strict plan failure together use only the same sole regeneration, with no state saved', async () => {
  const store = new GrowthStore(':memory:'), malformed = '{"tasks":[', invalid = templatePlan(defaultProfile())
  invalid.tasks[0].prerequisites = [0]
  let calls = 0
  const f = agentFixture({ ...context, llm: { async prepareCall() { return { async *stream() {
    calls++
    yield { type: 'text-delta', text: calls === 1 ? malformed : JSON.stringify(invalid) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } } } })
  const service = createGrowthService(store, f.context), before = store.read()
  try {
    await assert.rejects(service.execute('generate', { mode: 'model', version: before.version, requestKey: randomUUID() }), error => error.code === 'INVALID_MODEL_OUTPUT')
    assert.equal(calls, 2)
    assert.equal(f.stats.disposed, 2)
    assert.deepEqual(store.read(), before)
  } finally { service.dispose(); store.close() }
})

test('two valid JSON outputs with the same invalid dependency remain rejected, without deleting or guessing dependency indices', async () => {
  const invalid = templatePlan(defaultProfile()), state = initialState(), before = structuredClone(state)
  invalid.tasks[0].prerequisites = [0]
  const original = structuredClone(invalid), f = fixture(invalid)
  await assert.rejects(planWithModel(f.context, state, defaultProfile()), error => error.code === 'INVALID_MODEL_OUTPUT')
  assert.equal(f.stats.disposed, 2)
  assert.deepEqual(invalid, original)
  assert.deepEqual(state, before)
})

test('validation-triggered regeneration shares the total deadline, and an unrelated validation error is not retried', async () => {
  let calls = 0
  const f = agentFixture({ ...context, llm: { async prepareCall(_selection, signal) { return { async *stream() {
    calls++
    if (calls === 1) {
      await new Promise(resolve => setTimeout(resolve, 20))
      yield { type: 'text-delta', text: '{}' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } else await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  } } } } })
  await assert.rejects(generateModelJson(f.context, 'Return full plan.', {}, undefined, { timeoutMs: 65, validate() { throw new GrowthError('INVALID_MODEL_OUTPUT', 'Synthetic dependency failure.', 422) } }), error => error.code === 'MODEL_TIMEOUT')
  assert.equal(calls, 2)
  assert.equal(f.stats.disposed, 2)
  const nonModel = fixture({})
  await assert.rejects(generateModelJson(nonModel.context, 'Return JSON.', {}, undefined, { validate() { throw new TypeError('Synthetic validator fault.') } }), TypeError)
  assert.equal(nonModel.stats.disposed, 1)
})

test('user cancellation at strict validation takes precedence and prevents a schema regeneration', async () => {
  const controller = new AbortController(), f = fixture({})
  await assert.rejects(generateModelJson(f.context, 'Return complete plan.', {}, controller.signal, { validate() {
    controller.abort()
    throw new GrowthError('INVALID_MODEL_OUTPUT', 'Synthetic dependency failure.', 422)
  } }), error => error.code === 'CANCELLED')
  assert.equal(f.stats.disposed, 1)
})

test('current roadmap replaces observed partial-unit phases with complete learning/review and retains all future phases', async () => {
  const profile = { ...defaultProfile(), weeklyHours: 2, weights: { research: 0, competition: 0, gpa: 100, interest: 0 } }
  const courseRef = { id: 'mit-robotics', variant: 'foundation' }
  const plan = { title: 'Full unit repeated', summary: 'Two halves', rationale: 'Different halves each week', questions: [], tasks: [
    { area: 'gpa', title: 'Front half', objective: 'Only two examples', hours: 2, week: 1, resourceId: 'course-study', courseRef, criteria: ['Narrow criterion'], prerequisites: [] },
    { area: 'gpa', title: 'Back half', objective: 'Remaining self-selected example', hours: 2, week: 2, resourceId: 'course-study', courseRef, criteria: ['Narrow criterion'], prerequisites: [0] },
  ], roadmap: [
    { fromWeek: 1, toWeek: 1, title: '单元前段', outcome: 'Only zero/right examples' },
    { fromWeek: 2, toWeek: 2, title: '单元后段', outcome: 'Only remaining self-selected example' },
    { fromWeek: 3, toWeek: 4, title: 'Conditional further study', outcome: 'Decide from learner practice records; not yet confirmed.' },
  ] }
  const before = structuredClone(plan), f = fixture(plan), result = await planWithModel(f.context, initialState(), profile)
  const normalized = validatePlanOutput(result.output, profile)
  assert.deepEqual(result.output.tasks.map((task, index) => ({ ...task, title: plan.tasks[index].title })), plan.tasks)
  assert.equal(normalized.tasks[0].criteria.length, 4)
  assert.deepEqual(normalized.tasks[0].criteria, normalized.tasks[1].criteria)
  assert.match(result.output.roadmap[0].outcome, /完整单元学习/)
  assert.match(result.output.roadmap[1].outcome, /完整单元复习/)
  for (const phase of result.output.roadmap.slice(0, 2)) {
    assert.match(phase.outcome, /完整目标和全部标准/)
    assert.match(phase.outcome, /三个可复查的仿真算例/)
    assert.doesNotMatch(phase.title + phase.outcome, /前段|后段|Only|Remaining|只做/)
  }
  assert.deepEqual(result.output.roadmap.slice(2), plan.roadmap.slice(2))
  assert.deepEqual(plan, before)
})

test('canonical current roadmap fits sixteen long tasks, retains future rows and makes an empty week explicit', () => {
  const tasks = Array.from({ length: 16 }, (_, index) => ({ title: '长任务标题'.repeat(20), objective: '完整目标'.repeat(100), hours: .25, week: 1, courseRef: { id: 'mit-robotics', variant: 'foundation' } }))
  const future = [{ fromWeek: 3, toWeek: 4, title: 'Future', outcome: 'Conditional future plan' }], before = structuredClone(tasks)
  const result = canonicalPlanRoadmap(tasks, [{ fromWeek: 1, toWeek: 2, title: 'Current halves', outcome: 'Untrustworthy narrower scope' }, ...future])
  assert.ok(result[0].outcome.length <= 600)
  for (let i = 1; i <= 16; i++) assert.ok(result[0].outcome.includes(i + '. '))
  assert.match(result[1].outcome, /未安排新任务/)
  assert.deepEqual(result.slice(2), future)
  assert.deepEqual(tasks, before)
})

test('registered task titles use the actual unit in tasks and all prose, removing model-invented time without changing scope or hours', async () => {
  const profile = { ...defaultProfile(), weeklyHours: 2, weights: { research: 0, competition: 0, gpa: 100, interest: 0 }, constraints: '每次最多20分钟' }, unit = publicCourseUnit('mit-robotics', 'foundation')
  const originalTitle = 'Model invented title（分两次20分钟）', plan = { title: 'Registered-title regression', summary: 'Original', rationale: 'Original', questions: [], roadmap: [], tasks: [1, 2].map((week, index) => ({ area: 'gpa', title: originalTitle, objective: 'Original raw objective', criteria: ['Original raw criterion'], hours: .25, week, resourceId: 'course-study', courseRef: unit.courseRef, prerequisites: index ? [0] : [] })) }
  const before = structuredClone(plan), f = fixture(plan), result = await planWithModel(f.context, initialState(), profile)
  const title = unit.course.title + ' · ' + unit.title
  for (const task of result.output.tasks) {
    assert.equal(task.title, title)
    assert.equal(task.hours, .25)
  }
  assert.deepEqual(result.output.tasks.map((task, index) => ({ ...task, title: plan.tasks[index].title })), plan.tasks)
  for (const prose of [result.output.summary, result.output.rationale, ...result.output.roadmap.map(row => row.outcome)]) {
    assert.ok(prose.includes(title))
    assert.doesNotMatch(prose, /Model invented|两次20分钟/)
  }
  assert.match(result.output.summary, /15分钟，分1次、每次约15分钟/)
  assert.match(result.output.roadmap[1].outcome, /完整单元复习/)
  const normalized = validatePlanOutput(result.output, profile)
  assert.deepEqual(normalized.tasks.map(task => task.title), [title, title])
  assert.deepEqual(normalized.tasks[0].criteria, unit.criteria)
  assert.deepEqual(normalized.tasks[1].criteria, unit.criteria)
  assert.deepEqual(plan, before)
  assert.equal(f.stats.disposed, 1)
})

test('evidence summary counts arbitrary supplied statuses without changing a criterion judgment or claiming it is verified', () => {
  for (const statuses of [['supported', 'supported', 'needs-work'], ['supported', 'supported', 'supported'], ['needs-work', 'needs-work', 'needs-work']]) {
    const checks = statuses.map((status, index) => ({ criterion: 'Original ' + index, status, feedback: 'Original feedback' })), before = structuredClone(checks), summary = canonicalEvidenceSummary(checks)
    assert.ok(summary.includes(statuses.filter(status => status === 'supported').length + '/3条原完成标准有支持'))
    assert.match(summary, /仅复述下方判定，需对照原成果与标准核查/)
    assert.doesNotMatch(summary, /满足原三条标准|已完成|已验证掌握/)
    assert.deepEqual(checks, before)
  }
})

test('negative criterion gets the sole full-context review, while a repeated wrong model judgment stays visible', async () => {
  const sourceTask = { id: 'task', title: 'Angle distinction', resourceId: 'robot-kinematics', criteria: ['解释θ₂的相对角定义', '正确解出两个特例', '说明一个容易混淆的概念'] }
  const sourceInput = { artifactText: 'θ₂是第二连杆相对第一连杆的角，第二连杆全局角为θ₁+θ₂。L₁=L₂=1米，0°/0°得(2,0)米，0°/90°得(1,1)米。度先换弧度。', reflection: '希望下次用非零θ₁核对。', confidence: 3 }
  const wrong = { summary: '满足原三条标准。', checks: sourceTask.criteria.map((criterion, index) => ({ criterion, status: index === 2 ? 'needs-work' : 'supported', feedback: index === 2 ? '错误判断仍需人工对照：只说定义，没有辨析。' : 'Original supported feedback' })), nextStep: '先画图再核对新输入；不代表已有成果。' }
  const f = fixture(wrong), state = initialState(), before = structuredClone(state), result = await evidenceWithModel(f.context, state, sourceTask, sourceInput)
  assert.match(result.assessment.summary, /2\/3条原完成标准有支持，1条被判为需补充/)
  assert.doesNotMatch(result.assessment.summary, /满足原三条标准/)
  assert.deepEqual(result.assessment.checks, wrong.checks)
  assert.equal(result.assessment.checks[2].status, 'needs-work')
  assert.equal(result.assessment.nextStep, wrong.nextStep)
  assert.deepEqual(state, before)
  assert.equal(f.stats.disposed, 2)
  assert.equal(f.stats.messages.length, 2)
  assert.equal(result.model.negativeCriterionReview,true)
})

test('a corrected negative judgment credits the unchanged original artifact and original criteria after one review',async()=>{
  const originalTask={id:'task',title:'Angle distinction',resourceId:'robot-kinematics',criteria:['解释相对角与全局角区别']},originalInput={artifactText:'θ₂相对第一连杆，第二杆全局角为θ₁+θ₂。',reflection:'仍需练习。',confidence:3};
  const before=structuredClone({originalTask,originalInput}),requests=[];
  const f=agentFixture({...context,llm:{async prepareCall(){return{async *stream(request){requests.push(JSON.parse(request.messages[0].content[0].text));yield{type:'text-delta',text:JSON.stringify({summary:'Candidate',checks:[{criterion:originalTask.criteria[0],status:requests.length===1?'needs-work':'supported',feedback:requests.length===1?'未解释区别。':'原成果明确给出相对第一杆和θ₁+θ₂两种角度，支持该标准。'}],nextStep:'自行画一个非零θ₁特例再核对。'})};yield{type:'finish',reason:{kind:'stop'}}}}}}});
  const state=initialState(),stateBefore=structuredClone(state),result=await evidenceWithModel(f.context,state,originalTask,originalInput);
  assert.equal(requests.length,2);assert.equal(result.assessment.checks[0].status,'supported');assert.equal(result.model.negativeCriterionReview,true);
  assert.deepEqual({originalTask,originalInput},before);assert.deepEqual(state,stateBefore);
});

const explicitTimeProfile = { ...defaultProfile(), weeklyHours: 8, weights: { research: 0, competition: 0, gpa: 100, interest: 0 } }
const explicitTimePlan = (title, hours) => ({ title: 'Explicit title-time regression', summary: 'Original', rationale: 'Original', questions: [], roadmap: [], tasks: [{ area: 'gpa', title, objective: '按原投影步骤推导x、y表达式并核对相对角。', criteria: ['解释相对角与全局角的区别'], hours, week: 1, resourceId: 'robot-kinematics', prerequisites: [] }] })

test('observed fifteen-minute import task with an explicit forty-minute title triggers the sole complete regeneration without guessing actions', async () => {
  const invalid = explicitTimePlan('按投影步骤推导x、y表达式（分两次20分钟）', .25), corrected = explicitTimePlan(invalid.tasks[0].title, 2 / 3), shared = structuredClone(invalid)
  const state = initialState(), before = structuredClone(state), requests = [], raw = JSON.stringify(invalid)
  const f = agentFixture({ ...context, llm: { async prepareCall() { return { async *stream(request) {
    requests.push(JSON.parse(request.messages[0].content[0].text))
    yield { type: 'text-delta', text: requests.length === 1 ? raw : JSON.stringify(corrected) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } } } } })
  const result = await planWithModel(f.context, state, explicitTimeProfile, undefined, { shared })
  assert.equal(requests.length, 2)
  assert.equal(requests[1].modelOutputForRepair, raw)
  assert.equal(requests[1].modelValidationErrorForRepair.code, 'INVALID_MODEL_OUTPUT')
  assert.match(requests[1].modelValidationErrorForRepair.message, /明确分次分钟合计/)
  assert.deepEqual(requests[1].profile, explicitTimeProfile)
  assert.deepEqual(requests[1].sharedTemplate, shared)
  assert.deepEqual(result.output.tasks, corrected.tasks)
  assert.match(result.output.summary, /40分钟/)
  assert.equal(result.model.structuredRegenerations, 1)
  assert.equal(f.stats.disposed, 2)
  assert.deepEqual(state, before)
  assert.deepEqual(invalid, shared)
})

test('explicit title time accepts consistent forty minutes, Chinese one through sixteen, and ordinary nearest-minute rounding', async () => {
  const chinese = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六']
  const samples = [['分2次，每次20分钟', 2 / 3], ['分两次20分钟', .66], ['分1次20分钟', .33], ...chinese.map((value, index) => [`分${value}次十六分钟`, (index + 1) * 16 / 60])]
  for (const [title, hours] of samples) {
    const plan = explicitTimePlan(title, hours), f = fixture(plan), result = await planWithModel(f.context, initialState(), explicitTimeProfile)
    assert.deepEqual(result.output.tasks, plan.tasks, title)
    assert.equal(f.stats.disposed, 1, title)
    assert.equal(result.model.structuredRegenerations, undefined, title)
  }
})

test('title bounds and approximate quantities are not mistaken for exact allocated time', async () => {
  for (const title of ['分两次20分钟以内', '分两次，每次20分钟为上限', '最多分两次20分钟', '至多分两次20分钟', '至少分两次20分钟', '分两次20分钟以上', '约分两次20分钟', '分两次20分钟左右', '分两次每次不超过20分钟']) {
    const plan = explicitTimePlan(title, .25), f = fixture(plan), result = await planWithModel(f.context, initialState(), explicitTimeProfile)
    assert.deepEqual(result.output.tasks, plan.tasks, title)
    assert.equal(f.stats.disposed, 1, title)
  }
})

test('fractional session counts and time contradictions beyond nearest-minute rounding remain rejected after at most two calls', async () => {
  for (const [title, hours] of [['分2.5次20分钟', 5 / 6], ['分两次20分钟', .64], ['分十六次十六分钟', .25]]) {
    const invalid = explicitTimePlan(title, hours), f = fixture(invalid), state = initialState(), before = structuredClone(state)
    await assert.rejects(planWithModel(f.context, state, explicitTimeProfile), error => error.code === 'INVALID_MODEL_OUTPUT', title)
    assert.equal(f.stats.disposed, 2, title)
    assert.deepEqual(state, before, title)
    assert.equal(invalid.tasks[0].title, title)
    assert.equal(invalid.tasks[0].hours, hours)
  }
})

test('a twice-repeated explicit title-time conflict cannot persist a draft or change the current plan', async () => {
  const invalid = explicitTimePlan('按投影步骤推导x、y表达式（分两次20分钟）', .25), f = fixture(invalid), store = new GrowthStore(':memory:'), service = createGrowthService(store, f.context), before = store.read()
  try {
    await assert.rejects(service.execute('generate', { mode: 'model', profile: explicitTimeProfile, version: before.version, requestKey: randomUUID() }), error => error.code === 'INVALID_MODEL_OUTPUT')
    assert.equal(f.stats.disposed, 2)
    assert.deepEqual(store.read(), before)
  } finally { service.dispose(); store.close() }
})
