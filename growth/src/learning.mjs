import { randomUUID } from 'node:crypto'
import { activePlan, fail, number, text } from './domain.mjs'
import { taskCourseUnit } from './course-catalog.mjs'
import { RESOURCES } from './catalog.mjs'

const f = (id, label, placeholder = '', options) => ({ id, label, placeholder, ...(options ? { options } : {}), required: true })
export const WORKSHOPS = {
  'robot-paper': { title: '论文拆解工作坊', blocks: [
    { title: '定位你的论文', hint: '先确认材料和阅读目的。可进入原论文导读，回来继续；这里不会自动读取附件。', fields: [f('paperTitle', '论文标题', '填写你实际选择的论文'), f('source', '来源或作者', '记录出处，便于再次找到'), f('readingGoal', '这次重点看什么', '', ['理解问题与方法', '寻找项目思路', '准备复现'])] },
    { title: '问题与方法对照', hint: '将问题和方法放在一起：这个方法为什么能回应问题？', fields: [f('question', '作者要解决的问题', '用自己的话说明情境和约束'), f('method', '方法与关键假设', '输入是什么，怎样处理，输出是什么？')] },
    { title: '用原文支撑判断', hint: '摘录一小段实际读到的原文，并标明页码。没有材料时可以先保存草稿。', fields: [f('quote', '支持结论的原文片段', '填写短摘录，不能凭印象编造'), f('page', '页码或章节', '例如：第 4 页 / 实验部分'), f('limitation', '一个局限或待验证问题', '换一个条件，结论还成立吗？')] },
  ] },
  'sorting-cell': { title: '分拣方案实验台', blocks: [
    { title: '定义模块接口', hint: '这是一项项目训练。先决定系统接收什么、输出什么、受什么约束。', fields: [f('inputs', '输入信号', '例如：到位、识别结果、机械臂就绪'), f('outputs', '输出动作或信号', '说明由哪个模块接收'), f('constraint', '一个必须满足的约束', '说明场景要求，避免写没有依据的指标')] },
    { title: '排出流程，处理两种异常', hint: '为正常流程选择顺序，再明确两种异常由谁处理、怎样恢复。', fields: [f('flow', '正常流程', '', ['检测 → 抓取 → 放置 → 验证', '检测 → 分类 → 抓取 → 放置 → 验证']), f('exceptionA', '异常一', '', ['漏检', '抓取失败', '超时', '急停']), f('responseA', '异常一怎样处理', '触发条件、处理动作和恢复条件'), f('exceptionB', '异常二', '', ['漏检', '抓取失败', '超时', '急停']), f('responseB', '异常二怎样处理', '应与异常一不同，明确安全边界')] },
    { title: '设计验证方法', hint: '先提出可验证的指标，再说明如何采集数据；不把预计结果写成真实测试结果。', fields: [f('metric', '优先检查的指标', '', ['分拣成功率', '处理周期', '异常恢复时间']), f('validation', '如何验证这个指标', '记录哪些数据、怎样比较、什么结果需要返工？')] },
  ] },
  'robot-kinematics': { title: '二连杆交互带练', blocks: [
    { title: '先预测，再移动连杆', hint: '改变两个关节角，先写预测，再比较末端位置。第二关节角相对第一连杆。', lab: 'kinematics', fields: [] },
    { title: '用两个特例检验', hint: '做完后检查答案。答错可得到提示，再回到连杆实验调整角度。', lab: 'quiz', fields: [] },
    { title: '解释与迁移', hint: '用自己的话解释公式，并指出一个容易混淆的概念。', fields: [f('relativeAngle', '为什么第二段角度是 θ₁ + θ₂？', '区分相对角与全局角'), f('transfer', '一个易错点与检查方法', '例如：角度单位、第二关节的定义或投影符号')] },
  ] },
  'embodied-explore': { title: '兴趣探索工作坊', blocks: [
    { title: '选一个你想了解的场景', hint: '先选场景和吸引你的原因，再看感知、规划和执行分别负责什么。', fields: [f('scene', '探索场景', '', ['机械臂分拣', '室内导航', '人机协作']), f('attraction', '哪一点吸引你', '是看见环境、做出决策，还是让动作发生？')] },
    { title: '为三张信息卡分工', hint: '给信息卡选择职责，再检查你的分类。', lab: 'classification', fields: [] },
    { title: '把兴趣变成一个可探索的问题', hint: '选择最想了解的分工，提出一个小问题和下一步验证方法。', fields: [f('branch', '最想继续了解', '', ['感知', '规划', '执行']), f('exploreQuestion', '我想研究的小问题', '尽量具体到一个条件或一种现象'), f('experiment', '下一步怎样验证', '先看一个案例、做一个小实验，或比较两种方法？')] },
  ] },
}

const extraFields = {
  'robot-kinematics': ['angle1', 'angle2', 'predictX', 'predictY', 'comparison'],
  'embodied-explore': ['class1', 'class2', 'class3'],
}
export const CHECKPOINT_CHOICES = ['enough', 'deepen', 'help']
export function migrateLearningState(state) { const next = { ...state }; for (const key of ['learningSessions', 'knowledgeSelfReport', 'coursePractice', 'competitionWorkspaces', 'researchDigests', 'roboticsSessions', 'studySessions']) if (!(key in next)) next[key] = {}; return next }

export function prepareLearning(input, state) {
  const plan = activePlan(state), task = plan?.tasks.find(item => item.id === input.taskId)
  if (!task) fail('任务不属于当前生效方案，请刷新。', 'STALE_TASK', 409)
  const unit = taskCourseUnit(task)
  const workshop = unit?.workshop || WORKSHOPS[task.resourceId]
  if (!workshop) fail('这项任务暂未提供分步工作坊。')
  if (!Number.isInteger(input.step) || input.step < 0 || input.step > 3 || !Number.isInteger(input.workIndex) || input.workIndex < 0 || input.workIndex >= workshop.blocks.length) fail('学习步骤无效。')
  if (![10, 20, 40].includes(input.minutes)) fail('请选择本次可投入的时间。')
  if (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields)) fail('学习记录格式无效。')
  const specs = workshop.blocks.flatMap(block => block.fields), allowed = new Set([...specs.map(field => field.id), ...(extraFields[task.resourceId] || []), ...(task.topicRef ? ['diag0', 'diag1', 'diag2', 'length1', 'length2', 'angle1', 'angle2', 'angleUnit', 'predictX', 'predictY'] : []), ...(unit?.studyTopic ? ['studyDiag0', 'studyDiag1', 'studyDiag2', 'studyCase', 'studyResult0', 'studyResult1', 'studyConditions', 'studyPrediction', 'studyObservation', 'studyConclusion', ...unit.studyTopic.parameters.map(spec => 'study_' + spec.id)] : [])])
  const fields = {}
  for (const [key, value] of Object.entries(input.fields)) {
    if (!allowed.has(key)) fail('学习记录包含未知字段。')
    const cleaned = text(value, '学习输入', 1800, false), spec = specs.find(field => field.id === key)
    if (spec?.options && cleaned && !spec.options.includes(cleaned)) fail('请选择有效的学习选项。')
    if (task.resourceId === 'robot-kinematics' && ['angle1', 'angle2'].includes(key) && (!cleaned || !Number.isFinite(Number(cleaned)) || Math.abs(Number(cleaned)) > 180)) fail('关节角需要在 -180° 至 180° 之间。')
    if ((key.startsWith('diag') || key.startsWith('studyDiag')) && cleaned && !['0', '1', '2'].includes(cleaned)) fail('请选择有效的先修答案。')
    if (key === 'angleUnit' && cleaned && !['deg', 'rad'].includes(cleaned)) fail('请选择度或弧度。')
    if (key.startsWith('class') && cleaned && !['感知', '规划', '执行'].includes(cleaned)) fail('请选择有效的信息分工。')
    fields[key] = cleaned
  }
  const old = state.learningSessions?.[task.id]
  const scopeStart = input.scopeStart ?? old?.scopeStart ?? 0
  if (!Number.isInteger(scopeStart) || scopeStart < 0 || scopeStart >= workshop.blocks.length) fail('本次实践范围无效。')
  let draftForm = old?.draftForm
  if (input.draftForm) {
    draftForm = { artifactText: text(input.draftForm.artifactText ?? '', '成果草稿', 20000, false), reflection: text(input.draftForm.reflection ?? '', '自评草稿', 4000, false), confidence: number(input.draftForm.confidence, '理解程度自评', 1, 5) }
    const completedForm = { artifactText: state.evidence[task.id]?.artifactText || '', reflection: state.evidence[task.id]?.reflection || '', confidence: state.evidence[task.id]?.confidence || 3 }
    if (state.evidence[task.id]?.status === 'completed' && JSON.stringify(draftForm) !== JSON.stringify(completedForm)) fail('请先撤回完成，再修改成果草稿。', 'COMPLETED_TASK', 409)
  }
  let quizAnswers = old?.quizAnswers
  if (input.quizAnswers !== undefined) {
    const questions = unit?.questions || RESOURCES.find(resource => resource.id === task.resourceId)?.quizzes
    if (!questions || !Array.isArray(input.quizAnswers) || input.quizAnswers.length !== questions.length || input.quizAnswers.some((value, i) => !Number.isInteger(value) || value < -1 || value >= questions[i].options.length)) fail('答题草稿无效。')
    quizAnswers = [...input.quizAnswers]
    if (state.evidence[task.id]?.status === 'completed' && JSON.stringify(quizAnswers) !== JSON.stringify(state.evidence[task.id]?.quiz?.answers)) fail('请先撤回完成，再修改练习答案。', 'COMPLETED_TASK', 409)
  }
  if (state.evidence[task.id]?.status === 'completed' && JSON.stringify(fields) !== JSON.stringify(old?.fields || {})) fail('请先撤回完成标记，再修改学习内容。', 'COMPLETED_TASK', 409)
  let checkpoint = old?.checkpoint || null
  if (input.checkpoint) {
    if (!CHECKPOINT_CHOICES.includes(input.checkpoint.choice)) fail('请选择够用、深耕或需要帮助。')
    const answer = text(input.checkpoint.answer, '目的追问回答', 1200)
    const focus = input.checkpoint.focus || ''
    if (input.checkpoint.choice === 'help' && !['concept', 'time', 'resource', 'other'].includes(focus)) fail('请选择当前卡点。')
    checkpoint = { choice: input.checkpoint.choice, answer, focus: input.checkpoint.choice === 'help' ? focus : '' }
  }
  const changed = checkpoint && JSON.stringify(checkpoint) !== JSON.stringify(old?.checkpoint || null)
  return next => {
    const session = { step: input.step, workIndex: input.workIndex, minutes: input.minutes, fields, checkpoint, scopeStart, ...(draftForm ? { draftForm } : {}), ...(quizAnswers ? { quizAnswers } : {}), at: new Date().toISOString() }
    next.learningSessions[task.id] = session
    if (changed) {
      const labels = { enough: '当前已经够用', deepen: '希望继续深耕', help: '需要帮助' }
      const message = `目标「${task.title}」：${labels[checkpoint.choice]}。目的回答：${checkpoint.answer}`
      const item = { id: randomUUID(), taskId: task.id, kind: 'learning-checkpoint', choice: checkpoint.choice, text: message, at: session.at, mode: 'record' }
      next.feedback.push(item); next.messages.push({ id: item.id, role: 'user', text: message, at: session.at })
      if (checkpoint.choice === 'help') next.journeyObstacles[task.id] = { reason: checkpoint.focus, note: checkpoint.answer.slice(0, 1000), at: session.at }
    }
    return session
  }
}

export function assessCourseQuiz(task, answers) {
  const unit = taskCourseUnit(task)
  if (!unit || !Array.isArray(answers) || answers.length !== unit.questions.length || answers.some((value, i) => !Number.isInteger(value) || value < 0 || value >= unit.questions[i].options.length)) fail('请回答本课程单元的全部练习题。')
  return { courseRef: unit.courseRef, answers: [...answers], total: unit.questions.length, correct: unit.questions.filter((question, i) => question.correct === answers[i]).length,
    feedback: unit.questions.map((question, i) => ({ id: `course-${i}`, passed: question.correct === answers[i], text: question.explanation })) }
}
export function checkCourseCompletion(state, task) {
  if (!task.courseRef) return
  const topic = taskCourseUnit(task)?.studyTopic, saved = state.studySessions?.[task.id]
  if (topic && (saved?.diagnosis?.correct !== 3 || ['basic', 'reference', 'custom'].some(kind => !saved?.trials?.some(trial => trial.kind === kind && trial.passed)))) fail('先完成三项先修检查和基础、参考、自选三个验证记录。', 'COURSE_INCOMPLETE', 409)
  const fields = state.learningSessions[task.id]?.fields || {}, quiz = state.evidence[task.id]?.quiz
  if (['prediction', 'explanation', 'transfer'].some(key => !fields[key]?.trim())) fail('课程目标还需要判断依据、答案解释和迁移检查方法。小步成果已保存，可继续剩余实践。', 'COURSE_INCOMPLETE', 409)
  if (!quiz || quiz.correct !== quiz.total) fail('请先完成当前课程单元的检查练习，按反馈纠错后重试。', 'COURSE_INCOMPLETE', 409)
}
export function learningModelContext(state, plan) {
  if (!plan) return []
  return plan.tasks.flatMap(task => {
    const session = state.learningSessions?.[task.id]
    return session ? [{ taskId: task.id, fields: session.fields, minutes: session.minutes, checkpoint: session.checkpoint, note: '工作坊输入与目的选择是学生记录，不是能力鉴定；正式成果和完成状态单独提供。' }] : []
  })
}
