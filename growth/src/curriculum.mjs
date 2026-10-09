import { CORE_COURSES } from './core-courses.mjs'
import { COURSES, publicCourseUnit } from './course-catalog.mjs'
import { fail, text } from './domain.mjs'

export function curriculumSnapshot(state) {
  const records = state.plans.filter(plan => ['active', 'historical'].includes(plan.status)).flatMap(plan => plan.tasks)
  const current = state.plans.find(plan => plan.id === state.activePlanId)
  const known = core => state.knowledgeSelfReport?.['core:' + core.id] === 'familiar' || records.some(task => core.courseIds.includes(task.courseRef?.id) && state.evidence[task.id]?.status === 'completed')
  const cores = CORE_COURSES.map(core => {
    const active = current?.tasks.find(task => core.courseIds.includes(task.courseRef?.id) && state.evidence[task.id]?.status !== 'completed')
    const missing = core.prerequisites.filter(id => !known(CORE_COURSES.find(item => item.id === id)))
    const selected = core.courseIds.map(id => COURSES.find(course => course.id === id))
    const quiz = selected.map(course => state.coursePractice?.[course.id]).find(quiz => quiz && quiz.correct < quiz.total)
    const done = known(core), status = active ? 'learning' : state.knowledgeSelfReport?.['core:' + core.id] || (done ? 'recorded' : 'new')
    const variant = active?.courseRef.variant || (quiz ? 'support' : done ? 'transfer' : 'foundation')
    const reason = active ? '已有未完成的对应目标，优先继续上次学习。' : quiz ? '已保存练习里有待纠错的题，先学习基础知识。' : missing.length ? '建议先学习：' + missing.map(id => CORE_COURSES.find(item => item.id === id).title).join('、') : done ? '已有基础记录，可尝试一个迁移案例；记录不代表整门课已掌握。' : '建议先修课已有基础记录，可先做一段导学与概念检查。'
    const courseId = active?.courseRef.id || selected[0].id
    return { ...core, status, missing, reason, recommendedCourseId: courseId, recommendedVariant: variant, practice: publicCourseUnit(courseId, variant), practiceTitle: ({ foundation: '概念检查与解释', support: '错题补基础', transfer: '迁移案例与验证', deepen: '比较方法与验证' })[variant], priority: active ? 0 : quiz ? 1 : !missing.length && !done ? 2 : done ? 3 : 4 }
  })
  return { title: '智能制造 / 机器人 · 核心课路线', note: 'MIMIR 学习建议，不替代学校课表。专科可先做概念与应用单元，本科再补推导和验证；先修是建议，可自行选学。', cores, recommendedIds: [...cores].sort((a, b) => a.priority - b.priority).slice(0, 3).map(core => core.id) }
}

export function curriculumSearch(coreId, keyword = '') {
  const core = CORE_COURSES.find(item => item.id === coreId)
  if (!core) fail('请选择已设计的核心课。')
  const query = text(keyword || core.search, '资料检索词', 120).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim()
  if (!query) fail('请填写检索词。')
  const terms = query.split(' ').slice(0, 12)
  return { id: `materials:${coreId}:${query}`, title: core.title + ' · 资料检索', query: terms.map(term => `all:"${term}"`).join(' AND '), searchTerm: query }
}
