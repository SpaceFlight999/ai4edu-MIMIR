import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { connectBrowser, browserPort } from './cdp.mjs'
const browser = await connectBrowser(browserPort()), instance = JSON.parse(readFileSync('.test-data/integration/instance.json'))
const checks = [], exceptions = []
browser.on(event => { if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text) })
async function state() { return browser.evaluate("fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data)") }
async function click(label, scope = '.mg-app', contains = false) {
  assert.equal(await browser.evaluate(`(() => {const el=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(el=>${contains ? 'el.textContent.includes(' + JSON.stringify(label) + ')' : 'el.textContent.trim()===' + JSON.stringify(label)});if(!el||el.disabled)return false;el.click();return true})()`), true, 'Button unavailable: ' + label)
  await new Promise(resolve => setTimeout(resolve, 120)); await browser.waitFor("!document.querySelector('.mg-busy')")
}
async function input(selector, value) {
  assert.equal(await browser.evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return false;const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`), true, 'Input unavailable: ' + selector)
  await new Promise(resolve => setTimeout(resolve, 80))
}
async function field(id, value) { await input('[data-learning-field="' + id + '"]', value) }
async function shot(name) { const result = await browser.send('Page.captureScreenshot', { format: 'png' }); writeFileSync('artifacts/' + name + '.png', Buffer.from(result.data, 'base64')) }
async function openTask(task) {
  await click('世界树', '.mg-topbar nav', true)
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${task.id}"] .mg-todo-open').click()`)
  await browser.waitFor("Boolean(document.querySelector('.mg-todo-inspector'))"); await click('进入完整学习 →', '.mg-todo-inspector')
}
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await browser.evaluate(`(async()=>{const get=()=>fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data);const post=async(op,payload)=>{const s=await get();const r=await fetch('/api/mimir/growth/'+op,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,version:s.version,requestKey:crypto.randomUUID()})});const value=await r.json();if(!value.ok)throw Error(value.error.message);return value.data.result;};const draft=await post('generate',{mode:'template'});await post('confirm',{planId:draft.id});})()`)
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  const s = await state(), plan = s.plans.find(item => item.id === s.activePlanId), task = area => plan.tasks.find(item => item.area === area && item.week === 1)
  await openTask(task('research')); await click('开始这次学习 →'); await click('保存并继续 →')
  assert.equal(await browser.evaluate("Boolean(document.querySelector('.mg-inline-error'))"), true)
  await field('paperTitle', '合成验收论文'); await field('source', '学生提供的合成材料'); await field('readingGoal', '理解问题与方法'); await click('保存并继续 →')
  await field('question', '怎样检测并恢复一次抓取失败？'); await field('method', '比较传感器反馈与状态机判断。'); await click('保存并继续 →')
  await field('quote', '合成材料中的证据片段。'); await field('page', '第 3 页（合成材料）'); await field('limitation', '还需检查误检条件。'); await shot('learning-paper-workshop'); await click('整理成果 →')
  assert.equal(await browser.evaluate("document.querySelector('textarea[maxlength=\"20000\"]').value.includes('合成验收论文')"), true)
  await input('textarea[maxlength="4000"]', '知道如何区分假设与证据。'); await click('仅保存成果与自评'); await click('我确认完成这项目标')
  await click('我想继续深耕', '.mg-learning-checkpoint', true); await input('.mg-learning-checkpoint textarea', '想独立比较两种反馈方法，并在自己的项目场景验证。'); await click('保存目的选择')
  let saved = await state(); assert.equal(saved.learningSessions[task('research').id].checkpoint.choice, 'deepen'); assert.equal(saved.evidence[task('research').id].status, 'completed'); assert.equal(saved.activePlanId, plan.id)
  checks.push('paper workbook guides inputs, generates editable evidence, confirms completion and records a purpose checkpoint without altering the plan')
  await shot('learning-checkpoint')
  await click('查看可开始的下一个目标 →'); assert.notEqual(await browser.evaluate("document.querySelector('.mg-studio-header p').textContent"), task('research').title)
  checks.push('completion has an actionable next-task transition')

  await openTask(task('competition')); await click('开始这次学习 →')
  await field('inputs', '到位、识别结果、机械臂就绪'); await field('outputs', '抓取请求与完成反馈'); await field('constraint', '急停时不得继续运动'); await click('保存并继续 →')
  await field('flow', '检测 → 抓取 → 放置 → 验证'); await field('exceptionA', '漏检'); await field('responseA', '停止当前流程并重新检测'); await field('exceptionB', '漏检'); await field('responseB', '再次检测'); await click('保存并继续 →')
  assert.equal(await browser.evaluate("document.querySelector('.mg-inline-error').textContent.includes('不同')"), true)
  await field('exceptionB', '抓取失败'); await field('responseB', '确认安全条件后重试或人工介入'); await click('保存并继续 →'); await field('metric', '异常恢复时间'); await field('validation', '记录故障开始和恢复时间；先建立测试条件。'); await click('整理成果 →')
  checks.push('competition practice requires distinct exceptions and produces a validation-focused artifact')

  await openTask(task('gpa')); await click('开始这次学习 →'); await input('.mg-prediction label:first-child input', '2'); await input('.mg-prediction label:last-child input', '0'); await click('比较你的预测')
  await click('保存并继续 →'); await browser.evaluate("const groups=document.querySelectorAll('.mg-quiz fieldset');groups[0].querySelectorAll('input')[1].click();groups[1].querySelectorAll('input')[0].click()"); await click('检查答案并获得提示'); await click('保存并继续 →')
  await field('relativeAngle', '第二个关节是相对第一段的角，因此全局角需要相加。'); await field('transfer', '不能混用角度与弧度；用两个特例检查。'); await click('整理成果 →'); assert.equal((await state()).evidence[task('gpa').id].quiz.correct, 2)
  checks.push('kinematics combines prediction, visual experiment, checked questions and explanatory evidence')

  await openTask(task('interest')); await click('开始这次学习 →'); await field('scene', '室内导航'); await field('attraction', '我想知道机器人如何选择路径。'); await click('保存并继续 →')
  for (const [index, answer] of [[1, '感知'], [2, '规划'], [3, '执行']]) await input('.mg-classification label:nth-child(' + index + ') select', answer)
  await click('检查我的分类'); await click('保存并继续 →'); await field('branch', '规划'); await field('exploreQuestion', '有障碍物时如何重新选择路径？'); await field('experiment', '先比较两条小场景路线。'); await click('整理成果 →')
  checks.push('interest exploration contains scene selection, information classification and a testable personal question')

  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('.mg-library-knowledge'))")
  assert.equal(await browser.evaluate("document.querySelectorAll('.mg-library-graph-scroll g').length"), 8)
  await click('我要补齐', '.mg-library-node'); assert.equal((await state()).knowledgeSelfReport.vectors, 'learning')
  await click('MIT 18.06', '.mg-library-node', true); await browser.evaluate("(()=>{const groups=document.querySelectorAll('.mg-course-detail fieldset');groups[0].querySelectorAll('input')[0].click();groups[1].querySelectorAll('input')[1].click()})()"); await click('检查问答并保存练习'); assert.equal((await state()).coursePractice['mit-linear'].correct, 2); await shot('learning-public-course'); await click('把练习记录带入课程目标 →')
  assert.equal(await browser.evaluate("document.querySelector('textarea[maxlength=\"20000\"]').value.includes('MIT 18.06')"), true)
  checks.push('knowledge graph recommends official courses, saves self-reports and questions, and attaches practice to current learning evidence')

  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('.mg-content-page'))"); await click('竞赛与工作台'); await click('C 题', '.mg-competition-catalog', true); await click('读题与约束', '.mg-studio-steps', true)
  await input('[data-workspace-field="topic"]', '2025 C 题练习'); await input('[data-workspace-field="requirements"]', '先核对测量对象和误差要求'); await input('[data-workspace-field="references"]', '官方题包中的 C 题'); await click('保存并继续 →')
  await input('[data-workspace-field="design"]', '标定、检测、测量、误差评估'); await click('保存并继续 →'); await input('[data-workspace-field="testPlan"]', '固定条件，对比已知尺寸与估计结果'); await click('保存并继续 →'); await input('[data-workspace-field="next"]', '先完成标定数据采集'); await click('保存工作台草稿'); await shot('learning-competition-workspace'); await click('带入当前竞赛目标 →')
  assert.equal(await browser.evaluate("document.querySelector('textarea[maxlength=\"20000\"]').value.includes('2025 C 题练习')"), true)
  checks.push('historical official problem opens a persistent staged workspace and returns a draft report to the competition goal')

  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('.mg-content-page'))"); await click('前沿研究 Top N'); await click('联网获取近期成果')
  await browser.waitFor("!document.querySelector('.mg-research-controls button')?.textContent.includes('正在联网')", 26000)
  const liveResearch = await browser.evaluate("Boolean(document.querySelector('.mg-research-row'))")
  if (liveResearch) { await click('查看来源', '.mg-research-list', true); assert.equal(await browser.evaluate("document.querySelector('.mg-research-paper a').href.startsWith('https://arxiv.org/abs/')"), true); await shot('learning-research-feed'); await click('带入论文阅读工作坊 →'); assert.equal(await browser.evaluate("document.querySelector('textarea[maxlength=\"20000\"]').value.includes('https://arxiv.org/abs/')"), true); checks.push('live research lists dated papers, source identifiers and source-linked detail, then returns a reading draft to a research goal') }
  else { assert.equal(await browser.evaluate("document.querySelector('.mg-inline-error')?.textContent.includes('arXiv')"), true); checks.push('restricted-network research failure is explicit and does not fabricate latest papers') }

  await click('诺伦回望', '.mg-topbar nav', true); await click('仍然成立', '.mg-review-dialogue', true); await click('确认，继续 →'); await click('时间或难度超出预期', '.mg-review-dialogue', true); await click('确认，查看选择 →'); assert.equal(await browser.evaluate("document.querySelector('.mg-checkpoint-summary').textContent.includes('独立比较')"), true); await click('保存回顾，选择下一步 →'); assert.equal((await state()).activePlanId, plan.id)
  checks.push('stage dialogue recalls task purpose choices and saves explicit feedback before plan redesign')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }); await openTask(task('gpa')); await shot('learning-studio-narrow'); assert.equal(await browser.evaluate("document.querySelector('.mg-app').scrollWidth<=document.querySelector('.mg-app').clientWidth+1"), true)
  assert.deepEqual(exceptions, [])
  writeFileSync('artifacts/learning-smoke.json', JSON.stringify({ passed: true, checks, liveResearch, paidModelCalls: 0 }, null, 2)); console.log('Learning UI smoke passed: ' + checks.length + ' groups; live research: ' + liveResearch)
} finally { await browser.close() }
