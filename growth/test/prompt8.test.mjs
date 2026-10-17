import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { taskCourseUnit } from '../src/course-catalog.mjs'
import { STUDY_TOPICS, calculateStudyTrial } from '../src/study-topics.mjs'

// Exercise the complete workflow without either diagnosis or quiz submissions.
for (const id of ['mit-robotics', ...STUDY_TOPICS.map(topic => topic.id), 'custom']) {
  test(`${id}: topic completion uses saved practice and report, without authored quizzes`, async () => {
    const store = new GrowthStore(':memory:')
    const service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
    const run = (op, input) => service.execute(op, { ...input, version: store.read().version, requestKey: randomUUID() })
    try {
      const courseId = id === 'custom' ? (await run('custom-choice', { label: '深入学习主题', title: '材料观察', source: 'https://example.org/materials' })).result.id : id
      const draft = (await run('course-plan', { courseId })).result
      const plan = (await run('confirm', { planId: draft.id })).result
      const task = plan.tasks.find(task => task.courseRef?.id === courseId)
      const unit = taskCourseUnit(task)
      for (const block of unit.workshop.blocks) {
        assert.equal(block.guide, undefined)
        assert.notEqual(block.lab, 'course-quiz')
        assert.notEqual(block.studyLab, 'diagnosis')
        assert.notEqual(block.topicLab, 'diagnosis')
      }
      assert.doesNotMatch(unit.criteria.join(' '), /先修检查|检查题|检查练习/)
      await run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: { prediction: '根据来源提出问题', explanation: '比较预测与验证结果', transfer: '说明应用方法与限制' } })
      await run('evidence', { taskId: task.id, artifactText: '保存可复查的对照分析报告', reflection: '保留来源与验证边界', confidence: 3, mode: 'record' })
      await assert.rejects(run('complete', { taskId: task.id, completed: true }), error => error.code === 'COURSE_INCOMPLETE')
      if (task.topicRef) {
        const base = { length1: 1, length2: 1, unit: 'deg' }
        for (const trial of [{ angle1: 0, angle2: 0, predictX: 2, predictY: 0 }, { angle1: 0, angle2: 90, predictX: 1, predictY: 1 }, { angle1: 90, angle2: -90, predictX: 1, predictY: 1 }]) {
          await run('robotics-workspace', { taskId: task.id, action: 'trial', ...base, ...trial })
        }
      } else {
        const topic = unit.studyTopic
        for (const kind of ['basic', 'reference', 'custom']) {
          const trial = topic.custom ? { conditions: '同一材料与条件', prediction: '出现形变', observation: '测得形变', conclusion: '仅支持本次条件' } : (() => {
            const parameters = kind === 'custom' ? Object.fromEntries(topic.parameters.map(spec => [spec.id, spec.value])) : topic.examples[kind === 'basic' ? 0 : 1]
            return { parameters, prediction: calculateStudyTrial(topic, { kind, parameters, prediction: topic.outputs.map(() => 0) }).actual }
          })()
          await run('study-workspace', { taskId: task.id, action: 'trial', kind, ...trial })
        }
      }
      await run('complete', { taskId: task.id, completed: true })
      assert.equal(store.read().evidence[task.id].status, 'completed')
      assert.equal(store.read().evidence[task.id].quiz, undefined)
      const session = (task.topicRef ? store.read().roboticsSessions : store.read().studySessions)[task.id]
      assert.equal(session.diagnosis, undefined)
      // Removing a required practice case must still block completion.
      await run('complete', { taskId: task.id, completed: false })
      await run(task.topicRef ? 'robotics-workspace' : 'study-workspace', { taskId: task.id, action: 'remove-trial', trialId: session.trials[0].id })
      await assert.rejects(run('complete', { taskId: task.id, completed: true }), error => error.code === 'COURSE_INCOMPLETE')
    } finally {
      service.dispose()
      store.close()
    }
  })
}

test('ordinary public courses retain their existing exercise requirement', async () => {
  const store = new GrowthStore(':memory:')
  const service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  const run = (op, input) => service.execute(op, { ...input, version: store.read().version, requestKey: randomUUID() })
  try {
    const draft = (await run('course-plan', { courseId: 'mit-linear' })).result
    const plan = (await run('confirm', { planId: draft.id })).result
    const task = plan.tasks.find(task => task.courseRef?.id === 'mit-linear')
    await run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: { prediction: '变换依据', explanation: '矩阵分析', transfer: '坐标换算' } })
    await run('evidence', { taskId: task.id, artifactText: '坐标变换报告', reflection: '明确坐标系', confidence: 3, mode: 'record' })
    await assert.rejects(run('complete', { taskId: task.id, completed: true }), error => error.code === 'COURSE_INCOMPLETE')
    await run('quiz', { taskId: task.id, answers: taskCourseUnit(task).questions.map(question => question.correct) })
    await run('complete', { taskId: task.id, completed: true })
    assert.equal(store.read().evidence[task.id].status, 'completed')
  } finally {
    service.dispose()
    store.close()
  }
})

for (const variant of ['transfer', 'deepen', 'support']) {
  test(`robotics ${variant}: topic follow-up does not restore authored lessons or quizzes`, async () => {
    const store = new GrowthStore(':memory:')
    const service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
    const run = (op, input) => service.execute(op, { ...input, version: store.read().version, requestKey: randomUUID() })
    try {
      const draft = (await run('course-plan', { courseId: 'mit-robotics', variant })).result
      const plan = (await run('confirm', { planId: draft.id })).result
      const task = plan.tasks.find(task => task.courseRef?.id === 'mit-robotics')
      assert.equal(task.courseRef.variant, variant)
      for (const block of taskCourseUnit(task).workshop.blocks) {
        assert.equal(block.guide, undefined)
        assert.notEqual(block.lab, 'course-quiz')
      }
      await run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: { prediction: '根据来源记录依据', explanation: '分析结果与条件', transfer: '记录应用与验证方法' } })
      await run('evidence', { taskId: task.id, artifactText: '后续学习分析报告', reflection: '说明适用条件', confidence: 3, mode: 'record' })
      await run('complete', { taskId: task.id, completed: true })
      assert.equal(store.read().evidence[task.id].status, 'completed')
      assert.equal(store.read().evidence[task.id].quiz, undefined)
    } finally {
      service.dispose()
      store.close()
    }
  })
}
