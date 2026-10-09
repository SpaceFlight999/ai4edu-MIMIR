import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { STUDY_TOPICS, calculateStudyTrial } from '../src/study-topics.mjs'
import { publicTaskUnit, taskCourseUnit } from '../src/course-catalog.mjs'
import { buildCourseReview } from '../src/course-plan.mjs'
import { buildCourseCandidate } from '../src/course-plan.mjs'
import { makeDraft } from '../src/domain.mjs'
function fixture() {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  return { store, service, run: (op, input = {}) => service.execute(op, { ...input, version: store.read().version, requestKey: randomUUID() }), close: () => { service.dispose(); store.close() } }
}
test('all personal additions can be edited, selected and deleted without losing old learning records', async () => {
  const f = fixture(); try {
    for (const label of ['专业方向', '学习目标', '学习目的', '核心课', '公开课', '竞赛与历史题', '研究方向', '兴趣方向', '深入学习主题']) {
      const item = (await f.run('custom-choice', { label, title: label + '原内容', detail: '旧说明' })).result
      await f.run('custom-choice', { action: 'select', id: item.id }); assert.equal(f.store.read().customChoiceSelections[label], item.id)
      const edited = (await f.run('custom-choice', { action: 'update', id: item.id, title: label + '修改', detail: '新说明', source: '' })).result
      assert.equal(edited.id, item.id); assert.equal(edited.at, item.at); assert.equal(edited.detail, '新说明')
      await f.run('custom-choice', { action: 'delete', id: item.id }); assert.ok(!f.store.read().customChoices.some(value => value.id === item.id)); assert.ok(!f.store.read().customChoiceSelections[label])
      const before = f.store.read(); await assert.rejects(f.run('custom-choice', { action: 'update', id: item.id, title: '不存在' })); assert.deepEqual(f.store.read(), before)
    }
  } finally { f.close() }
})
test('editing preserves category, rejects duplicate names and unsafe sources before committing', async () => {
  const f = fixture(); try {
    const a = (await f.run('custom-choice', { label: '研究方向', title: 'A' })).result
    await f.run('custom-choice', { label: '研究方向', title: 'B' })
    const before = f.store.read()
    await assert.rejects(f.run('custom-choice', { action: 'update', id: a.id, title: 'B' }))
    await assert.rejects(f.run('custom-choice', { action: 'update', id: a.id, title: 'C', source: 'javascript:alert(1)' }))
    assert.deepEqual(f.store.read(), before)
    const row = (await f.run('custom-choice', { action: 'update', id: a.id, label: '公开课', title: 'C' })).result
    assert.equal(row.label, '研究方向')
  } finally { f.close() }
})
for (const spec of STUDY_TOPICS) test(spec.title + ': preview/confirm, prerequisite correction, server calculation and completion checks', async () => {
  const f = fixture(); try {
    const draft = (await f.run('course-plan', { courseId: spec.id })).result
    assert.equal(f.store.read().activePlanId, null)
    await f.run('confirm', { planId: draft.id })
    const task = f.store.read().plans.find(plan => plan.id === draft.id).tasks.find(item => item.courseRef?.id === spec.id)
    const publicUnit = publicTaskUnit(task); assert.equal(publicUnit.workshop.blocks.length, 3); assert.ok(!JSON.stringify(publicUnit).includes('"correct"'))
    await assert.rejects(f.run('complete', { taskId: task.id, completed: true, selfReport: true }))
    await f.run('study-workspace', { taskId: task.id, action: 'diagnosis', answers: [2, 2, 2] })
    await f.run('study-workspace', { taskId: task.id, action: 'diagnosis', answers: spec.diagnosis.map(item => item.correct) })
    for (const [kind, parameters] of [['basic', spec.examples[0]], ['reference', spec.examples[1]], ['custom', Object.fromEntries(spec.parameters.map(item => [item.id, item.value]))]]) {
      const computed = calculateStudyTrial(spec, { kind, parameters, prediction: spec.outputs.map(() => 0) })
      await f.run('study-workspace', { taskId: task.id, action: 'trial', kind, parameters, prediction: computed.actual })
    }
    await f.run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: { prediction: '我的先修依据', explanation: '对照三个算例，区分单位和误差', transfer: '明确应用条件与边界' } })
    await f.run('quiz', { taskId: task.id, answers: taskCourseUnit(task).questions.map(item => item.correct) })
    await f.run('evidence', { taskId: task.id, artifactText: '三个算例及应用边界的分析报告', reflection: '预测与模型结果需要对照', confidence: 3, mode: 'record' })
    await f.run('complete', { taskId: task.id, completed: true })
    assert.equal(f.store.read().evidence[task.id].status, 'completed')
    await assert.rejects(f.run('study-workspace', { taskId: task.id, action: 'diagnosis', answers: [0, 0, 0] }))
    const trial = f.store.read().studySessions[task.id].trials[0]; assert.equal(trial.passed, true)
  } finally { f.close() }
})
test('custom topic enters a real candidate and retains its confirmed definition after catalog edit/delete and review', async () => {
  const f = fixture(); try {
    const item = (await f.run('custom-choice', { label: '深入学习主题', title: '机械设计验证', detail: '观察负载与运动', source: 'https://example.org/notes' })).result
    const draft = (await f.run('course-plan', { courseId: item.id })).result; await f.run('confirm', { planId: draft.id })
    // Look up by retained reference rather than relying on other curriculum tasks.
    const bound = f.store.read().plans.find(plan => plan.id === draft.id).tasks.find(value => value.courseRef?.id === item.id)
    assert.equal(taskCourseUnit(bound).studyTopic.title, '机械设计验证')
    await f.run('study-workspace', { taskId: bound.id, action: 'trial', kind: 'basic', conditions: '同一材料', prediction: '变形', observation: '记录到变形', conclusion: '需要测量误差' })
    await f.run('custom-choice', { action: 'update', id: item.id, title: '新名称', detail: '新问题' })
    assert.equal(taskCourseUnit(bound).studyTopic.title, '机械设计验证')
    await f.run('custom-choice', { action: 'delete', id: item.id })
    const state = f.store.read(), review = buildCourseReview(state, state.profile), next = makeDraft(state, review.output, { ...review, mode: 'template' })
    assert.ok(next.tasks.some(value => value.continuedFrom === bound.id && value.studyChoice.title === '机械设计验证'))
    await assert.rejects(f.run('course-plan', { courseId: item.id }))
    assert.equal(f.store.read().studySessions[bound.id].trials[0].selfReported, true)
  } finally { f.close() }
})
test('trial calculation rejects forged cases, empty data, invalid domains and user supplied outcomes', () => {
  const spec = STUDY_TOPICS.find(item => item.id === 'topic-ohm')
  assert.throws(() => calculateStudyTrial(spec, { kind: 'basic', parameters: { voltage: 12, resistance: 100 }, prediction: [0, 0] }))
  assert.throws(() => calculateStudyTrial(spec, { kind: 'custom', parameters: { voltage: 12, resistance: 0 }, prediction: [0, 0] }))
  const row = calculateStudyTrial(spec, { kind: 'reference', parameters: spec.examples[1], prediction: [0, 0], actual: [0, 0], passed: true })
  assert.equal(row.passed, false); assert.deepEqual(row.actual, [.12, 1.44])
})
test('an independent restart uses edited catalog while the same plan retains the completed original topic', async () => {
  const f = fixture(); try {
    const item = (await f.run('custom-choice', { label: '深入学习主题', title: '原主题' })).result
    const draft = (await f.run('course-plan', { courseId: item.id })).result
    await f.run('confirm', { planId: draft.id })
    const state = f.store.read(), old = state.plans.find(plan => plan.id === draft.id).tasks.find(task => task.courseRef?.id === item.id)
    // Build the completed-slot fixture in memory; completion gates are covered above.
    state.evidence[old.id] = { status: 'completed' }
    state.customChoices.find(row => row.id === item.id).title = '新主题'
    const candidate = buildCourseCandidate(state, item.id), next = makeDraft(state, candidate.output, candidate)
    assert.deepEqual(next.tasks.filter(task => task.courseRef?.id === item.id).map(task => task.studyChoice.title), ['原主题', '新主题'])
  } finally { f.close() }
})
for (const mutation of ['update', 'delete']) test('completed custom topic keeps its confirmed definition when continuing after ' + mutation, async () => {
  const f = fixture(); try {
    const item = (await f.run('custom-choice', { label: '深入学习主题', title: '已确认的载荷验证', detail: '保留原始边界' })).result
    const draft = (await f.run('course-plan', { courseId: item.id })).result
    await f.run('confirm', { planId: draft.id })
    const task = f.store.read().plans.find(plan => plan.id === draft.id).tasks.find(value => value.courseRef?.id === item.id)
    const unit = taskCourseUnit(task), fields = { prediction: '明确输入', explanation: '对照结果', transfer: '说明边界' }
    await f.run('study-workspace', { taskId: task.id, action: 'diagnosis', answers: unit.questions.map(row => row.correct) })
    for (const kind of ['basic', 'reference', 'custom']) await f.run('study-workspace', { taskId: task.id, action: 'trial', kind, conditions: '同一条件', prediction: '预测结果', observation: '观察结果', conclusion: '对照边界' })
    await f.run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields })
    await f.run('quiz', { taskId: task.id, answers: unit.questions.map(row => row.correct) })
    await f.run('evidence', { taskId: task.id, artifactText: '三组条件、预测、观察和边界报告', reflection: '还需测量验证', confidence: 3, mode: 'record' })
    await f.run('complete', { taskId: task.id, completed: true })
    await f.run('learning', { taskId: task.id, step: 3, workIndex: 2, minutes: 40, fields, checkpoint: { choice: 'deepen', answer: '比较更多载荷条件' } })
    await f.run('custom-choice', { action: mutation, id: item.id, title: '更改后的目录名称', detail: '新边界' })
    const next = (await f.run('course-next', { taskId: task.id })).result
    const derived = next.tasks.find(value => value.courseRef?.id === item.id)
    assert.equal(derived.studyChoice.title, '已确认的载荷验证')
    assert.equal(derived.studyChoice.detail, '保留原始边界')
    assert.notEqual(derived.courseRef.variant, 'foundation')
    assert.equal(f.store.read().activePlanId, draft.id)
  } finally { f.close() }
})
