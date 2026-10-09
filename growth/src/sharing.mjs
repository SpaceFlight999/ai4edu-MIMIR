import { createHash } from 'node:crypto'
import { defaultProfile, sharePlan, templatePlan, validateShare } from './domain.mjs'

function example(id, title, weights, purpose) {
  const profile = { ...defaultProfile(), weights, purpose }
  const output = { ...templatePlan(profile), id, profile, title }
  return { id, title, author: 'MIMIR 示例', example: true, template: sharePlan({ activePlanId: id, plans: [output] }) }
}
export const SHARED_SEED = [
  example('robot-control', '控制与产线 · 项目实践路径', { research: 20, competition: 45, gpa: 25, interest: 10 }, '将课程基础用于一个可以验证的产线设计。'),
  example('robot-reading', '从论文开始 · 机器人研究入门', { research: 45, competition: 15, gpa: 25, interest: 15 }, '理解研究问题，判断自己希望继续深入的方向。'),
]
export function localShare(input, author) {
  const safe = validateShare(input)
  const template = { format: 'mimir-growth-template', schemaVersion: 1, ...safe }
  const id = 'local-' + createHash('sha256').update(JSON.stringify(template)).digest('hex').slice(0, 24)
  return { id, title: safe.title, template, author: author || '我', example: false, savedAt: new Date().toISOString() }
}
export function sharingCatalog(state) {
  const starred = new Set(state.starredPlanIds ?? [])
  return [...SHARED_SEED, ...(state.sharedPlans ?? [])].map(plan => ({ ...plan, starred: starred.has(plan.id), starCount: starred.has(plan.id) ? 1 : 0 }))
}
