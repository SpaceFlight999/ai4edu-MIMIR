import { randomUUID } from 'node:crypto'
import { activePlan, fail, number, text } from './domain.mjs'

const question = (question, options, correct, explanation) => ({ question, options, correct, explanation })
const parameter = (id, label, min, max, value) => ({ id, label, min, max, value })
export const STUDY_TOPICS = [
  { id: 'topic-coordinate', title: '二维坐标旋转与平移', detail: '明确参考系，比较旋转和平移的顺序，用点坐标验证变换。', source: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/', formula: 'x′=x cosθ−y sinθ+tx；y′=x sinθ+y cosθ+ty（先旋转再平移，角度为度）', boundary: '理想二维刚体变换；不包含相机畸变、尺度误差和实物标定。', parameters: [parameter('x', '原坐标 x', -100, 100, 1), parameter('y', '原坐标 y', -100, 100, 0), parameter('angle', '旋转角（度）', -180, 180, 90), parameter('tx', '平移 x', -100, 100, 2), parameter('ty', '平移 y', -100, 100, 0)], outputs: ['变换后 x', '变换后 y'], examples: [{ x: 0, y: 0, angle: 0, tx: 0, ty: 0 }, { x: 1, y: 0, angle: 90, tx: 2, ty: 0 }], diagnosis: [question('90°对应多少弧度？', ['π/2', '90', 'π'], 0, '度乘以π/180。'), question('(1,0)逆时针旋转90°后是？', ['(1,1)', '(0,1)', '(0,-1)'], 1, '旋转矩阵把x轴单位向量转到y轴。'), question('旋转和平移能总是交换顺序吗？', ['能', '不能', '只看小数位'], 1, '参考系和操作顺序影响坐标。')] },
  { id: 'topic-ohm', title: '直流电路的电流与功率分析', detail: '统一伏特、欧姆与瓦特，预测并核对理想电阻电路。', source: 'https://ocw.mit.edu/courses/6-002-circuits-and-electronics-spring-2007/', formula: 'I=U/R；P=UI=U²/R', boundary: '理想正电阻直流模型；忽略温升、容差和电源限流，不作为接线操作指导。', parameters: [parameter('voltage', '电压（V）', 0, 48, 12), parameter('resistance', '电阻（Ω）', .1, 100000, 100)], outputs: ['电流（A）', '功率（W）'], examples: [{ voltage: 0, resistance: 100 }, { voltage: 12, resistance: 100 }], diagnosis: [question('欧姆定律的电流表达式是？', ['U/R', 'UR', 'R/U'], 0, '电流单位安培，等于电压除以电阻。'), question('电阻不变，电压加倍，电流如何变化？', ['不变', '加倍', '减半'], 1, 'I与U成正比。'), question('电功率的单位是？', ['欧姆', '伏特', '瓦特'], 2, 'P=UI，单位瓦特。')] },
  { id: 'topic-response', title: '一阶系统的阶跃响应分析', detail: '从时间常数理解响应速度，用零时刻、一个时间常数和自选时刻对照。', source: 'https://underactuated.mit.edu/', formula: 'y(t)=KA(1−exp(−t/τ))，零初始状态，τ>0', boundary: '稳定线性一阶理想模型；不包含时滞、饱和、噪声或真实闭环性能。', parameters: [parameter('gain', '系统增益 K', 0, 100, 1), parameter('amplitude', '阶跃幅值 A', 0, 100, 1), parameter('tau', '时间常数 τ（秒）', .01, 1000, 1), parameter('time', '观察时刻 t（秒）', 0, 10000, 1)], outputs: ['响应 y'], examples: [{ gain: 1, amplitude: 1, tau: 1, time: 0 }, { gain: 1, amplitude: 1, tau: 1, time: 1 }], diagnosis: [question('零初始状态在t=0时，输出为？', ['KA', '0', 'τ'], 1, 'exp(0)=1，因此输出为0。'), question('增益与幅值为1，在t=τ时约为？', ['0.632', '1', '0.368'], 0, '1−exp(−1)约为0.632。'), question('时间常数增大，达到相同比例所需时间？', ['缩短', '不变', '增加'], 2, '更大的τ代表响应更慢。')] },
  { id: 'topic-data', title: '采样数据的均值与离散程度', detail: '用三次测量比较均值与总体标准差，辨别统计描述和设备精度。', source: 'https://docs.python.org/3/library/statistics.html', formula: 'μ=(a+b+c)/3；σ=sqrt(((a−μ)²+(b−μ)²+(c−μ)²)/3)，总体标准差', boundary: '三个样本的描述统计；总体标准差不等于测量不确定度或设备精度。', parameters: [parameter('a', '样本 a', -10000, 10000, 1), parameter('b', '样本 b', -10000, 10000, 2), parameter('c', '样本 c', -10000, 10000, 3)], outputs: ['均值', '总体标准差'], examples: [{ a: 0, b: 0, c: 0 }, { a: 1, b: 2, c: 3 }], diagnosis: [question('1、2、3的均值是？', ['1', '2', '3'], 1, '求和后除以样本数。'), question('三个数完全相同，其标准差是？', ['0', '1', '无法计算'], 0, '每个数偏离均值的距离都为0。'), question('仅凭三个样本标准差能证明设备精度吗？', ['能', '不能', '保留更多小数就能'], 1, '设备精度还要考虑基准、误差来源与重复条件。')] },
]
const customDiagnosis = [question('尚未测量的结果应怎样记录？', ['当成通过', '明确待验证', '删去限制'], 1, '预测与实际观察必须区分。'), question('比较方案时应该？', ['保持输入和单位一致', '各挑最好的数据', '只看名称'], 0, '一致条件才能支持比较。'), question('一次测试通过意味着？', ['所有情况都成立', '不需要复查', '只支持已测试条件'], 2, '结论需要保留适用条件和边界。')]
export function studyTopic(id, choice) {
  const builtin = STUDY_TOPICS.find(item => item.id === id)
  if (builtin) return builtin
  if (choice?.id !== id || choice.label !== '深入学习主题') return null
  return { id, title: choice.title, detail: choice.detail || '明确一个学习问题，再设计可重复的对照。', source: choice.source, custom: true, diagnosis: customDiagnosis, parameters: [], outputs: [], formula: '用户自行选择方法并记录来源、条件、预期和观察', boundary: '自报实验记录，不自动校验任意专业结论或证明掌握程度。' }
}
export function studyFoundation(topic, variant = 'foundation') {
  const field = (id, label, placeholder) => ({ id, label, placeholder, required: true })
  const studyChoice = topic.custom ? { id: topic.id, label: '深入学习主题', title: topic.title, detail: topic.detail, source: topic.source } : undefined
  return { title: topic.title + ' · ' + ({ foundation: '建立理解', transfer: '成果迁移', deepen: '比较与验证', support: '补齐基础' })[variant], unitKey: 'course:' + topic.id + ':' + variant, courseRef: { id: topic.id, variant }, ...(studyChoice ? { studyChoice } : {}), studyTopic: topic,
    course: { id: topic.id, title: topic.title, url: topic.source, provider: topic.custom ? '我的补充来源' : 'MIMIR 原创专题 · 外部资料参考', concepts: [] }, guide: topic.detail + '\n' + topic.formula,
    objective: '围绕' + topic.title + '完成先修检查、三个对照验证并整理可复查的分析报告。', questions: topic.diagnosis,
    criteria: ['完成三项先修检查并写下依据', '完成本单元检查题并解释', '保存基础、参考和自选三个验证记录', '整理应用与验证边界'],
    workshop: { title: topic.title + ' · 从理解到验证', blocks: [
      { title: '检查先修，明确问题', guide: topic.detail + '\n' + topic.formula, hint: topic.custom ? '这里检查验证方法；专业先修内容由你补充并查证。' : '先回答三项基础检查，按提示纠错。', studyLab: 'diagnosis', fields: [field('prediction', '我的判断与先修依据', '说明学习问题、先修知识与判断理由。')] },
      { title: '预测、验证与比较', guide: topic.formula, hint: topic.boundary, studyLab: 'trials', lab: 'course-quiz', fields: [field('explanation', '我的解释与纠错', '用三个保存的验证记录解释结果。')] },
      { title: '整理报告，说明应用', guide: topic.boundary, hint: '从保存记录生成草稿，继续编辑自己的分析。', fields: [field('transfer', '应用场景与检查方法', '注明来源、条件、适用范围和待验证内容。')] },
    ] } }
}
export function publicStudyUnit(unit) { return { ...unit, studyTopic: { ...unit.studyTopic, diagnosis: unit.studyTopic.diagnosis.map(({ correct, explanation, ...item }) => item) }, questions: unit.questions.map(({ correct, explanation, ...item }) => item) } }
export function calculateStudyTrial(topic, input) {
  if (!['basic', 'reference', 'custom'].includes(input.kind)) fail('请选择基础、参考或自选算例。')
  if (topic.custom) return { id: randomUUID(), kind: input.kind, conditions: text(input.conditions, '输入与条件', 1200), prediction: text(input.prediction, '预期结果', 1200), observation: text(input.observation, '实际观察', 1200), conclusion: text(input.conclusion, '对照结论', 1200), passed: true, selfReported: true, at: new Date().toISOString() }
  const parameters = Object.fromEntries(topic.parameters.map(spec => [spec.id, number(input.parameters?.[spec.id], spec.label, spec.min, spec.max)]))
  if (input.kind !== 'custom' && JSON.stringify(parameters) !== JSON.stringify(topic.examples[input.kind === 'basic' ? 0 : 1])) fail('基础与参考算例需使用指定输入。')
  let actual; const p = parameters
  if (topic.id === 'topic-coordinate') { const a = p.angle * Math.PI / 180; actual = [p.x * Math.cos(a) - p.y * Math.sin(a) + p.tx, p.x * Math.sin(a) + p.y * Math.cos(a) + p.ty] }
  if (topic.id === 'topic-ohm') actual = [p.voltage / p.resistance, p.voltage * p.voltage / p.resistance]
  if (topic.id === 'topic-response') actual = [p.gain * p.amplitude * (1 - Math.exp(-p.time / p.tau))]
  if (topic.id === 'topic-data') { const mean = (p.a + p.b + p.c) / 3; actual = [mean, Math.sqrt([p.a, p.b, p.c].reduce((sum, n) => sum + (n - mean) ** 2, 0) / 3)] }
  if (!Array.isArray(input.prediction) || input.prediction.length !== actual.length) fail('请填写全部预测值。')
  const prediction = input.prediction.map(value => number(value, '预测值', -1e9, 1e9)), errors = actual.map((n, i) => Math.abs(n - prediction[i])), passed = errors.every((n, i) => n <= Math.max(.001, Math.abs(actual[i]) * .001))
  return { id: randomUUID(), kind: input.kind, parameters, prediction, actual, errors, passed, at: new Date().toISOString(), tolerance: '绝对误差≤0.001或相对误差≤0.1%；仅用于本练习' }
}
export function prepareStudy(input, state, unitForTask) {
  const task = activePlan(state)?.tasks.find(item => item.id === input.taskId), topic = task && unitForTask(task)?.studyTopic
  if (!topic) fail('请选择当前生效方案的深入学习主题。', 'STALE_TASK', 409)
  if (state.evidence[task.id]?.status === 'completed') fail('请先撤回完成，再修改专题记录。', 'COMPLETED_TASK', 409)
  const saved = state.studySessions?.[task.id] || { trials: [] }; let next
  if (input.action === 'diagnosis') {
    if (!Array.isArray(input.answers) || input.answers.length !== 3 || input.answers.some((n, i) => !Number.isInteger(n) || n < 0 || n >= topic.diagnosis[i].options.length)) fail('请完成三项先修检查。')
    const feedback = topic.diagnosis.map((item, i) => ({ passed: item.correct === input.answers[i], text: item.explanation }))
    next = { ...saved, diagnosis: { answers: input.answers, feedback, correct: feedback.filter(item => item.passed).length, total: 3 } }
  } else if (input.action === 'trial') {
    if (saved.trials.length >= 30) fail('最多保存30条验证记录。')
    next = { ...saved, trials: [...saved.trials, calculateStudyTrial(topic, input)] }
  } else if (input.action === 'remove-trial') {
    if (!saved.trials.some(item => item.id === input.trialId)) fail('这条验证记录不存在。')
    next = { ...saved, trials: saved.trials.filter(item => item.id !== input.trialId) }
  } else fail('专题操作无效。')
  next.at = new Date().toISOString()
  return current => { (current.studySessions ??= {})[task.id] = next; return next }
}
