import { fail, text } from './domain.mjs'
import { COURSES, publicCourseUnit } from './course-catalog.mjs'
import { CORE_COURSES } from './core-courses.mjs'
export { COURSES } from './course-catalog.mjs'

export const KNOWLEDGE_NODES = [
  { id: 'vectors', title: '向量与矩阵', x: 80, y: 70, prerequisites: [], courseIds: ['mit-linear'] },
  { id: 'frames', title: '坐标与变换', x: 310, y: 70, prerequisites: ['vectors'], courseIds: ['modern-robotics'] },
  { id: 'kinematics', title: '正逆运动学', x: 540, y: 70, prerequisites: ['frames'], courseIds: ['mit-robotics', 'modern-robotics'] },
  { id: 'dynamics', title: '动力学基础', x: 80, y: 230, prerequisites: ['vectors'], courseIds: ['mit-robotics'] },
  { id: 'control', title: '反馈与控制', x: 310, y: 230, prerequisites: ['dynamics'], courseIds: ['underactuated'] },
  { id: 'planning', title: '规划与优化', x: 540, y: 230, prerequisites: ['kinematics', 'control'], courseIds: ['underactuated', 'modern-robotics'] },
  { id: 'perception', title: '视觉与感知', x: 80, y: 390, prerequisites: ['vectors'], courseIds: ['mit-linear'] },
  { id: 'integration', title: '系统与验证', x: 310, y: 390, prerequisites: ['planning', 'perception'], courseIds: ['mit-robotics'] },
]
export const COMPETITIONS = [
  { id: 'nuedc', title: '全国大学生电子设计竞赛', tags: ['电路', '嵌入式', '视觉与控制'], basis: '有全国组织、分组与实物测评；适合希望积累工程实现和验证成果的学生。', fit: '有电子、编程或控制基础，能找到指导与实验条件。', commitment: '需要团队、器件与实验时间', url: 'https://www.nuedc-training.com.cn/mobile/publicity/topic2026', checked: '2026-10-05' },
  { id: 'cumcm', title: '全国大学生数学建模竞赛', tags: ['建模', '数据分析', '论文表达'], basis: '主办方有长期办赛记录与公开历史题；适合数学、数据分析与问题抽象训练。', fit: '愿意将真实问题转成假设、模型和可验证结果。', commitment: '需要团队和集中建模时间', url: 'https://www.mcm.edu.cn/', checked: '2026-10-05' },
  { id: 'robomaster', title: 'RoboMaster 机甲大师高校系列赛', tags: ['机器人', '机械', '控制', '系统协同'], basis: '官方公开规则和技术规范；适合在校队条件下积累复杂机器人系统协同经验。', fit: '有校队、指导和硬件预算；可先承担一个明确子系统。', commitment: '团队与硬件投入较高', url: 'https://www.robomaster.com/', checked: '2026-10-05' },
]
export const PROBLEMS = [
  { id: 'nuedc-2025-c', competitionId: 'nuedc', year: 2025, title: 'C 题 · 基于单目视觉的目标物测量装置', type: '历史赛题', source: 'https://res.nuedc-training.com.cn/topic/2025/topic_from_30.html', prompt: '从官方题目提取测量对象、输入、误差与测试条件，再设计数据采集和验证。' },
  { id: 'nuedc-2025-k', competitionId: 'nuedc', year: 2025, title: 'K 题 · 自动避障小车', type: '历史赛题 · 高职高专组', source: 'https://res.nuedc-training.com.cn/topic/2025/topic_from_30.html', prompt: '先核对官方任务与约束，再拆解感知、决策、执行和异常恢复。' },
  { id: 'cumcm-2025', competitionId: 'cumcm', year: 2025, title: '2025 年赛题集 · 自选一题', type: '官方历史题包', source: 'https://www.mcm.edu.cn/html_cn/node/03c91a444e62eee81a3740fa97a461a6.html', prompt: '下载官方题包后记录实际题号与名称，明确问题、假设、数据、模型和验证。' },
  { id: 'robomaster-2025', competitionId: 'robomaster', year: 2025, title: '2025 高校系列赛 · 规则拆解', type: '历史规则训练 · 非独立真题', source: 'https://www.robomaster.com/en-US/resource/pages/announcement/1768', prompt: '选择一个子系统，从官方规则中记录需求与页码，建立接口和测试清单。' },
]
export const WORKSPACE_FIELDS = ['topic', 'requirements', 'references', 'assumptions', 'design', 'interfaces', 'risks', 'testPlan', 'observations', 'next']
export function librarySnapshot() { return { concepts: KNOWLEDGE_NODES, courses: COURSES.map(({ questions, guides, compare, ...course }) => ({ ...course, unit: publicCourseUnit(course.id, 'foundation'), questions: questions.map(({ correct, explanation, ...question }) => question) })), competitions: COMPETITIONS, problems: PROBLEMS } }
export function prepareLibrary(operation, input, before = {}) {
  if (operation === 'content-concept') {
    if ((!KNOWLEDGE_NODES.some(node => node.id === input.conceptId) && !CORE_COURSES.some(core => input.conceptId === 'core:' + core.id)) || !['new', 'learning', 'familiar'].includes(input.status)) fail('知识节点或学习状态无效。')
    return state => { state.knowledgeSelfReport[input.conceptId] = input.status; return { conceptId: input.conceptId, status: input.status } }
  }
  if (operation === 'course-quiz') {
    const course = COURSES.find(item => item.id === input.courseId)
    if (!course || !Array.isArray(input.answers) || input.answers.length !== course.questions.length || input.answers.some((answer, i) => !Number.isInteger(answer) || answer < 0 || answer >= course.questions[i].options.length)) fail('请回答课程中的全部练习题。')
    const result = { courseRef: { id: course.id, variant: 'foundation' }, answers: [...input.answers], correct: course.questions.filter((question, index) => input.answers[index] === question.correct).length, total: course.questions.length, feedback: course.questions.map((question, index) => ({ passed: question.correct === input.answers[index], text: question.explanation })), at: new Date().toISOString() }
    return state => { state.coursePractice[input.courseId] = result; return result }
  }
  if (operation === 'competition-workspace') {
    if ((!PROBLEMS.some(problem => problem.id === input.problemId) && !(before.customChoices ?? []).some(item => item.id === input.problemId && item.label === '竞赛与历史题')) || !Number.isInteger(input.step) || input.step < 0 || input.step > 3) fail('题目或工作台步骤无效。')
    if (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields)) fail('工作台输入格式无效。')
    const fields = {}
    for (const [key, value] of Object.entries(input.fields)) { if (!WORKSPACE_FIELDS.includes(key)) fail('工作台包含未知字段。'); fields[key] = text(value, '工作台记录', 2000, false) }
    return state => { const record = { step: input.step, fields, at: new Date().toISOString() }; state.competitionWorkspaces[input.problemId] = record; return record }
  }
  fail('未知内容操作。')
}
