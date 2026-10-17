export const ROBOTICS_TOPIC = {
  id: 'planar-2r-v1', title: '二连杆机械臂运动学分析', courseId: 'mit-robotics',
  concepts: [
    { id: 'trigonometry', title: '三角函数与单位', hint: 'cos(0)=1、sin(0)=0；90°=π/2 rad。', prerequisites: [] },
    { id: 'relative-angle', title: '相对角与全局角', hint: '第二关节角相对第一段，第二段全局方向为 θ₁+θ₂。', prerequisites: ['trigonometry'] },
    { id: 'forward-position', title: '末端位置与特例检查', hint: '把两段连杆的 x、y 投影分别相加，用特例核对。', prerequisites: ['relative-angle'] },
    { id: 'model-boundary', title: '模型与真实验证', hint: '平面刚性连杆计算是理想模型；实物还要考虑零位、长度误差与标定。', prerequisites: ['forward-position'] },
  ],
  diagnosis: [
    { id: 'trig', concept: 'trigonometry', question: '一个长度为1、与x轴夹角0°的向量，x、y投影分别是？', options: ['(1, 0)', '(0, 1)', '(1, 1)'], correct: 0, hint: '先画向右的向量：cos(0)=1，sin(0)=0。' },
    { id: 'unit', concept: 'trigonometry', question: '把90°输入使用弧度的三角函数，应该传入什么？', options: ['90', 'π/2', 'π'], correct: 1, hint: '一周360°等于2π rad，90°是一周的四分之一。' },
    { id: 'relative', concept: 'relative-angle', question: 'θ₁=30°、相对第二关节θ₂=60°，第二段相对x轴的方向是？', options: ['60°', '30°', '90°'], correct: 2, hint: '相对角是在第一段方向上再转动，所以是30°+60°。' },
  ],
}
export const publicRoboticsTopic = () => ({ ...ROBOTICS_TOPIC, diagnosis: ROBOTICS_TOPIC.diagnosis.map(({ correct, hint, ...item }) => item) })
export function roboticsFoundation(course) {
  const field = (id, label, placeholder) => ({ id, label, placeholder, required: true })
  const guide = '先把两段连杆分别投影：x=L₁cosθ₁+L₂cos(θ₁+θ₂)，y=L₁sinθ₁+L₂sin(θ₁+θ₂)。第二关节角是相对角；长度用米，三角函数计算时先统一角度单位。'
  return {
    title: '建立理解 · 二连杆机械臂运动学分析', unitKey: 'course:mit-robotics:foundation:planar-2r-v1', topicRef: ROBOTICS_TOPIC.id, courseRef: { id: course.id, variant: 'foundation' },
    course: { id: course.id, title: course.title, url: course.url, provider: course.provider, concepts: course.concepts },
    guide, questions: course.questions, objective: '用相对角与连杆投影解释正运动学，完成三个可复查的仿真算例，整理运动学分析与实物验证边界。',
    criteria: ['记录学习问题与判断依据', '解释验证结果与差异', '验证零角度、直角和自选算例，记录预测与计算误差', '整理应用场景、检查方法与模型边界'],
    workshop: { title: '二连杆机械臂 · 从预测到验证', blocks: [
      { title: '明确运动学问题', hint: '打开课程来源，记录想分析的机械臂运动与自己的判断。', fields: [field('prediction', '我的问题与判断依据', '说明研究问题、角度定义与预测依据。')] },
      { title: '验证三个算例，再解释结果', hint: '在专用工作台填写预测，再验证零角度、直角与自选输入。', topicLab: 'workbench', fields: [field('explanation', '我的验证分析', '用已保存的算例说明两段投影与结果差异。')] },
      { title: '整理运动学分析报告', hint: '先从验证记录生成报告草稿，再说明能用于哪个场景、还有什么不能确定。', fields: [field('transfer', '我的应用场景与检查方法', '例如分拣点定位：说明坐标系、单位、实测方法和待验证的误差。')] },
    ] },
  }
}
