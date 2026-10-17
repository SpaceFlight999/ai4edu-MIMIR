import { randomUUID } from 'node:crypto'
import { AREAS, DEPTHS, RESOURCES, resourceById } from './catalog.mjs'
import { courseUnit } from './course-catalog.mjs'

export class GrowthError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status }
}
export const fail = (message, code = 'INVALID_ARGUMENT', status = 400) => { throw new GrowthError(code, message, status) }
export function text(value, label, max = 2000, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label}需要${required ? '非空、' : ''}不超过${max}字的文字。`)
  return value.trim()
}
export function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label}需要在${min}至${max}之间。`)
  return value
}
export function defaultProfile() {
  return { name: '', major: '智能制造', year: '大二', goal: '围绕机器人与智能产线，建立课程基础，完成一个机械臂分拣单元方案。', weeklyHours: 8, horizonWeeks: 8,
    weights: { research: 25, competition: 35, gpa: 30, interest: 10 }, depths: { research: 'intro', competition: 'apply', gpa: 'apply', interest: 'intro' },
    baseline: '接触过专业基础课程，希望将知识用于机器人项目。', constraints: '', purpose: '希望通过小项目判断自己更喜欢控制、机械设计还是感知方向。' }
}
export function validateProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('培养配置格式不正确。')
  const weights = {}, depths = {}
  for (const area of AREAS) {
    weights[area.id] = number(input.weights?.[area.id], `${area.name}配比`, 0, 100)
    if (!Number.isInteger(weights[area.id])) fail('配比需要整数。')
    depths[area.id] = input.depths?.[area.id]
    if (!DEPTHS.some((d) => d.id === depths[area.id])) fail(`${area.name}目标深度无效。`)
  }
  if (Object.values(weights).reduce((a, b) => a + b, 0) !== 100) fail('四方向配比总计需要为100%。')
  const horizonWeeks = number(input.horizonWeeks ?? 8, '路径周数', 2, 24)
  if (!Number.isInteger(horizonWeeks)) fail('路径周数需要整数。')
  let goals
  if (input.goals !== undefined) {
    if (!Array.isArray(input.goals) || !input.goals.length || input.goals.length > 12) fail('请添加1至12个目标。')
    goals = input.goals.map(value => text(value, '单项目标', 1200))
    if (new Set(goals).size !== goals.length) fail('目标内容请勿重复。')
  }
  return { name: text(input.name ?? '', '称呼', 60, false), major: text(input.major, '专业', 80), year: text(input.year, '年级', 40),
    goal: goals ? goals.join('\n') : text(input.goal, '目标', 1200), ...(goals ? { goals } : {}), weeklyHours: number(input.weeklyHours, '每周投入', 1, 40), horizonWeeks, weights, depths,
    baseline: text(input.baseline ?? '', '当前基础', 2000, false), constraints: text(input.constraints ?? '', '时间约束', 1200, false), purpose: text(input.purpose ?? '', '学习目的', 1200, false) }
}
export function initialState() {
  return { version: 0, profile: defaultProfile(), profileSaved: false, activePlanId: null, plans: [], evidence: {}, feedback: [], messages: [], forum: [], sharedPlans: [], starredPlanIds: [], journeyFocus: {}, journeyChecklist: {}, journeyObstacles: {}, startedAt: null }
}
export function activePlan(state) { return state.plans.find((p) => p.id === state.activePlanId) ?? null }
export function daysFrom(iso, days) { return new Date(new Date(iso).getTime() + days * 86400000).toISOString() }
export function reviewStatus(state, now = new Date().toISOString()) {
  const plan = activePlan(state)
  if (!plan) return { kind: 'none' }
  const completed = plan.tasks.filter((task) => state.evidence[task.id]?.status === 'completed').length
  return { kind: now >= plan.endsAt ? 'stage' : now >= plan.checkInAt ? 'weekly' : 'upcoming', completed, total: plan.tasks.length,
    checkInAt: plan.checkInAt, endsAt: plan.endsAt, pendingFeedback: state.feedback.filter((f) => f.at > plan.createdAt).length }
}
export function validatePlanOutput(output, profile, legacyCourseIndices = new Set(), topicChoices = [], trustedChoices = []) {
  if (!output || typeof output !== 'object' || !Array.isArray(output.tasks) || output.tasks.length < 1 || output.tasks.length > 16) fail('方案需要1至16项学习任务。', 'INVALID_MODEL_OUTPUT', 422)
  const tasks = output.tasks.map((task, i) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) fail('学习任务结构无效。', 'INVALID_MODEL_OUTPUT', 422)
    if (!AREAS.some((a) => a.id === task.area) || profile.weights[task.area] === 0) fail('方案包含未选择的成长方向。', 'INVALID_MODEL_OUTPUT', 422)
    if (!resourceById(task.resourceId) || resourceById(task.resourceId).area !== task.area) fail('方案引用了目录之外或方向不匹配的资源。', 'INVALID_MODEL_OUTPUT', 422)
    const unit = task.courseRef && courseUnit(task.courseRef.id, task.courseRef.variant, legacyCourseIndices.has(i), trustedChoices[i] || topicChoices.find(item => item.id === task.courseRef.id))
    if ((task.resourceId === 'course-study' && !unit) || (task.courseRef && task.resourceId !== 'course-study')) fail('课程任务需要有效的课程与单元引用。', 'INVALID_MODEL_OUTPUT', 422)
    if (![1, 2].includes(task.week)) fail('任务周次需要为第一或第二周。', 'INVALID_MODEL_OUTPUT', 422)
    if (!Array.isArray(task.criteria) || task.criteria.length < 1 || task.criteria.length > 5) fail('任务缺少完成标准。', 'INVALID_MODEL_OUTPUT', 422)
    const prerequisites = task.prerequisites ?? []
    if (!Array.isArray(prerequisites) || prerequisites.some((id) => !Number.isInteger(id) || id < 0 || id >= i || output.tasks[id].week > task.week)) fail('任务前置条件只能引用同周或更早周次中排在此前的任务序号。', 'INVALID_MODEL_OUTPUT', 422)
    return { id: randomUUID(), area: task.area, title: unit ? `${unit.course.title} · ${unit.title}` : text(task.title, '任务名称', 160), objective: unit ? unit.objective : text(task.objective, '任务目的', 1000),
      hours: number(task.hours, '任务时长', 0.25, 40), week: task.week, resourceId: task.resourceId,
      criteria: (unit?.criteria || task.criteria).map((criterion) => text(criterion, '完成标准', 300)), prerequisites, depth: profile.depths[task.area],
      ...(unit ? { courseRef: unit.courseRef, unitKey: unit.unitKey, ...(unit.studyChoice ? { studyChoice: unit.studyChoice } : {}), ...(unit.topicRef ? { topicRef: unit.topicRef } : {}) } : {}) }
  })
  const hours = tasks.reduce((sum, t) => sum + t.hours, 0)
  if (hours > profile.weeklyHours * 2 + 0.01) fail('方案超出双周时间预算，请重新生成或调整时间。', 'INVALID_MODEL_OUTPUT', 422)
  for (const week of [1, 2]) if (tasks.filter((t) => t.week === week).reduce((s, t) => s + t.hours, 0) > profile.weeklyHours + 0.01) fail('单周任务超出可投入时间。', 'INVALID_MODEL_OUTPUT', 422)
  for (const area of AREAS) {
    const actual = tasks.filter((t) => t.area === area.id).reduce((s, t) => s + t.hours, 0)
    if (profile.weights[area.id] >= 20 && actual === 0) fail('方案遗漏了主要成长方向。', 'INVALID_MODEL_OUTPUT', 422)
  }
  if (!Array.isArray(output.questions ?? [])) fail('复盘问题需要为列表。', 'INVALID_MODEL_OUTPUT', 422)
  return { title: text(output.title, '方案标题', 160), summary: text(output.summary, '方案说明', 2400), rationale: text(output.rationale ?? output.summary, '方案依据', 2400),
    roadmap: validateRoadmap(output.roadmap ?? [], profile), questions: (output.questions ?? []).slice(0, 3).map((q) => text(q, '复盘问题', 300)), tasks }
}
function validateRoadmap(rows, profile) {
  if (!Array.isArray(rows) || rows.length > 12) fail('成长路径格式无效。', 'INVALID_MODEL_OUTPUT', 422)
  return rows.map((row) => ({ title: text(row.title, '路径标题', 120), outcome: text(row.outcome, '阶段成果', 600),
    fromWeek: number(row.fromWeek, '开始周次', 1, profile.horizonWeeks), toWeek: number(row.toWeek, '结束周次', row.fromWeek, profile.horizonWeeks) }))
}
export function templatePlan(profile) {
  const tasks = []
  const units = Math.floor(profile.weeklyHours * 4), allocations = {}
  const selected = AREAS.filter((area) => profile.weights[area.id] > 0)
  for (const area of selected) allocations[area.id] = 1
  const remaining = units - selected.length
  const fractions = selected.map((area) => {
    const exact = Math.max(0, remaining) * profile.weights[area.id] / 100
    allocations[area.id] += Math.floor(exact)
    return { id: area.id, fraction: exact - Math.floor(exact) }
  }).sort((a, b) => b.fraction - a.fraction)
  let left = units - Object.values(allocations).reduce((sum, amount) => sum + amount, 0)
  for (let i = 0; left > 0; i++, left--) allocations[fractions[i % fractions.length].id]++
  for (const week of [1, 2]) for (const area of AREAS) {
    const hours = (allocations[area.id] ?? 0) / 4
    if (hours < 0.25) continue
    const resource = RESOURCES.find((r) => r.area === area.id && r.id !== 'course-study')
    tasks.push({ area: area.id, title: `${week === 1 ? '建立理解' : '尝试迁移'} · ${resource.title}`, objective: `${DEPTHS.find((d) => d.id === profile.depths[area.id]).name}目标：${week === 1 ? '明确基础概念与问题' : '将理解用于自己的机器人与产线场景'}。结合个人目标：${profile.goal.slice(0, 150)}`,
      hours, week, resourceId: resource.id, criteria: profile.depths[area.id] === 'deep' ? [...resource.criteria, '比较两种方法或方案，说明取舍并设计验证过程'] : profile.depths[area.id] === 'apply' ? [...resource.criteria, '将概念用于一个自己的具体案例'] : resource.criteria, prerequisites: [] })
  }
  if (!tasks.length) {
    const area = [...AREAS].sort((a, b) => profile.weights[b.id] - profile.weights[a.id])[0]
    const resource = RESOURCES.find((r) => r.area === area.id && r.id !== 'course-study')
    tasks.push({ area: area.id, title: resource.title, objective: '在有限投入中先明确一个基础问题。', hours: 0.5, week: 1, resourceId: resource.id, criteria: resource.criteria, prerequisites: [] })
  }
  return { title: '机器人与智能产线 · 双周成长方案', summary: '按你选择的成长配比与目标深度组织学习。先建立理解，再尝试把基础用于具体场景。这是一份本地规则示例，可用于体验流程。',
    rationale: `每周${profile.weeklyHours}小时；示例时长按四方向比例分配，不代表能力测评。`, tasks,
    roadmap: Array.from({ length: Math.ceil(profile.horizonWeeks / 2) }, (_, i) => ({ title: ['建立基础', '形成方案', '验证与迭代', '总结与迁移'][Math.min(i, 3)], fromWeek: i * 2 + 1, toWeek: Math.min(i * 2 + 2, profile.horizonWeeks), outcome: ['概念笔记与小练习', '分拣单元设计与接口说明', '仿真或案例验证记录', '作品整理与下一阶段目标'][Math.min(i, 3)] })),
    questions: ['这一阶段的成果能否支撑你最初的目的？', '你更享受理解原理、设计系统，还是动手验证？', '哪些方向已经够用，哪些值得继续深入？'] }
}
function sameTaskContent(a, b) {
  const content = task => ({ area: task.area, resourceId: task.resourceId, title: task.title, objective: task.objective, criteria: task.criteria, courseRef: task.courseRef || null, topicRef: task.topicRef || null, studyChoice: task.studyChoice || null })
  return JSON.stringify(content(a)) === JSON.stringify(content(b))
}
export function makeDraft(state, output, { profile = state.profile, mode = 'model', advance = false, source = 'generation', continueFrom = [], replaces = [], reasons = [], importedChoices = [] } = {}) {
  const current = activePlan(state), now = new Date().toISOString()
  // Keep an existing unit version only for an unchanged, server-matched continuation.
  // Neither shared templates nor client-supplied legacy flags can select old rules.
  const legacyCourseIndices = new Set()
  for (const [i, task] of (Array.isArray(output?.tasks) ? output.tasks : []).entries()) {
    const old = current?.tasks.find(item => item.id === continueFrom[i])
    if (old?.courseRef?.id === 'mit-robotics' && old.courseRef.variant === 'foundation' && !old.topicRef && sameTaskContent(old, task)) legacyCourseIndices.add(i)
  }
  const trustedChoices = (output?.tasks || []).map((task, i) => {
    const old = current?.tasks.find(item => item.id === (continueFrom[i] || replaces[i]))
    return old?.courseRef?.id === task.courseRef?.id ? old?.studyChoice : null
  })
  const normalized = validatePlanOutput(output, profile, legacyCourseIndices, [...importedChoices, ...(state.customChoices || [])], trustedChoices)
  const draft = { ...normalized, id: randomUUID(), status: 'draft', mode, source, createdAt: now, profile: validateProfile(profile),
    basedOn: state.activePlanId, stage: current ? current.stage + (advance ? 1 : 0) : 1, advance, startsAt: null, endsAt: null, checkInAt: null }
  const carried = new Set()
  draft.changeSet = draft.tasks.map((task, i) => {
    const previous = current?.tasks.find(item => item.id === (continueFrom[i] || replaces[i]))
    const candidate = current?.tasks.find(item => item.id === continueFrom[i])
    const samePrerequisites = candidate && JSON.stringify(candidate.prerequisites.map(index => current.tasks[index]?.id)) === JSON.stringify(task.prerequisites.map(index => continueFrom[index]))
    if (candidate && !carried.has(candidate.id) && sameTaskContent(candidate, task) && samePrerequisites) { task.continuedFrom = candidate.id; carried.add(candidate.id) }
    if (previous) task.previousTaskId = previous.id
    return { taskId: task.id, previousTaskId: previous?.id || null, title: task.title,
      kind: task.continuedFrom ? 'continue' : previous ? 'replace' : 'new',
      reason: candidate && !task.continuedFrom ? '内容、标准或先修安排有变化，需要重新确认完成；旧成果保留供回看。' : reasons[i] || (task.continuedFrom ? '保留学习内容和已有记录。' : previous ? '内容或完成标准有变化，旧成果保留供回看。' : '新增学习目标。'),
      previousTitle: previous?.title || null, hours: task.hours, previousHours: previous?.hours ?? null }
  })
  for (const old of current?.tasks || []) if (!draft.changeSet.some(change => change.previousTaskId === old.id)) draft.changeSet.push({ previousTaskId: old.id, title: old.title, kind: 'defer', reason: '本候选未安排；原任务和成果保留在历史中。' })
  state.plans.push(draft)
  return draft
}
export function confirmDraft(state, id, now = new Date().toISOString()) {
  const draft = state.plans.find((p) => p.id === id)
  if (!draft || draft.status !== 'draft') fail('候选方案已失效或不存在。', 'STALE_DRAFT', 409)
  if (draft.basedOn !== state.activePlanId) fail('当前方案已经变化，请重新生成。', 'VERSION_CONFLICT', 409)
  const previous = activePlan(state)
  if (previous) previous.status = 'historical'
  // Adding or adapting one course stays inside the current stage. A full
  // configuration/review/import starts its schedule when the learner confirms.
  const preserveDates = previous && !draft.advance && draft.source?.startsWith('course-')
  draft.startsAt = preserveDates ? previous.startsAt : now
  draft.endsAt = preserveDates ? previous.endsAt : daysFrom(now, 14)
  draft.checkInAt = preserveDates ? previous.checkInAt : daysFrom(now, 7)
  draft.status = 'active'; draft.confirmedAt = now; state.activePlanId = id
  for (const task of draft.tasks) {
    if (task.continuedFrom && previous?.tasks.some(item => item.id === task.continuedFrom)) {
      for (const field of ['evidence', 'learningSessions', 'roboticsSessions', 'studySessions', 'journeyChecklist', 'journeyObstacles']) if (state[field]?.[task.continuedFrom]) state[field][task.id] = structuredClone(state[field][task.continuedFrom])
      if (state.journeyFocus?.[previous.id] === task.continuedFrom) state.journeyFocus[draft.id] = task.id
    } else if (task.courseRef?.variant === 'foundation') {
      const quiz = state.coursePractice?.[task.courseRef.id]
      if (quiz && (!quiz.courseRef || quiz.courseRef.variant === 'foundation')) state.evidence[task.id] = { quiz: structuredClone(quiz), quizAt: quiz.at }
    }
  }
  state.profile = draft.profile; state.profileSaved = true; state.startedAt ??= now
  for (const other of state.plans) if (other.status === 'draft') other.status = 'stale'
  return draft
}
export function sharePlan(state) {
  const plan = activePlan(state)
  if (!plan) fail('先确认一份培养方案。')
  return { format: 'mimir-growth-template', schemaVersion: 1, ...shareSafe({ ...plan,
    weights: plan.profile.weights, depths: plan.profile.depths, horizonWeeks: plan.profile.horizonWeeks }) }
}
export function validateShare(input) {
  if (!input || input.format !== 'mimir-growth-template' || input.schemaVersion !== 1) fail('只支持MIMIR v1方案文件。')
  const profile = validateProfile({ ...defaultProfile(), weights: input.weights, depths: input.depths, horizonWeeks: input.horizonWeeks, weeklyHours: 40 })
  const choices = (Array.isArray(input.tasks) ? input.tasks : []).filter(task => task?.studyChoice).map(task => sharedStudyChoice(task.studyChoice, task.courseRef))
  const normalized = validatePlanOutput({ ...input, rationale: '共享模板' }, profile, new Set(), choices)
  return shareSafe({ ...normalized, weights: profile.weights, depths: profile.depths, horizonWeeks: profile.horizonWeeks })
}
function sharedStudyChoice(value, courseRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.label !== '深入学习主题' || typeof value.id !== 'string' || !/^custom-[A-Za-z0-9-]{1,100}$/.test(value.id) || value.id !== courseRef?.id) fail('共享主题定义与课程引用不一致。')
  const source = text(value.source ?? '', '来源地址', 1000, false)
  if (source) {
    let url; try { url = new URL(source) } catch { fail('主题来源需为完整的 http 或 https 地址。') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('主题来源需为不含登录信息的 http 或 https 地址。')
  }
  return { id: value.id, label: value.label, title: text(value.title, '主题名称', 80), detail: text(value.detail ?? '', '主题说明', 1200, false), source }
}
function shareSafe(input) {
  const profile = validateProfile({ ...defaultProfile(), weights: input.weights, depths: input.depths, horizonWeeks: input.horizonWeeks, weeklyHours: 40 })
  return { title: text(input.title, '方案标题', 160), summary: text(input.summary, '方案说明', 2400),
    weights: profile.weights, depths: profile.depths, horizonWeeks: profile.horizonWeeks,
    tasks: input.tasks.map(({ area, title, objective, hours, week, resourceId, criteria, prerequisites = [], courseRef, studyChoice }) => ({ area, title, objective, hours, week, resourceId, criteria: [...criteria], prerequisites: [...prerequisites], ...(courseRef ? { courseRef: { id: courseRef.id, variant: courseRef.variant } } : {}), ...(studyChoice ? { studyChoice: sharedStudyChoice(studyChoice, courseRef) } : {}) })), roadmap: validateRoadmap(input.roadmap ?? [], profile) }
}
export function adaptShare(template, profile) {
  const input = validateShare({ ...template, format: 'mimir-growth-template', schemaVersion: 1 })
  const totals = { 1: 0, 2: 0 }
  for (const task of input.tasks) if (profile.weights[task.area] > 0) totals[task.week] += task.hours
  const retained = input.tasks.map((task, index) => ({ task, index })).filter(({ task }) => profile.weights[task.area] > 0)
  const indices = new Map(retained.map(({ index }, next) => [index, next]))
  const missingPrerequisite = retained.some(({ task }) => task.prerequisites.some(index => !indices.has(index)))
  const tasks = retained.map(({ task }) => ({ ...task, prerequisites: task.prerequisites.map(index => indices.get(index)), hours: Math.max(0.25, Math.floor(task.hours * Math.min(1, profile.weeklyHours / totals[task.week]) * 4) / 4) }))
  const hours = { 1: 0, 2: 0 }
  for (const task of tasks) hours[task.week] += task.hours
  if (missingPrerequisite || hours[1] > profile.weeklyHours || hours[2] > profile.weeklyHours || AREAS.some((a) => profile.weights[a.id] >= 20 && !tasks.some((t) => t.area === a.id))) {
    return { ...templatePlan(profile), title: `重新适配 · ${input.title}`, rationale: '共享方案与当前侧重或时间不匹配，按你的配置重建本地示例。' }
  }
  return { ...input, tasks, roadmap: templatePlan(profile).roadmap, title: `重新适配 · ${input.title}`, rationale: '按当前可投入时间缩放任务，沿用共享方案内容；请确认是否适合自己的基础。', questions: templatePlan(profile).questions }
}
export function assessQuiz(resourceId, answers) {
  const resource = resourceById(resourceId)
  if (!resource?.quizzes || !Array.isArray(answers) || answers.length !== resource.quizzes.length) fail('练习答案格式无效。')
  if (answers.some((answer, i) => !Number.isInteger(answer) || answer < 0 || answer >= resource.quizzes[i].options.length)) fail('请选择每道题的一个有效选项。')
  return { answers: [...answers], total: resource.quizzes.length, correct: resource.quizzes.filter((q, i) => q.correct === answers[i]).length,
    feedback: resource.quizzes.map((q, i) => ({ id: q.id, passed: q.correct === answers[i], text: q.correct === answers[i] ? q.explanation : q.hint })) }
}
