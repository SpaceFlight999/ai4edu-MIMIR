import { randomUUID } from 'node:crypto'
import { activePlan, fail, number } from './domain.mjs'
import { ROBOTICS_TOPIC } from './robotics-topic.mjs'

export function assessRoboticsDiagnosis(answers) {
  if (!Array.isArray(answers) || answers.length !== ROBOTICS_TOPIC.diagnosis.length || answers.some((answer, i) => !Number.isInteger(answer) || answer < 0 || answer >= ROBOTICS_TOPIC.diagnosis[i].options.length)) fail('请完成三项先修检查。')
  const feedback = ROBOTICS_TOPIC.diagnosis.map((item, i) => ({ id: item.id, concept: item.concept, passed: item.correct === answers[i], hint: item.hint }))
  return { answers: [...answers], correct: feedback.filter(item => item.passed).length, total: feedback.length, feedback, at: new Date().toISOString() }
}
export function calculateRoboticsTrial(input) {
  if (!['deg', 'rad'].includes(input.unit)) fail('请选择度或弧度。')
  const limit = input.unit === 'deg' ? 180 : Math.PI
  const parameters = { length1: number(input.length1, '第一段长度（米）', .01, 10), length2: number(input.length2, '第二段长度（米）', .01, 10), angle1: number(input.angle1, '第一关节角', -limit, limit), angle2: number(input.angle2, '第二关节相对角', -limit, limit), unit: input.unit }
  const prediction = { x: number(input.predictX, '预测x（米）', -20, 20), y: number(input.predictY, '预测y（米）', -20, 20) }
  const factor = input.unit === 'deg' ? Math.PI / 180 : 1, a = parameters.angle1 * factor, b = parameters.angle2 * factor
  const joint = { x: parameters.length1 * Math.cos(a), y: parameters.length1 * Math.sin(a) }
  const actual = { x: joint.x + parameters.length2 * Math.cos(a + b), y: joint.y + parameters.length2 * Math.sin(a + b) }
  const error = Math.hypot(prediction.x - actual.x, prediction.y - actual.y), passed = error <= .02
  const kind = Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9 ? 'zero' : Math.abs(a) < 1e-9 && Math.abs(b - Math.PI / 2) < 1e-9 ? 'right' : 'custom'
  return { id: randomUUID(), parameters, prediction, joint, actual, error, passed, kind, tolerance: .02, at: new Date().toISOString(), source: '理想平面刚性二连杆仿真', feedback: passed ? '预测与模型计算一致。继续核对角度定义与实物验证边界。' : '预测需要调整：按单位换算角度，第二段使用θ₁+θ₂，两段x、y投影分别相加；长度仍按米计算。' }
}
export function prepareRobotics(input, state) {
  const task = activePlan(state)?.tasks.find(item => item.id === input.taskId)
  if (!task || task.topicRef !== ROBOTICS_TOPIC.id) fail('请选择当前生效方案的二连杆运动学专题。', 'STALE_TASK', 409)
  if (state.evidence[task.id]?.status === 'completed') fail('请先撤回完成标记，再修改验证记录。', 'COMPLETED_TASK', 409)
  const saved = state.roboticsSessions[task.id] || { topicRef: ROBOTICS_TOPIC.id, trials: [] }
  let session
  if (input.action === 'diagnosis') session = { ...saved, diagnosis: assessRoboticsDiagnosis(input.answers) }
  else if (input.action === 'trial') {
    if (saved.trials.length >= 30) fail('已经保存30条验证记录，请用已有记录整理成果。', 'TRIAL_LIMIT', 409)
    session = { ...saved, trials: [...saved.trials, calculateRoboticsTrial(input)] }
  } else if (input.action === 'remove-trial') {
    if (!saved.trials.some(trial => trial.id === input.trialId)) fail('这条试算记录不存在，请刷新。')
    session = { ...saved, trials: saved.trials.filter(trial => trial.id !== input.trialId) }
  } else fail('请选择先修检查或算例验证。')
  session.at = new Date().toISOString()
  return next => { next.roboticsSessions[task.id] = session; return session }
}
export function checkRoboticsCompletion(state, task) {
  if (task.topicRef !== ROBOTICS_TOPIC.id) return
  const session = state.roboticsSessions[task.id]
  if (!session?.diagnosis || session.diagnosis.correct !== session.diagnosis.total) fail('请先按提示完成三项先修检查，再确认专题完成。', 'COURSE_INCOMPLETE', 409)
  for (const kind of ['zero', 'right', 'custom']) if (!session.trials.some(trial => trial.kind === kind && trial.passed)) fail('专题还需要零角度、直角和自选输入的正确验证记录。已有记录保留，可回到专用工作台继续。', 'COURSE_INCOMPLETE', 409)
}
