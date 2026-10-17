import { GrowthError } from './domain.mjs'

const chinese = { 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 十一:11, 十二:12, 十三:13, 十四:14, 十五:15, 十六:16 }
const numeral = '(?:\\d+(?:\\.\\d+)?|十[一二三四五六]?|[一二两三四五六七八九])'
const value = text => chinese[text] ?? Number(text)
const upperLimit = text => {
  const match = text.match(/(?:每次|单次|每个学习时段)(?:最多|至多|不超过|≤|<=|上限为?)\s*(\d+(?:\.\d+)?)\s*分钟/u)
  return match && Number(match[1]) > 0 ? Number(match[1]) : null
}

/** Check explicit session schedules, without treating every procedural duration as a total. */
export function validatePlanTaskTime(task, profile = {}) {
  const minutes = task.hours * 60, profileLimit = upperLimit(profile.constraints || '')
  for (const [field, text] of [['标题',task.title],['目标',task.objective],...(task.criteria || []).map((text,index)=>['完成标准'+(index+1),text])]) {
    if (typeof text !== 'string') continue
    const localLimit = upperLimit(text)
    if (profileLimit && localLimit && localLimit > profileLimit) invalid(field,'单次上限超过学生约束')
    const limit = localLimit ?? profileLimit
    const exact = new RegExp('分\\s*('+numeral+')\\s*次(?:[，,、：:\\s]*每次)?\\s*('+numeral+')\\s*分钟','gu')
    for (const match of text.matchAll(exact)) {
      const before = text.slice(Math.max(0,match.index-10),match.index), after=text.slice(match.index+match[0].length,match.index+match[0].length+10)
      if (/(?:最多|至多|不超过|不多于|上限(?:为|是)?|以内|至少|最少|不少于|约|大约)\s*$/u.test(before) || /^\s*(?:以内|之内|以下|为上限|上限|以上|左右|上下)/u.test(after)) continue
      const count=value(match[1]), duration=value(match[2])
      if (!Number.isInteger(count) || count<=0 || duration<=0 || Math.abs(count*duration-minutes)>count*.5+1e-6) invalid(field,'明确分次分钟合计与任务hours不一致')
      if (limit && duration>limit+.5) invalid(field,'每次分钟数超过单次上限')
    }
    if (!limit) continue
    const sessions=new RegExp('分\\s*('+numeral+')(?:\\s*[—–－~～至到-]\\s*('+numeral+'))?\\s*(?:次|段|个学习时段)','gu')
    for (const match of text.matchAll(sessions)) {
      const before=text.slice(Math.max(0,match.index-10),match.index)
      // A minimum or approximate count does not promise a fixed schedule.
      if (/(?:至少|最少|不少于|约|大约)\s*$/u.test(before)) continue
      const lower=value(match[1]), upper=match[2]?value(match[2]):lower
      if (!Number.isInteger(lower)||!Number.isInteger(upper)||lower<=0||upper<lower) invalid(field,'分次数量无效')
      if (lower*limit+1e-6<minutes) invalid(field,`分${match[1]}${match[2]?'至'+match[2]:''}次不能在单次${limit}分钟上限内完成${minutes}分钟，至少需要${Math.ceil(minutes/limit)}次`)
    }
  }
}
function invalid(field,reason) { throw new GrowthError('INVALID_MODEL_OUTPUT',`任务${field}中的${reason}，请按实际时间重新生成完整方案。`,422) }
