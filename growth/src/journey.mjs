import { JOURNEY_CONCEPTS, JOURNEY_CONCEPT_LINKS } from './catalog.mjs'
import { activePlan, fail, text } from './domain.mjs'
import { ROBOTICS_TOPIC } from './robotics-topic.mjs'

export const OBSTACLE_REASONS = ['concept', 'time', 'resource', 'other']
const journeyFields = ['journeyFocus', 'journeyChecklist', 'journeyObstacles']

// An additive migration: existing plans, evidence, versions and unknown fields remain intact.
export function migrateJourneyState(state) {
  const migrated = { ...state }
  for (const field of journeyFields) if (!(field in migrated)) migrated[field] = {}
  return migrated
}

export function taskProgress(state, taskId) {
  const status = state.evidence[taskId]?.status
  return status === 'completed' ? 'completed' : status === 'submitted' ? 'submitted' : 'pending'
}

export function journeyForPlan(state, plan) {
  const taskStatus = Object.fromEntries(plan.tasks.map(task => [task.id, taskProgress(state, task.id)]))
  const nodes = JOURNEY_CONCEPTS.flatMap(concept => {
    const taskIds = plan.tasks.filter(task => task.resourceId === concept.resourceId).map(task => task.id)
    if (!taskIds.length) return []
    const states = taskIds.map(id => taskStatus[id])
    const status = states.every(value => value === 'completed') ? 'completed' : states.some(value => value !== 'pending') ? 'submitted' : 'pending'
    return [{ ...concept, taskIds, status }]
  })
  for (const task of plan.tasks.filter(task => task.courseRef)) {
    const existing = nodes.find(node => node.id === task.unitKey)
    if (existing) { existing.taskIds.push(task.id); existing.status = existing.taskIds.every(id => taskStatus[id] === 'completed') ? 'completed' : existing.taskIds.some(id => taskStatus[id] !== 'pending') ? 'submitted' : 'pending' }
    else nodes.push({ id: task.unitKey, label: task.title, description: task.objective, area: task.area, resourceId: task.resourceId, taskIds: [task.id], status: taskStatus[task.id] })
  }
  const topicTasks = plan.tasks.filter(task => task.topicRef === ROBOTICS_TOPIC.id)
  for (const concept of topicTasks.length ? ROBOTICS_TOPIC.concepts : []) {
    const states = topicTasks.map(task => state.roboticsSessions?.[task.id])
    const recorded = states.some(session => concept.id === 'trigonometry' || concept.id === 'relative-angle' ? session?.diagnosis : session?.trials.length)
    nodes.push({ id: 'topic:' + ROBOTICS_TOPIC.id + ':' + concept.id, label: concept.title, description: concept.hint + ' 已保存的检查与算例可在关联学习中回看。', area: 'gpa', resourceId: 'course-study', taskIds: topicTasks.map(task => task.id), status: topicTasks.every(task => taskStatus[task.id] === 'completed') ? 'completed' : recorded ? 'submitted' : 'pending' })
  }
  const nodeIds = new Set(nodes.map(node => node.id))
  const links = JOURNEY_CONCEPT_LINKS.filter(link => nodeIds.has(link.from) && nodeIds.has(link.to)).map(link => ({ ...link }))
  if (topicTasks.length) for (const concept of ROBOTICS_TOPIC.concepts) for (const prerequisite of concept.prerequisites) links.push({ from: 'topic:' + ROBOTICS_TOPIC.id + ':' + prerequisite, to: 'topic:' + ROBOTICS_TOPIC.id + ':' + concept.id, type: 'prerequisite', label: '建议先学习' })
  for (const task of topicTasks) links.push({ from: 'topic:' + ROBOTICS_TOPIC.id + ':model-boundary', to: task.unitKey, type: 'application', label: '整理成分析报告' })
  return { nodes, links, taskStatus }
}

export function journeysForState(state) {
  return Object.fromEntries(state.plans.filter(plan => ['active', 'historical'].includes(plan.status)).map(plan => [plan.id, journeyForPlan(state, plan)]))
}

export function prepareJourneyOperation(operation, input, state) {
  const current = activePlan(state)
  if (operation === 'focus-task' && input.taskId === null) {
    if (!current) fail('先确认一份方案，再选择当前专注任务。', 'STALE_TASK', 409)
    return next => { next.journeyFocus[current.id] = null; return { planId: current.id, taskId: null } }
  }
  const task = current?.tasks.find(item => item.id === input.taskId)
  if (!task) fail('任务不属于当前生效方案，请刷新。', 'STALE_TASK', 409)
  if (operation === 'focus-task') return next => {
    next.journeyFocus[current.id] = task.id
    return { planId: current.id, taskId: task.id }
  }
  if (operation === 'check-criterion') {
    if (!Number.isInteger(input.index) || input.index < 0 || input.index >= task.criteria.length) fail('请选择当前任务中有效的目标条目。')
    if (typeof input.checked !== 'boolean') fail('目标勾选状态需要为是或否。')
    return next => {
      next.journeyChecklist[task.id] = { ...next.journeyChecklist[task.id], [input.index]: input.checked }
      return { taskId: task.id, index: input.index, checked: input.checked }
    }
  }
  if (operation === 'task-obstacle') {
    if (input.reason !== null && !OBSTACLE_REASONS.includes(input.reason)) fail('请选择有效的困难类型。')
    const note = text(input.note ?? '', '困难补充', 1000, false)
    return next => {
      if (input.reason === null) { delete next.journeyObstacles[task.id]; return { taskId: task.id, obstacle: null } }
      const obstacle = { reason: input.reason, note, at: new Date().toISOString() }
      next.journeyObstacles[task.id] = obstacle
      return { taskId: task.id, obstacle }
    }
  }
  fail('未知的世界树操作。')
}

// Only the current plan's self-reported learning context enters a model request.
export function journeyModelContext(state, plan) {
  if (!plan) return null
  const focusId = state.journeyFocus?.[plan.id] ?? null
  return {
    note: '勾选、困难和专注均为学生自报，不能证明掌握度或代替成果与完成确认。',
    focusedTaskId: plan.tasks.some(task => task.id === focusId) ? focusId : null,
    tasks: plan.tasks.map(task => ({
      taskId: task.id, title: task.title,
      checkedCriteria: task.criteria.filter((criterion, index) => state.journeyChecklist?.[task.id]?.[index] === true),
      obstacle: state.journeyObstacles?.[task.id] ?? null,
    })),
  }
}
