import { EXTRA_COURSES } from './core-courses.mjs'
import { roboticsFoundation } from './robotics-topic.mjs'
import { studyTopic, studyFoundation, publicStudyUnit } from './study-topics.mjs'
const q = (question, options, correct, explanation) => ({ question, options, correct, explanation })
export const COURSE_VARIANTS = ['foundation', 'transfer', 'deepen', 'support']
const variantLabels = { foundation: '建立理解', transfer: '成果迁移', deepen: '比较与验证', support: '补齐基础' }
const lessons = {
  'mit-linear': {
    foundation: ['向量、矩阵与一次变换', '把向量看作有顺序的坐标，把矩阵看作变换规则。A×B 需要 A 的列数等于 B 的行数，结果的行列数来自外侧维度。先用一个二维向量解释变换前后的含义。'],
    transfer: ['把变换用于坐标换算', '将已有的矩阵理解用于相机与机械臂之间的坐标表达。旋转、尺度和平移承担不同作用；记录参考系、单位与验证点，不把一个旋转矩阵当成完整的标定结果。'],
    deepen: ['比较两种变换的先后顺序', '变换的先后顺序可能影响结果。取向量 (1,0)，比较先逆时针旋转 90° 再关于 y 轴镜像，与先镜像再旋转；分别写出结果并解释为什么不能任意交换矩阵乘法顺序。'],
    support: ['从矩阵尺寸补起', '先不推导复杂公式。A 有 2 行 3 列，B 有 3 行 2 列：内侧维度 3 相同，因此可以相乘，结果有 2 行 2 列。逐项写清尺寸，再解释每一行如何与一列配对。'],
  },
  'mit-robotics': {
    foundation: ['从关节到末端位置', '正运动学从关节状态求末端位姿；逆运动学从目标位姿求关节状态。理想模型的计算结果还要通过标定、误差检查与实际验证，才能讨论真实定位效果。'],
    transfer: ['用特例检查一个运动模型', '选择一个你能解释的机械结构，记录关节定义、长度和单位。用零角度与一个非零角度检验模型，再提出如何比较计算位置与实测位置。没有硬件时将实测明确记为待测。'],
    deepen: ['区分计算误差与模型误差', '在相同输入和单位下比较两种建模或标定方法，记录误差、适用范围及重复条件。公式算对并不排除连杆长度、零位或传感器带来的误差。'],
    support: ['先分清输入和输出', '只做一个判断：给定关节角求末端位置是正运动学，给定末端目标求关节角是逆运动学。先画输入、处理、输出，再检查角度是度还是弧度。'],
  },
  'modern-robotics': {
    foundation: ['说明参考坐标系', '同一物理点在不同参考系中的坐标可能不同。记录坐标所属参考系、变换方向和单位；找到逆运动学解后还要检查关节范围与任务约束。'],
    transfer: ['执行一次坐标变换', '对点 (1,0) 先逆时针旋转 90°，再在目标坐标系平移 (2,0)，得到 (2,1)。逐步记录每个中间结果，明确旋转和平移的执行顺序。'],
    deepen: ['比较两个坐标变换顺序', '对同一个点分别先旋转再平移、先平移再旋转，保持输入和单位相同。用中间坐标解释结果差异，并说明在哪个参考系表达平移。'],
    support: ['同一点，两种坐标表达', '先用两个原点不同、坐标轴方向相同的参考系。画出同一物理点，分别记录坐标；数值变化并不意味着物理点移动。'],
  },
  'underactuated': {
    foundation: ['区分自由度与控制输入', '欠驱动系统可直接独立控制的输入不足以覆盖全部运动自由度，但不等于完全不能控制。判断方案时需要同时看动力学、约束与验证条件。'],
    transfer: ['写一份可重复的控制验证计划', '给两种控制方法设置相同初始状态、输入限制和扰动条件，分别记录误差、响应和约束违反。未运行的结果记为待测，不用动画是否流畅判断可靠性。'],
    deepen: ['比较扰动下的控制行为', '明确一个扰动和评价指标，在相同条件下比较方法。记录什么时候恢复、什么时候违反约束，再解释证据能够支持什么、不能支持什么。'],
    support: ['数清能直接控制什么', '列出系统的运动自由度与可以独立施加的控制输入，避免把自由度和电机数量简单混为一谈。先解释一个简单摆的状态与控制能力，再决定是否进入后续专题。'],
  },
}
const practice = {
  'mit-linear': {
    transfer: q('相机坐标换到机械臂坐标，只有旋转矩阵就一定足够吗？', ['一定足够', '还需检查尺度、平移、单位与标定条件', '只需增加小数位'], 1, '坐标换算需要明确参考系和实际条件；旋转不能承担所有作用。'),
    deepen: q('对 (1,0)，先逆时针旋转 90° 再关于 y 轴镜像，与先镜像再旋转，结果如何？', ['均为 (0,1)', '分别为 (0,1) 与 (0,-1)', '均为 (1,0)'], 1, '前者旋转后是 (0,1)，镜像不变；后者先变成 (-1,0)，再旋转为 (0,-1)。'),
    support: q('A 是 2×3，B 是 3×2，A×B 的尺寸是？', ['2×2', '3×3', '不能相乘'], 0, '内侧的 3 相同，外侧的 2 与 2 决定结果尺寸。'),
  },
  'mit-robotics': {
    transfer: q('用零角度特例检查公式的主要作用是什么？', ['证明真实硬件一定准确', '检查模型定义和计算是否一致', '代替全部实验'], 1, '特例能发现定义与计算问题；硬件性能仍需实际验证。'),
    deepen: q('比较两种标定方法时，哪个条件最有解释力？', ['相同测试点和单位下比较误差', '各自挑最好的测试点', '只看公式长度'], 0, '一致测试条件支持有意义的比较，也应记录适用范围。'),
    support: q('给定关节角计算末端位置，输入与输出分别是什么？', ['末端位置 → 关节角', '关节角 → 末端位置', '课程标题 → 电机数量'], 1, '这是正运动学的输入输出关系。'),
  },
  'modern-robotics': {
    transfer: q('(1,0) 先逆时针旋转 90°，再平移 (2,0)，结果是？', ['(2,1)', '(0,3)', '(3,0)'], 0, '先得到 (0,1)，再加上 (2,0)，得到 (2,1)。'),
    deepen: q('先平移再旋转与先旋转再平移，是否总能交换顺序？', ['总能', '不能，需要说明顺序和参考系', '只与课程名称有关'], 1, '组合变换通常依赖顺序；应逐步检查中间结果。'),
    support: q('同一点在不同参考系中坐标不同，意味着什么？', ['物理点一定移动了', '坐标表达依赖参考系', '其中一个参考系一定错误'], 1, '坐标数值是相对参考系的表达，物理点可以保持不动。'),
  },
  'underactuated': {
    transfer: q('未实际运行控制测试时，报告里的结果应该怎样写？', ['预计值当成实测值', '明确待测，并写测试条件和指标', '只写通过'], 1, '验证计划与实测证据要区分，待测仍可保存为过程成果。'),
    deepen: q('比较扰动响应时，哪种记录最可靠？', ['相同扰动、约束和指标下的重复结果', '不同条件下最好看的动画', '仅一个主观评分'], 0, '一致条件和可重复记录支持分析取舍。'),
    support: q('欠驱动是否意味着系统完全无法控制？', ['一定无法控制', '不是，还需要结合动力学与控制能力分析', '只由动画判断'], 1, '欠驱动描述输入与自由度的关系，不是所有控制能力的结论。'),
  },
}
export const courseById = id => COURSES.find(course => course.id === id)
export function courseUnit(id, variant = 'foundation', legacy = false, studyChoice) {
  const study = studyTopic(id, studyChoice)
  if (study) return COURSE_VARIANTS.includes(variant) ? studyFoundation(study, variant) : null
  const course = courseById(id)
  if (!course || !COURSE_VARIANTS.includes(variant)) return null
  if (id === 'mit-robotics' && variant === 'foundation' && !legacy) return roboticsFoundation(course)
  const [topic, guide] = (lessons[id] || course.guides)[variant]
  const questions = variant === 'foundation' ? course.questions : [practice[id]?.[variant] || (variant === 'deepen' ? course.compare : course.questions[variant === 'support' ? 0 : 1])]
  const field = (id, label, placeholder) => ({ id, label, placeholder, required: true })
  return {
    title: `${variantLabels[variant]} · ${topic}`, unitKey: `course:${id}:${variant}`, courseRef: { id, variant },
    course: { id, title: course.title, url: course.url, provider: course.provider, concepts: course.concepts },
    guide, questions,
    objective: `${course.purpose}本单元聚焦：${topic}。`,
    criteria: ['用自己的话记录导学中的判断与依据', '完成本单元检查练习并解释答案', '提出一个迁移案例及可检验的方法'],
    workshop: { title: `${course.title} · ${variantLabels[variant]}`, blocks: [
      { title: '读一小段，先作判断', hint: '这是 MIMIR 原创导学。可打开官方课程核对相关材料，再记录你自己的判断。', guide, fields: [field('prediction', '我的判断与依据', '选导学中的一个问题，先写出判断和理由。')] },
      { title: '检查练习，解释或纠错', hint: '先回答，再解释依据；答错可以重试。检查结果不等于知识掌握度。', lab: 'course-quiz', fields: [field('explanation', '我的答案解释或纠错', '是哪一步支持你的答案？原来的想法需要怎样修改？')] },
      { title: '把成果用于一个具体场景', hint: '写出一个自己的迁移案例与检验方法，没有实际运行的结果明确记为待验证。', fields: [field('transfer', '我的迁移案例与检查方法', '说明输入、预期结果、如何检验，以及当前还不能确定的部分。')] },
    ] },
  }
}
export function taskCourseUnit(task) { return task.courseRef && courseUnit(task.courseRef.id, task.courseRef.variant, !task.topicRef, task.studyChoice) }
export function publicTaskUnit(task) { const unit = taskCourseUnit(task); return unit?.studyTopic ? publicStudyUnit(unit) : unit && { ...unit, questions: unit.questions.map(({ correct, explanation, ...question }) => question) } }
export function publicCourseUnit(id, variant, legacy = false) {
  const unit = courseUnit(id, variant, legacy)
  if (unit?.studyTopic) return publicStudyUnit(unit)
  return unit && { ...unit, questions: unit.questions.map(({ correct, explanation, ...question }) => question) }
}
export function nextCourseUnit(state, task, choice) {
  const id = task.courseRef.id
  const preferred = choice === 'help' ? ['support', 'foundation'] : choice === 'deepen' ? ['deepen', 'transfer'] : ['transfer']
  const completed = new Set(state.plans.flatMap(plan => plan.tasks.filter(item => state.evidence[item.id]?.status === 'completed').map(item => item.unitKey)))
  for (const variant of preferred) if (!completed.has(courseUnit(id, variant, false, task.studyChoice).unitKey) && task.courseRef.variant !== variant) return courseUnit(id, variant, false, task.studyChoice)
  // A help request can revisit an unfinished support unit; its work is continued.
  if (choice === 'help' && state.evidence[task.id]?.status !== 'completed') return courseUnit(id, task.courseRef.variant, false, task.studyChoice)
  const start = COURSES.findIndex(course => course.id === id)
  for (let offset = 1; offset <= COURSES.length; offset++) {
    const course = COURSES[(start + offset) % COURSES.length]
    if (!completed.has(courseUnit(course.id).unitKey) && course.id !== id) return courseUnit(course.id)
  }
  return null
}
export const COURSES = [
  { id: 'mit-linear', title: 'MIT 18.06 · 线性代数', provider: 'MIT OpenCourseWare', level: '基础补齐', language: '英语', year: 2010, url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/', purpose: '先理解向量、矩阵与线性变换，为机器人坐标和计算补基础。', start: '先看向量、矩阵乘法与线性变换相关内容，不要求整门课一次学完。', concepts: ['vectors'], prerequisites: [], questions: [q('将坐标向量乘以一个旋转矩阵，主要在做什么？', ['改变坐标或向量方向的表达', '保证机械臂不碰撞', '自动求出最优路径'], 0, '线性变换可表达旋转等操作；避障与规划还需要其他模型和约束。'), q('做 A×B 前，哪两个维度必须相同？', ['A 的行数与 B 的列数', 'A 的列数与 B 的行数', '两个矩阵的总元素数'], 1, '内侧维度相同，输出的行、列数来自两个外侧维度。')] },
  { id: 'mit-robotics', title: 'MIT 2.12 · 机器人导论', provider: 'MIT OpenCourseWare', level: '本科入门', language: '英语', year: 2005, url: 'https://ocw.mit.edu/courses/2-12-introduction-to-robotics-fall-2005/', purpose: '建立机械结构、运动学与项目设计之间的联系。', start: '按当前目标选运动学讲义和一个项目材料。', concepts: ['kinematics', 'dynamics', 'integration'], prerequisites: ['vectors', 'frames'], questions: [q('已知关节角，求末端位置，属于哪类问题？', ['正运动学', '逆运动学', '参数辨识'], 0, '正运动学从关节状态计算末端位姿；逆运动学则反过来。'), q('能算出末端位置，是否就说明真实机器人定位一定准确？', ['一定准确', '还需考虑标定、模型误差和验证', '只看公式长度'], 1, '理想计算与真实执行之间仍需验证，不应把计算结果当作硬件性能。')] },
  { id: 'modern-robotics', title: 'Modern Robotics · 机器人运动基础', provider: '西北大学 · Kevin Lynch / Frank Park', level: '基础到应用', language: '英语', url: 'https://modernrobotics.northwestern.edu/nu-gm-book-resource/foundations-of-robot-motion/', purpose: '沿坐标、刚体运动、运动学逐步建立机器人运动的表达。', start: '从 Foundations of Robot Motion 开始，再按需要进入运动学章节。', concepts: ['frames', 'kinematics', 'planning'], prerequisites: ['vectors'], questions: [q('描述同一个位置时，为什么需要说明参考坐标系？', ['坐标数值依赖参考系', '坐标系能消除全部误差', '只为改变单位'], 0, '同一物理位置在不同参考系下可能有不同数值。'), q('逆运动学得到一个解，是否可以忽略关节限制？', ['可以', '不可以，还需检查约束', '只需要检查标题'], 1, '可计算的解还须满足关节范围、任务和安全约束。')] },
  { id: 'underactuated', title: 'MIT · Underactuated Robotics', provider: 'MIT · Russ Tedrake', level: '进阶选学', language: '英语', url: 'https://underactuated.mit.edu/', purpose: '进一步理解动力学、控制和规划如何共同影响机器人行为。', start: '先用简单摆与控制案例判断基础是否足够，再选择后续专题。', concepts: ['control', 'planning'], prerequisites: ['vectors', 'dynamics'], questions: [q('欠驱动系统意味着什么？', ['可直接独立控制的自由度不足以覆盖全部运动自由度', '完全没有控制器', '运动一定无法预测'], 0, '欠驱动并不等于无法控制，但需要利用动力学并考虑控制能力。'), q('比较两个控制方案时，哪种做法更可靠？', ['只看动画是否流畅', '在相同条件下比较误差、约束和扰动响应', '只比较代码长度'], 1, '一致条件下的可重复验证比表面展示更有解释力。')] },
  ...EXTRA_COURSES,
]
