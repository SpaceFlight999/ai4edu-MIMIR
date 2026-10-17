import test from 'node:test'
import assert from 'node:assert/strict'
import { agentFixture } from './agent-fixture.mjs'
import { defaultProfile, initialState, templatePlan } from '../src/domain.mjs'
import { canonicalEvidenceSummary, evidenceWithModel, feedbackWithModel, planWithModel, researchDigestWithModel } from '../src/model.mjs'
import { publicCourseUnit } from '../src/course-catalog.mjs'

// Capture the request produced by the scoped Agent setup/followup path, with a local provider fixture.
// These tests verify the delivered instructions and data, not an online model's semantic compliance.
function captureRequest(output) {
  const requests = []
  let fixture
  fixture = agentFixture({
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    llm: { async prepareCall() {
      return { async *stream(request) {
        requests.push({ system: request.system, payload: JSON.parse(request.messages[0].content[0].text), tools: fixture.stats.tools })
        yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } }
    } },
  })
  return { ...fixture, requests }
}

test('generation, review and shared adaptation receive the same normalized unit and time rules', async () => {
  const profile = defaultProfile(), plan = templatePlan(profile)
  const state = initialState()
  state.plans = [{ ...plan, id: 'current-plan', stage: 1 }]
  state.activePlanId = 'current-plan'
  const shared = { horizonWeeks: 4, tasks: [{ ...plan.tasks[0] }] }
  for (const options of [{}, { review: true }, { shared }]) {
    const f = captureRequest(plan)
    await planWithModel(f.context, state, profile, undefined, options)
    assert.equal(f.requests.length, 1)
    const { system, payload } = f.requests[0]
    assert.match(system, /按courseRef对应courseUnits的实际title、objective和criteria估计hours/)
    assert.match(system, /summary和rationale的每周及总工时按最终tasks.hours逐项相加/)
    assert.match(system, /分钟块、次数与小时合计必须一致/)
    assert.match(system, /单次上限用任务内分段处理/)
    assert.match(system, /weeklyHours只是预算上限，不能将它写成本周已经安排的工时/)
    assert.match(system, /对照每个courseRef的规范化objective和criteria核对安排理由/)
    assert.match(system, /一旦tasks引用某基础单元，就如实说明已安排/)
    assert.match(system, /条件性备选只放roadmap或questions/)
    assert.match(system, /prerequisites只能引用此前且周次不晚于本任务/)
    assert.match(system, /使用0-based数组下标：第一项是0、第二项是1/)
    assert.match(system, /不能引用自身、之后的任务或未来周次/)
    assert.match(system, /第2项只能引用\[0\]，不是\[1\]/)
    assert.equal(system.split('分钟块、次数与小时合计必须一致').length - 1, 1)
    assert.deepEqual(payload.profile, profile)
    assert.equal(payload.review, Boolean(options.review))
    assert.deepEqual(payload.sharedTemplate, options.shared ?? null)
    assert.equal(payload.current.title, plan.title)
    for (const [id, variant] of [['mit-linear', 'foundation'], ['mit-robotics', 'foundation'], ['topic-coordinate', 'foundation']]) {
      const actual = payload.courseUnits.find(unit => unit.courseRef.id === id && unit.courseRef.variant === variant)
      const registered = publicCourseUnit(id, variant)
      assert.equal(actual.title, registered.title)
      assert.equal(actual.objective, registered.objective)
      assert.deepEqual(actual.criteria, registered.criteria)
      assert.match(actual.note, /MIMIR原创学习单元/)
      assert.match(actual.note, /不等于完成整门公开课/)
    }
    if (options.shared) assert.match(system, /tasks中的每项week必须为数字1或2/)
    assert.equal(f.stats.disposed, 1)
  }
})

test('evidence request keeps original criteria and requires supported work to be credited fairly', async () => {
  const task = { id: 'synthetic-task', resourceId: 'robot-kinematics', title: '局部特例', criteria: ['解释θ₂的相对角定义', '正确解出两个特例', '说明一个容易混淆的概念'] }
  const input = { artifactText: 'θ₂相对第一杆，第二杆全局角为θ₁+θ₂。L₁=L₂=1m，0°/0°得(2,0)m，0°/90°得(1,1)m。', reflection: '希望之后试θ₁非零的迁移。', confidence: 3 }
  const assessment = { summary: '现有成果支持原三项标准；相对角与全局角辨析不必重复另写模板标题。', checks: task.criteria.map(criterion => ({ criterion, status: 'supported', feedback: '原文提供了相应定义、正确特例或相对角与全局角辨析。' })), nextStep: '另取θ₁非零的输入，先预测再核对；不改变本次标准。' }
  const f = captureRequest(assessment), state = initialState(), before = structuredClone(state)
  const result = await evidenceWithModel(f.context, state, task, input)
  const { system, payload } = f.requests[0]
  assert.match(system, /已有正确证据满足原标准就判supported/)
  assert.match(system, /不能临时增加非零角、额外算例或全面掌握等要求/)
  assert.match(system, /进一步迁移只放nextStep，不倒写为本次失败理由/)
  assert.match(system, /不得因未写cos\/sin代入步骤或缺少过程留痕判needs-work/)
  assert.match(system, /不得用“若原标准要求”虚构未发布条件/)
  assert.match(system, /只有原criteria明确要求过程时才检查过程/)
  assert.match(system, /summary与checks的status及依据必须一致/)
  assert.match(system, /不因没有固定模板词语漏读正确解释/)
  assert.match(system, /同一句正确解释可以支持多个原标准/)
  assert.match(system, /反思、信心评分与完成标记不等于掌握/)
  assert.match(system, /先调用growth_robotics_check原样核对/)
  assert.match(system, /没有courseRef时不要调用growth_course_unit/)
  assert.match(system, /绝不能把resourceId送入courseId/)
  assert.deepEqual(payload.task.criteria, task.criteria)
  assert.equal(payload.artifactText, input.artifactText)
  assert.equal(payload.reflection, input.reflection)
  assert.equal(payload.confidence, input.confidence)
  assert.equal(payload.resource.id, task.resourceId)
  assert.ok(!('quizzes' in payload.resource))
  assert.deepEqual(result.assessment, { ...assessment, summary: canonicalEvidenceSummary(assessment.checks) })
  assert.deepEqual(state, before)
})

test('scoped Agent and registered tool contracts preserve angles, predictions and evidence boundaries', async () => {
  const f = captureRequest('先画图并保留你的预测，然后用理想模型核对。')
  await feedbackWithModel(f.context, initialState(), '请核对相对角定义。')
  const { system, tools, payload } = f.requests[0]
  assert.match(system, /不得声称已现场联网、打开链接或读过未提供的全文/)
  assert.match(system, /θ₁相对\+x轴、θ₂相对第一杆，逆时针为正/)
  assert.match(system, /末端从基座的方位不同于第二杆方向/)
  assert.match(system, /θ₁为零时，相对θ₂恰好等于第二杆全局角/)
  assert.match(system, /工具结果只支持同组输入，不能移用于新例/)
  assert.match(system, /不输出未验证的新答案数字/)
  assert.match(system, /不是学生练习记录、硬件实测或完成证明/)
  assert.equal(payload.message, '请核对相对角定义。')
  const courseTool = tools.find(tool => tool.name === 'growth_course_unit')
  assert.match(courseTool.description, /courseRef.id/)
  assert.match(courseTool.description, /查询未命中只说明该courseId未查到/)
  assert.match(courseTool.description, /来源链接不表示本次已打开核验/)
  const numeric = tools.find(tool => tool.name === 'growth_robotics_check')
  assert.match(numeric.description, /angle2相对第一杆，第二杆全局角为angle1\+angle2/)
  assert.match(numeric.parameters.properties.angle2.description, /相对第一杆/)
  assert.match(numeric.parameters.properties.unit.description, /deg为度，rad为弧度/)
  assert.match(numeric.parameters.properties.predictX.description, /学生提供/)
  assert.match(numeric.parameters.properties.predictY.description, /不可替换/)
  assert.equal(numeric.parameters.additionalProperties, false)
  const rightAngle = await numeric.execute({ length1: 1, length2: 1, angle1: 0, angle2: 90, unit: 'deg', predictX: 1, predictY: 1 }, { signal: new AbortController().signal })
  assert.equal(rightAngle.passed, true)
  assert.ok(Math.abs(rightAngle.actual.x - 1) < 1e-12)
  assert.ok(Math.abs(rightAngle.actual.y - 1) < 1e-12)
  const input = { length1: 1, length2: 1, angle1: Math.PI / 6, angle2: Math.PI / 2, unit: 'rad', predictX: Math.sqrt(3) / 2, predictY: 1.5 }
  const original = structuredClone(input)
  const checked = await numeric.execute(input, { signal: new AbortController().signal })
  assert.deepEqual(input, original)
  assert.deepEqual(checked.parameters, { length1: 1, length2: 1, angle1: Math.PI / 6, angle2: Math.PI / 2, unit: 'rad' })
  assert.deepEqual(checked.prediction, { x: original.predictX, y: original.predictY })
  assert.equal(checked.passed, false)
  assert.ok(Math.abs(checked.actual.x - (Math.sqrt(3) - 1) / 2) < 1e-12)
  assert.ok(Math.abs(checked.actual.y - (1 + Math.sqrt(3)) / 2) < 1e-12)
  assert.equal(checked.recordType, 'agent-calculation-only')
  assert.equal(checked.savedToLearning, false)
})

test('digest request preserves journal and DOI metadata without blanket review claims or ID replacement', async () => {
  const collection = { source: 'arXiv', ranking: '按首次提交时间倒序；不是影响力或质量排名', items: [
    { id: '2609.12345v3', title: '合成有发表关联的条目', abstract: '合成摘要，仅比较两个条件。', publication: 'Synthetic Journal 2026, 1(2)', journalRef: 'Synthetic Journal 2026, 1(2)', doi: '10.0000/synthetic', url: 'https://arxiv.org/abs/2609.12345v3' },
    { id: '2609.23456v1', title: '合成缺发表信息的条目', abstract: '合成摘要，方法待核对。', url: 'https://arxiv.org/abs/2609.23456v1' },
  ] }
  const before = structuredClone(collection)
  const output = { overview: '第一项元数据提供期刊关联线索；两项摘要均不足以核实最终评审与全文质量。', items: collection.items.map(item => ({ id: item.id, summary: item.abstract, question: '全文如何定义该比较条件？' })) }
  const f = captureRequest(output)
  const result = await researchDigestWithModel(f.context, collection)
  const { system, payload } = f.requests[0]
  assert.match(system, /保留原id和版本后缀/)
  assert.match(system, /不能用DOI或期刊版本替换arXiv来源身份/)
  assert.match(system, /逐条读取提供的publication、journalRef\/journal_ref与DOI\/doi/)
  assert.match(system, /不能将所有arXiv条目一概判为未评审/)
  assert.match(system, /没有这些字段也不证明从未评审/)
  assert.match(system, /arXiv自身DOI（10\.48550\/arXiv\.\*）仅标识该条目，不能作为期刊发表线索/)
  assert.match(system, /不能单独核实最终同行评审、最终发表版本对应或全文质量/)
  assert.doesNotMatch(system, /条目是按提交日期排列的预印本/)
  assert.match(system, /不得声称已现场联网、打开链接或读过未提供的全文/)
  assert.deepEqual(payload, collection)
  assert.deepEqual(collection, before)
  assert.deepEqual(result.digest.items.map(item => item.id), ['2609.12345v3', '2609.23456v1'])
})
