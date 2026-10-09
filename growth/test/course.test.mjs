import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { courseUnit } from '../src/course-catalog.mjs'
import { validatePlanOutput, defaultProfile } from '../src/domain.mjs'

function setup(path = ':memory:') {
  const store = new GrowthStore(path), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  return { store, service, run: (operation, payload = {}) => service.execute(operation, { ...payload, version: store.read().version, requestKey: randomUUID() }), close() { service.dispose(); store.close() } }
}
async function activate(t, id = 'mit-linear') { const draft = await t.run('course-plan', { courseId: id }); return (await t.run('confirm', { planId: draft.result.id })).result }
const fullFields = { prediction: '旋转可以用线性变换表达。', explanation: '乘法内侧维度相同，外侧决定结果尺寸。', transfer: '检查相机和机械臂参考系，用两个已知点比较；未实测。' }
async function complete(t, task) {
  await t.run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: fullFields })
  await t.run('quiz', { taskId: task.id, answers: courseUnit(task.courseRef.id, task.courseRef.variant).questions.map(q => q.correct) })
  await t.run('evidence', { taskId: task.id, mode: 'record', artifactText: '合成验收成果', reflection: '知道如何检验维度', confidence: 3 })
  await t.run('complete', { taskId: task.id, completed: true })
}

test('a selected course yields a source-bound candidate; preview and decline leave active work intact', async () => {
  const t = setup()
  try {
    const generated = await t.run('generate', { mode: 'template' }), plan = (await t.run('confirm', { planId: generated.result.id })).result
    const before = t.store.read(), draft = (await t.run('course-plan', { courseId: 'modern-robotics' })).result
    assert.equal(t.store.read().activePlanId, plan.id)
    assert.deepEqual(t.store.read().evidence, before.evidence)
    const changed = draft.tasks.filter(task => task.courseRef)
    assert.equal(changed.length, 1); assert.equal(changed[0].courseRef.id, 'modern-robotics')
    assert.equal(draft.changeSet.filter(change => change.kind === 'replace').length, 1)
    assert.equal(draft.changeSet.filter(change => change.kind === 'continue').length, plan.tasks.length - 1)
    for (const week of [1, 2]) assert.equal(draft.tasks.filter(task => task.week === week).reduce((sum, task) => sum + task.hours, 0), plan.tasks.filter(task => task.week === week).reduce((sum, task) => sum + task.hours, 0))
    await t.run('decline', { planId: draft.id }); assert.equal(t.store.read().activePlanId, plan.id)
    await assert.rejects(t.run('course-plan', { courseId: 'invented' }))
  } finally { t.close() }
})

test('course references are whitelisted, canonicalized and safely exported without learner drafts', async () => {
  const t = setup()
  try {
    const plan = await activate(t), task = plan.tasks.find(task => task.courseRef)
    const forged = structuredClone(plan); forged.tasks.find(item => item.courseRef).title = '另一门伪造课程'
    assert.equal(validatePlanOutput(forged, plan.profile).tasks.find(item => item.courseRef).title, task.title)
    forged.tasks.find(item => item.courseRef).courseRef.id = 'invented'
    assert.throws(() => validatePlanOutput(forged, plan.profile))
    await t.run('learning', { taskId: task.id, step: 3, workIndex: 0, minutes: 10, fields: {}, draftForm: { artifactText: 'PRIVATE-DRAFT', reflection: '', confidence: 3 }, checkpoint: { choice: 'help', answer: 'PRIVATE-PURPOSE', focus: 'concept' } })
    const exported = t.service.export()
    assert.deepEqual(exported.tasks.find(item => item.courseRef).courseRef, task.courseRef)
    assert.ok(!JSON.stringify(exported).includes('PRIVATE'))
    assert.ok(t.service.snapshot().plans[0].tasks.find(item => item.courseRef).courseUnit.questions.every(q => !('correct' in q) && !('explanation' in q)))
  } finally { t.close() }
})

test('small steps and wrong answers cannot complete a course; completed content requires explicit withdrawal', async () => {
  const t = setup()
  try {
    const plan = await activate(t), task = plan.tasks.find(task => task.courseRef)
    await t.run('learning', { taskId: task.id, step: 2, workIndex: 1, minutes: 10, fields: { prediction: fullFields.prediction } })
    await t.run('evidence', { taskId: task.id, mode: 'record', artifactText: '只完成导学', reflection: '', confidence: 3 })
    await assert.rejects(t.run('complete', { taskId: task.id, completed: true }), error => error.code === 'COURSE_INCOMPLETE')
    await t.run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: fullFields })
    await t.run('quiz', { taskId: task.id, answers: [2, 2] })
    await assert.rejects(t.run('complete', { taskId: task.id, completed: true }), error => error.code === 'COURSE_INCOMPLETE')
    await complete(t, task)
    const before = t.store.read()
    await assert.rejects(t.run('quiz', { taskId: task.id, answers: [2, 2] }), error => error.code === 'COMPLETED_TASK')
    await assert.rejects(t.run('evidence', { taskId: task.id, mode: 'record', artifactText: '覆盖', reflection: '', confidence: 3 }), error => error.code === 'COMPLETED_TASK')
    assert.deepEqual(t.store.read(), before)
    await t.run('complete', { taskId: task.id, completed: false }); await t.run('quiz', { taskId: task.id, answers: [2, 2] })
    assert.equal(t.store.read().evidence[task.id].status, 'submitted')
  } finally { t.close() }
})

for (const [choice, variant] of [['enough', 'transfer'], ['deepen', 'deepen'], ['help', 'support']]) test(`${choice} makes a distinct ${variant} candidate while preserving history and unrelated work`, async () => {
  const t = setup()
  try {
    const plan = await activate(t), task = plan.tasks.find(task => task.courseRef), other = plan.tasks.find(task => task.area === 'research')
    await t.run('learning', { taskId: other.id, step: 1, workIndex: 0, minutes: 20, fields: { paperTitle: '正在看的论文' } })
    if (choice !== 'help') await complete(t, task)
    await t.run('learning', { taskId: task.id, step: 3, workIndex: 2, minutes: 40, fields: choice === 'help' ? {} : fullFields, checkpoint: { choice, answer: 'PRIVATE-目的回答', focus: 'concept' } })
    const before = t.store.read(), draft = (await t.run('course-next', { taskId: task.id })).result
    assert.equal(t.store.read().activePlanId, plan.id)
    assert.equal(draft.tasks.find(item => item.courseRef).courseRef.variant, variant)
    const active = (await t.run('confirm', { planId: draft.id })).result, next = active.tasks.find(item => item.courseRef), continued = active.tasks.find(item => item.continuedFrom === other.id)
    assert.equal(next.previousTaskId, task.id); assert.equal(t.store.read().evidence[next.id], undefined)
    assert.deepEqual(t.store.read().learningSessions[continued.id], before.learningSessions[other.id])
    assert.deepEqual(t.store.read().learningSessions[task.id], before.learningSessions[task.id])
    assert.deepEqual(t.store.read().evidence[task.id], before.evidence[task.id])
    assert.ok(!JSON.stringify(t.service.export()).includes('PRIVATE-目的'))
    await t.run('learning', { taskId: continued.id, step: 1, workIndex: 0, minutes: 20, fields: { paperTitle: '后续新记录' } })
    assert.equal(t.store.read().learningSessions[other.id].fields.paperTitle, '正在看的论文')
    await assert.rejects(t.run('learning', { taskId: task.id, step: 1, workIndex: 0, minutes: 20, fields: {} }), error => error.code === 'STALE_TASK')
  } finally { t.close() }
})

test('changing horizon and time budget rebuilds a valid course review without deleting history', async () => {
  const t = setup()
  try {
    const plan = await activate(t), course = plan.tasks.find(task => task.courseRef)
    for (const horizonWeeks of [4, 12]) {
      const draft = (await t.run('review', { mode: 'template', profile: { ...plan.profile, horizonWeeks } })).result
      assert.equal(draft.roadmap.at(-1).toWeek, horizonWeeks)
      assert.equal(draft.tasks.find(task => task.courseRef).continuedFrom, course.id)
    }
    const draft = (await t.run('review', { mode: 'template', profile: { ...plan.profile, weeklyHours: 2 } })).result
    assert.equal(draft.tasks.find(task => task.courseRef).courseRef.id, course.courseRef.id)
    for (const week of [1, 2]) assert.ok(draft.tasks.filter(task => task.week === week).reduce((sum, task) => sum + task.hours, 0) <= 2)
    const depthDraft = (await t.run('review', { mode: 'template', profile: { ...plan.profile, depths: { ...plan.profile.depths, research: 'deep' } } })).result
    const research = depthDraft.tasks.find(task => task.area === 'research')
    assert.ok(research.criteria.some(criterion => criterion.includes('比较两种')))
    assert.equal(research.continuedFrom, undefined)
    await assert.rejects(t.run('course-next', { taskId: course.id }))
  } finally { t.close() }
})

test('drafts and selected answers survive SQLite reopen; identical retries and stale versions remain safe', async () => {
  mkdirSync('.test-data', { recursive: true })
  const path = resolve('.test-data', `course-${randomUUID()}.sqlite`)
  let t = setup(path)
  try {
    const plan = await activate(t), task = plan.tasks.find(task => task.courseRef)
    const payload = { taskId: task.id, step: 1, workIndex: 1, scopeStart: 1, minutes: 20, fields: { prediction: '保存的判断' }, quizAnswers: [0, -1], draftForm: { artifactText: '未提交的成果草稿', reflection: '未提交的自评', confidence: 4 }, version: t.store.read().version, requestKey: randomUUID() }
    await t.service.execute('learning', payload); const saved = t.store.read()
    t.close(); t = setup(path)
    assert.deepEqual(t.store.read(), saved)
    await t.service.execute('learning', payload); assert.equal(t.store.read().version, saved.version)
    await assert.rejects(t.service.execute('learning', { ...payload, requestKey: randomUUID() }), error => error.code === 'VERSION_CONFLICT')
  } finally { t.close(); for (const suffix of ['', '-wal', '-shm']) if (existsSync(path + suffix)) unlinkSync(path + suffix) }
})

test('a zero course weight rejects course candidates instead of borrowing another direction', async () => {
  const t = setup()
  try {
    const profile = defaultProfile(); profile.weights = { research: 30, competition: 50, gpa: 0, interest: 20 }
    await t.run('profile', { profile })
    await assert.rejects(t.run('course-plan', { courseId: 'mit-linear' }), error => error.code === 'COURSE_WEIGHT_REQUIRED')
    assert.equal(t.store.read().plans.length, 0)
  } finally { t.close() }
})
