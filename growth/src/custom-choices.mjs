import { randomUUID } from 'node:crypto'
import { fail, text } from './domain.mjs'
import { RESEARCH_TOPICS } from './research.mjs'

export const CHOICE_LABELS = ['专业方向', '学习目标', '学习目的', '核心课', '公开课', '竞赛与历史题', '研究方向', '兴趣方向', '深入学习主题']
export function prepareCustomChoice(input, before) {
  const action = input.action || 'create'
  if (!['create', 'update', 'delete', 'select'].includes(action)) fail('补充操作无效。')
  const previous = action !== 'create' && (before.customChoices ?? []).find(item => item.id === input.id)
  if (action !== 'create' && !previous) fail('这项补充已不存在，请刷新。', 'CUSTOM_CHOICE_MISSING', 409)
  if (action === 'select') return state => { (state.customChoiceSelections ??= {})[previous.label] = previous.id; return previous }
  if (action === 'delete') return state => {
    state.customChoices = state.customChoices.filter(item => item.id !== previous.id)
    if (state.customChoiceSelections?.[previous.label] === previous.id) delete state.customChoiceSelections[previous.label]
    delete state.researchDigests?.[previous.id]
    return { id: previous.id, deleted: true }
  }
  if (previous) input = { ...input, label: previous.label }
  if (!CHOICE_LABELS.includes(input.label)) fail('补充类型无效。')
  const title = text(input.title, '名称', 80), detail = text(input.detail ?? '', '补充说明', 1200, false)
  const source = text(input.source ?? '', '来源地址', 1000, false)
  if (source) {
    let url; try { url = new URL(source) } catch { fail('来源需为完整的 http 或 https 地址。') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('来源需为不含登录信息的 http 或 https 地址。')
  }
  const existing = (before.customChoices ?? []).filter(item => item.label === input.label)
  if (existing.some(item => item.id !== previous?.id && item.title === title)) fail('这个名称已经添加，可直接选择已有补充。')
  if (!previous && existing.length >= 50) fail('每类最多保存50项补充。')
  const item = { id: previous?.id || 'custom-' + randomUUID(), label: input.label, title, detail, source, at: previous?.at || new Date().toISOString(), ...(previous ? { updatedAt: new Date().toISOString() } : {}) }
  return state => {
    if (previous) { state.customChoices[state.customChoices.findIndex(value => value.id === previous.id)] = item; delete state.researchDigests?.[item.id] }
    else (state.customChoices ??= []).push(item)
    return item
  }
}
export function researchTopic(id, state) {
  const known = RESEARCH_TOPICS.find(item => item.id === id)
  if (known) return known
  const item = (state.customChoices ?? []).find(item => item.id === id && ['研究方向', '兴趣方向'].includes(item.label))
  if (!item) fail('请选择已收录或自己添加的研究方向。')
  const terms = (item.detail || item.title).slice(0, 120).match(/[\p{L}\p{N}_-]+/gu)
  if (!terms?.length) fail('研究方向需要有效的检索词。')
  return { id: item.id, title: item.title, query: terms.slice(0, 12).map(term => 'all:"' + term + '"').join(' AND '), searchTerm: terms.join(' ') }
}
export function customProblem(item) {
  return { id: item.id, title: item.title, source: item.source, year: '自定义', type: '个人补充', prompt: item.detail || '先记录任务、来源与约束，再设计自己的验证过程。' }
}
