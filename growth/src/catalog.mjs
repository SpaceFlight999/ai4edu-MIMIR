export const AREAS = [
  { id: 'research', name: '科研', color: '#8c7ad0', verb: '理解与求证' },
  { id: 'competition', name: '竞赛', color: '#cd9466', verb: '设计与实践' },
  { id: 'gpa', name: '绩点', color: '#7193c2', verb: '基础与迁移' },
  { id: 'interest', name: '兴趣', color: '#c2859b', verb: '探索与发现' },
]
export const DEPTHS = [{ id: 'intro', name: '入门' }, { id: 'apply', name: '应用' }, { id: 'deep', name: '深入' }]
export const RESOURCES = [
  { id: 'course-study', area: 'gpa', title: '公开课程学习单元', kind: 'course',
    description: '按选定课程完成原创导学、检查练习和迁移解释；具体内容由课程引用确定。',
    steps: ['阅读一小段导学并写下判断。', '检查练习，解释或纠错。', '记录迁移案例与检验方法。'],
    criteria: ['记录判断与依据', '完成检查并解释答案', '提出迁移案例和检验方法'] },
  { id: 'robot-paper', area: 'research', title: '机器人论文阅读工作坊', kind: 'paper',
    description: '在现有论文导读空间导入一篇你有权使用的机器人论文。明确研究问题、方法、证据与局限。',
    steps: ['选择论文并记录标题、作者和来源。', '用自己的话解释研究问题与方法；标明引用页码。', '区分作者结论、你的推断和仍需验证的问题。'],
    criteria: ['说明研究问题与方法', '引用至少一处原文并标明页码', '提出一项局限或待验证问题'] },
  { id: 'sorting-cell', area: 'competition', title: '机械臂分拣单元设计', kind: 'project',
    description: '项目训练示例：设计传感器、机械臂、输送带与PLC协同的虚拟分拣单元。此处不代表真实赛事规则。',
    steps: ['列出输入、输出、约束与评价指标。', '描述检测、抓取、放置的状态机和异常恢复。', '用流程图或伪代码说明急停、超时和漏检的处理。'],
    criteria: ['明确模块接口与输入输出', '给出正常流程和至少两种异常流程', '提出可验证的评价指标'] },
  { id: 'robot-kinematics', area: 'gpa', title: '平面二连杆机械臂：从公式到理解', kind: 'lesson',
    description: '连杆长L₁、L₂，关节角θ₁、θ₂。末端坐标为x=L₁cosθ₁+L₂cos(θ₁+θ₂)，y=L₁sinθ₁+L₂sin(θ₁+θ₂)。第二关节角相对第一连杆定义。',
    steps: ['画出两段连杆，明确局部角与全局角。', '分别计算两连杆在x、y方向的投影，再相加。', '用零角度与90°特例检查公式；避免混用角度和弧度。'],
    criteria: ['解释θ₂的相对角定义', '正确解出两个特例', '说明一个容易混淆的概念'],
    quizzes: [
      { id: 'q1', question: 'L₁=L₂=1，θ₁=θ₂=0°，末端坐标是？', options: ['(1, 1)', '(2, 0)', '(0, 2)'], correct: 1, hint: '两个连杆都沿x正方向，每段投影为1。', explanation: 'x=1+1=2，y=0，所以坐标是(2, 0)。' },
      { id: 'q2', question: 'L₁=L₂=1，θ₁=0°，θ₂=90°，末端坐标是？', options: ['(1, 1)', '(2, 0)', '(0, 2)'], correct: 0, hint: '第一段沿x正方向，第二段沿y正方向。', explanation: 'x=1+0=1，y=0+1=1。第二段的全局角是θ₁+θ₂。' },
    ] },
  { id: 'embodied-explore', area: 'interest', title: '从具身智能到自己的问题', kind: 'explore',
    description: '选择一个感兴趣的机器人场景，比较感知、规划与执行的分工；用一个小问题探索自己的偏好。',
    steps: ['选择分拣、导航或协作中的一个场景。', '列出感知、规划、执行各需要的信息。', '写出你最想继续探索的问题，以及为何值得投入。'],
    criteria: ['明确一个具体场景', '区分感知、规划与执行', '表达探索偏好及下一步验证方式'] },
]
export const resourceById = (id) => RESOURCES.find((r) => r.id === id)
// These are curated learning associations, not task prerequisites or measured mastery.
export const JOURNEY_CONCEPTS = [
  { id: 'research-question', label: '研究问题', description: '说清论文要解决什么问题，适用情境和约束是什么。', area: 'research', resourceId: 'robot-paper' },
  { id: 'research-method', label: '方法与假设', description: '区分方法步骤、输入输出和作者采用的假设。', area: 'research', resourceId: 'robot-paper' },
  { id: 'research-evidence', label: '证据与局限', description: '定位支持结论的原文，提出仍需验证的条件或问题。', area: 'research', resourceId: 'robot-paper' },
  { id: 'cell-interface', label: '模块接口', description: '说明传感器、机械臂、输送带与PLC如何交换信息。', area: 'competition', resourceId: 'sorting-cell' },
  { id: 'cell-state', label: '状态与异常', description: '组织检测、抓取、放置的状态流程和异常恢复。', area: 'competition', resourceId: 'sorting-cell' },
  { id: 'cell-validation', label: '验证指标', description: '把项目目标转成能够检验的指标和验证过程。', area: 'competition', resourceId: 'sorting-cell' },
  { id: 'kinematics-frame', label: '相对角与坐标', description: '区分关节的相对角和连杆的全局角，明确坐标定义。', area: 'gpa', resourceId: 'robot-kinematics' },
  { id: 'kinematics-projection', label: '投影与位置', description: '将两段连杆在x、y方向的投影相加，解释末端位置。', area: 'gpa', resourceId: 'robot-kinematics' },
  { id: 'kinematics-check', label: '特例检验', description: '用零角度和90°情形检查公式，发现易混淆的概念。', area: 'gpa', resourceId: 'robot-kinematics' },
  { id: 'embodied-perception', label: '感知', description: '辨认机器人在具体场景中需要获取哪些信息。', area: 'interest', resourceId: 'embodied-explore' },
  { id: 'embodied-planning', label: '规划', description: '理解从场景信息到行动选择之间的取舍。', area: 'interest', resourceId: 'embodied-explore' },
  { id: 'embodied-execution', label: '执行与探索', description: '联系动作执行，提出一个自己愿意继续验证的小问题。', area: 'interest', resourceId: 'embodied-explore' },
]
export const JOURNEY_CONCEPT_LINKS = [
  { from: 'research-question', to: 'research-method', label: '方法回应问题', kind: 'concept' },
  { from: 'research-method', to: 'research-evidence', label: '证据支持方法', kind: 'concept' },
  { from: 'cell-interface', to: 'cell-state', label: '接口参与协同', kind: 'concept' },
  { from: 'cell-state', to: 'cell-validation', label: '流程需要验证', kind: 'concept' },
  { from: 'kinematics-frame', to: 'kinematics-projection', label: '坐标解释投影', kind: 'concept' },
  { from: 'kinematics-projection', to: 'kinematics-check', label: '特例检验公式', kind: 'concept' },
  { from: 'embodied-perception', to: 'embodied-planning', label: '信息支持规划', kind: 'concept' },
  { from: 'embodied-planning', to: 'embodied-execution', label: '规划联系执行', kind: 'concept' },
  { from: 'research-evidence', to: 'cell-validation', label: '共同关注验证', kind: 'concept' },
  { from: 'kinematics-projection', to: 'embodied-execution', label: '位置联系动作', kind: 'concept' },
  { from: 'embodied-perception', to: 'cell-interface', label: '感知信息进入接口', kind: 'concept' },
]
export const FORUM_SEED = [
  { id: 'sorting', title: '分拣单元设计：漏检之后如何恢复？', author: '示例同学 · 项目组', tags: ['机器人', '竞赛'], body: '演示主题：正常流程容易写清楚，但当检测超时或抓取失败时，应该怎样恢复？欢迎用状态机讨论。', replies: [{ author: '示例同学 · 控制方向', text: '我会先区分可重试的抓取失败与需要人工确认的安全异常。' }] },
  { id: 'reading', title: '第一次读机器人论文，应该精读到哪里？', author: '示例同学 · 科研入门', tags: ['论文', '培养方案'], body: '演示主题：我的目标是理解方法并找到项目灵感，这一阶段是否需要复现实验？', replies: [{ author: '示例同学 · 学习伙伴', text: '可以先解释清楚输入、输出和证据，再根据目的决定是否复现。' }] },
]
