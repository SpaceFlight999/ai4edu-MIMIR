import { activePlan, fail, templatePlan } from './domain.mjs'
import { courseUnit, nextCourseUnit, taskCourseUnit } from './course-catalog.mjs'

const copiedTasks = plan => plan.tasks.map(task => structuredClone(task))
function setUnit(task, unit, reason) {
  return { ...task, area: 'gpa', resourceId: 'course-study', title: `${unit.course.title} · ${unit.title}`, objective: unit.objective,
    courseRef: unit.courseRef, ...(unit.studyChoice ? { studyChoice: unit.studyChoice } : {}), criteria: unit.criteria, reason }
}
export function buildCourseCandidate(state, courseId, variant = 'foundation', topicUpgrade = false) {
  const choice = state.customChoices?.find(item => item.id === courseId && item.label === '深入学习主题')
  const unit = courseUnit(courseId, variant, false, choice)
  if (!unit) fail('请选择已注册的公开课程。')
  const current = activePlan(state), profile = current?.profile || state.profile
  if (!profile.weights.gpa) fail('课程方向当前没有时间投入，请先在成长配置中调整课程配比。', 'COURSE_WEIGHT_REQUIRED', 409)
  const existing = current?.tasks.find(task => task.courseRef?.id === courseId && state.evidence[task.id]?.status !== 'completed')
  const upgrade = topicUpgrade && courseId === 'mit-robotics' && variant === 'foundation' && existing && existing.topicRef !== unit.topicRef
  if (existing && !upgrade) fail('这门课程已有未完成目标，请从继续学习入口进入。', 'COURSE_ALREADY_ACTIVE', 409)
  const base = current || templatePlan(profile), tasks = copiedTasks(base)
  const index = upgrade ? tasks.findIndex(task => task.id === existing.id) : tasks.findIndex(task => task.area === 'gpa' && state.evidence[task.id]?.status !== 'completed')
  if (index < 0) fail('当前课程目标均已完成，请先进入下一阶段，再加入新课程。', 'COURSE_STAGE_COMPLETE', 409)
  tasks[index] = setUnit(tasks[index], unit, upgrade ? '升级为运动学专题，增加算例验证；旧课程过程和成果保留在历史中。' : '选择这门课程，替换原课程方向目标；其余可延续的学习保留。')
  return { output: { ...base, title: `${unit.course.title} · 阶段学习方案`, summary: unit.studyTopic || unit.topicRef || (courseId === 'mit-robotics' && variant !== 'foundation') ? '把选定主题加入当前阶段，阅读来源材料、记录算例验证并整理报告。确认前当前方案继续有效。' : '把选定课程加入当前阶段，先读一段导学，再做检查和迁移。确认前当前方案继续有效。', rationale: '沿用现有时间预算；课程标题、来源和工作坊由同一课程引用确定。', tasks }, profile,
    continueFrom: current ? current.tasks.map((task, i) => i === index ? null : task.id) : [], replaces: current ? current.tasks.map(task => task.id) : [],
    reasons: tasks.map((task, i) => i === index ? task.reason : '学习内容与完成标准一致，延续已有成果和过程。') }
}
export function buildCourseNext(state, taskId) {
  const current = activePlan(state), source = current?.tasks.find(task => task.id === taskId)
  if (!source?.courseRef) fail('请选择当前阶段中的课程学习目标。', 'STALE_TASK', 409)
  const checkpoint = state.learningSessions[source.id]?.checkpoint
  if (!checkpoint) fail('请先保存够用、深耕或需要帮助的目的选择。')
  if (checkpoint.choice !== 'help' && state.evidence[source.id]?.status !== 'completed') fail('请先完成当前学习目标；尚未完成时也可以选择需要帮助。', 'COURSE_NOT_COMPLETE', 409)
  const unit = nextCourseUnit(state, source, checkpoint.choice)
  if (!unit) fail('这组课程单元已经完成，请在课程目录中选择新的学习目标。', 'COURSE_UNITS_COMPLETE', 409)
  const index = current.tasks.findIndex(task => task.id === source.id), tasks = copiedTasks(current)
  const label = { enough: '已有成果够用，转为一个具体迁移任务', deepen: '继续深耕，增加比较与验证', help: '先补基础，处理当前卡点' }[checkpoint.choice]
  tasks[index] = setUnit(source, unit, `${label}。你的目的：${checkpoint.answer}`)
  return { output: { ...current, title: `课程下一步 · ${unit.title}`, summary: label + '。其他目标按原安排延续，旧成果可在历史与学习页回看。', rationale: tasks[index].reason, tasks }, profile: current.profile,
    continueFrom: current.tasks.map((task, i) => i === index && unit.unitKey !== source.unitKey ? null : task.id), replaces: current.tasks.map(task => task.id),
    reasons: tasks.map((task, i) => i === index ? tasks[index].reason : '保留已有安排，继续上次的学习过程。') }
}
export function buildCourseReview(state, profile) {
  const current = activePlan(state)
  if (!current?.tasks.some(task => task.courseRef)) return null
  const sameBudget = profile.weeklyHours === current.profile.weeklyHours && Object.keys(profile.weights).every(key => profile.weights[key] === current.profile.weights[key] && profile.depths[key] === current.profile.depths[key]) && profile.goal === current.profile.goal
  const fresh = templatePlan(profile)
  const base = sameBudget ? { ...current, roadmap: fresh.roadmap } : fresh
  const tasks = copiedTasks(base), continueFrom = [], replaces = [], reasons = []
  for (let i = 0; i < tasks.length; i++) {
    const old = sameBudget ? current.tasks[i] : current.tasks.find(task => task.area === tasks[i].area && task.week === tasks[i].week)
    if (!old) { reasons.push('按新的投入安排新增任务。'); continue }
    replaces[i] = old.id
    if (old.courseRef) {
      const choice = state.learningSessions[old.id]?.checkpoint?.choice
      const completed = state.evidence[old.id]?.status === 'completed'
      const unit = choice && (completed || choice === 'help') ? nextCourseUnit(state, old, choice) : taskCourseUnit(old)
      if (!unit) { tasks[i] = { ...old, hours: tasks[i].hours, week: tasks[i].week }; continueFrom[i] = old.id; reasons[i] = '保留已完成成果，下一门课程由你选择。'; continue }
      tasks[i] = unit.unitKey === old.unitKey
        ? { ...old, hours: tasks[i].hours, week: tasks[i].week, prerequisites: sameBudget ? old.prerequisites : [], reason: '延续原课程单元，保留已有成果和过程。' }
        : setUnit({ ...tasks[i], prerequisites: sameBudget ? old.prerequisites : [] }, unit, '根据目的选择调整课程单元。')
      if (unit.unitKey === old.unitKey) continueFrom[i] = old.id
      reasons[i] = tasks[i].reason
    } else {
      continueFrom[i] = old.id
      reasons[i] = '沿用未改变的学习内容，保留成果与过程。'
    }
  }
  return { output: { ...base, title: '课程与成长 · 阶段延续方案', summary: '依据课程目的选择安排下一步，并保留内容一致的学习过程。预算变化会在候选中展示。', rationale: '本地规则按已保存的目的选择和当前预算组织候选；确认后才更新。', tasks }, continueFrom, replaces, reasons }
}
