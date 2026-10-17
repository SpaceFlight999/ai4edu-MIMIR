// Synthetic, isolated native host and browser validation. Never opens learner data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { connectBrowser } from './cdp.mjs'
import { GrowthStore } from '../growth/src/store.mjs'
import { createGrowthService } from '../growth/src/host.mjs'
import { courseUnit } from '../growth/src/course-catalog.mjs'

const growthVersion = JSON.parse(readFileSync('growth/package.json', 'utf8')).version
const root = resolve('.'), home = join(root, '.test-data', `robotics-topic-${randomUUID()}`), browserHome = join(home, 'browser-profile')
const reportPath = join(root, `artifacts/robotics-topic-smoke-${growthVersion}.json`)
mkdirSync(home, { recursive: true })
const learnerFile = join(root, 'data/student-1/mimir-growth/growth.sqlite')
const learnerHash = () => existsSync(learnerFile) ? createHash('sha256').update(readFileSync(learnerFile)).digest('hex') : null
const priorLearnerHash = learnerHash(), checks = [], errors = [], dialogs = []
let materialsLive = null
let host, edge, browser, instance, hostOutput = ''
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function ready(file, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (existsSync(file)) return; await delay(100) }
  throw new Error('Isolated instance did not become ready')
}
async function startHost() {
  host = spawn(process.execPath, [join(root, 'runtime/system/app/app.mjs'), '--headless', '--data-home', home], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  hostOutput = ''
  for (const stream of [host.stdout, host.stderr]) stream.on('data', data => { hostOutput = (hostOutput + data).slice(-12000) })
  await ready(join(home, 'instance.json'))
  instance = JSON.parse(readFileSync(join(home, 'instance.json')))
}
async function stopHost() {
  if (instance) await fetch(`http://127.0.0.1:${instance.controlPort}/exit`, { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(4000) }).catch(() => {})
  const end = Date.now() + 8000
  while (host && host.exitCode === null && Date.now() < end) await delay(100)
  if (host?.exitCode === null) host.kill()
  host = null; instance = null
}
async function click(label, scope = '.mg-app', contains = false) {
  assert.equal(await browser.evaluate(`(() => {const el=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(el=>${contains ? 'el.textContent.includes(' + JSON.stringify(label) + ')' : 'el.textContent.trim()===' + JSON.stringify(label)}); if(!el||el.disabled)return false; el.click();return true})()`), true, 'Unavailable button: ' + label)
  await delay(140); await browser.waitFor("!document.querySelector('.mg-busy')")
}
async function input(selector, value) {
  assert.equal(await browser.evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return false;const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`), true, 'Unavailable field: ' + selector)
  await delay(100)
}
async function state() { return browser.evaluate("fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data)") }
async function shot(name) { const png = await browser.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(root, 'artifacts', growthVersion + '-' + name + '.png'), Buffer.from(png.data, 'base64')) }
async function apiCheck() {
  const origin = new URL(instance.url).origin
  assert.equal((await fetch(origin + '/api/mimir/growth/state')).status, 401)
  const login = await fetch(instance.url, { redirect: 'manual' }), cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie)
  const get = async path => { const response = await fetch(origin + path, { headers: { cookie } }); assert.equal(response.status, 200); return response }
  assert.equal((await (await get('/api/mimir/growth/state')).json()).data.growthVersion, growthVersion)
  await get('/api/mimir/document'); await get('/api/mimir/growth/library')
  const blocked = await fetch(origin + '/api/mimir/growth/course-plan', { method: 'POST', headers: { cookie, origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}' })
  assert.equal(blocked.status, 403)
  checks.push('native authenticated API, unauthenticated and cross-origin rejection, original document endpoint')
}
try {
  const fixture = new GrowthStore(join(home,'mimir-growth/growth.sqlite')), service = createGrowthService(fixture,{agentDefaultModel:{currentSelection:()=>({})}})
  const setupRun=(op,payload)=>service.execute(op,{...payload,version:fixture.read().version,requestKey:randomUUID()})
  const candidate=await setupRun('course-plan',{courseId:'mit-robotics'}), initialPlan=(await setupRun('confirm',{planId:candidate.result.id})).result
  const legacy=fixture.read(), oldTask=legacy.plans.find(p=>p.id===legacy.activePlanId).tasks.find(t=>t.topicRef), oldUnit=courseUnit('mit-robotics','foundation',true)
  delete oldTask.topicRef;oldTask.title=oldUnit.title;oldTask.objective=oldUnit.objective;oldTask.criteria=oldUnit.criteria;oldTask.unitKey=oldUnit.unitKey
  legacy.evidence[oldTask.id]={artifactText:'这是旧课程已经保存的成果。',reflection:'旧单元自评',confidence:3,status:'submitted',at:new Date().toISOString()}
  fixture.db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(legacy));service.dispose();fixture.close()
  await startHost(); await apiCheck()
  edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new','--disable-gpu','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--user-data-dir='+browserHome,'about:blank'], { windowsHide:true,stdio:'ignore' })
  await ready(join(browserHome,'DevToolsActivePort'),20000)
  browser = await connectBrowser(Number(readFileSync(join(browserHome,'DevToolsActivePort'),'utf8').split('\n')[0]))
  browser.on(event => {
    if(event.method==='Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text)
    if(event.method==='Page.javascriptDialogOpening') void browser.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{})
  })
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await browser.send('Page.navigate',{url:instance.url});await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('世界树','.mg-topbar nav',true)
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${oldTask.id}"] .mg-todo-open').click()`);await click('进入完整学习 →','.mg-todo-inspector')
  await click('开始这次学习 →')
  assert.equal(await browser.evaluate("Boolean(document.querySelector('.mg-robot-diagnosis'))"),false)
  assert.ok(!await browser.evaluate("document.querySelector('.mg-studio-body').textContent.includes('下方三项检查')"))
  await click('知识与实践','.mg-topbar nav',true);await browser.waitFor("Boolean(document.querySelector('.mg-robot-topic-entry'))")
  await click('开始运动学专题 →');await browser.waitFor("Boolean(document.querySelector('.mg-plan-changes'))")
  assert.ok(await browser.evaluate("document.querySelector('.mg-plan-changes').textContent.includes('二连杆')"))
  assert.ok(await browser.evaluate("document.querySelector('.mg-plan-changes').textContent.includes('升级为运动学专题')"))
  assert.equal((await state()).activePlanId,initialPlan.id)
  await click('确认使用这份方案');await browser.waitFor("Boolean(document.querySelector('.mg-learning-studio'))")
  let s=await state(),task=s.plans.find(p=>p.id===s.activePlanId).tasks.find(t=>t.topicRef)
  assert.equal(task.topicRef,'planar-2r-v1')
  assert.equal((await state()).evidence[oldTask.id].artifactText,'这是旧课程已经保存的成果。')
  assert.ok(await browser.evaluate("document.querySelector('.mg-previous-work').textContent.includes('旧课程已经保存')"))
  checks.push('old robotics unit keeps original UI; topic upgrade is previewed and confirmed explicitly with old artifact retained')
  await click('10 分钟','.mg-option-grid',true);await click('开始这次学习 →')
  await browser.evaluate("document.querySelector('[data-robot-diagnosis=\"0-1\"]').click();document.querySelector('[data-robot-diagnosis=\"1-0\"]').click();document.querySelector('[data-robot-diagnosis=\"2-0\"]').click()")
  await click('检查先修并保存');assert.equal((await state()).roboticsSessions[task.id].diagnosis.correct,0)
  assert.ok(await browser.evaluate("document.querySelector('.mg-robot-diagnosis').textContent.includes('先学习：')"))
  await input('[data-learning-field="prediction"]','θ₂是相对角；两段均沿x轴时末端是(2,0)。')
  await click('保存本次小步并整理 →');assert.ok(await browser.evaluate("document.querySelector('.mg-inline-error').textContent.includes('当前先修检查')"))
  await browser.evaluate("document.querySelector('[data-robot-diagnosis=\"0-0\"]').click();document.querySelector('[data-robot-diagnosis=\"1-1\"]').click();document.querySelector('[data-robot-diagnosis=\"2-2\"]').click()")
  await click('检查先修并保存');await shot('robotics-prerequisites')
  await click('保存本次小步并整理 →');assert.equal((await state()).learningSessions[task.id].step,2)
  await click('仅保存成果与自评');await click('我确认完成这项目标')
  assert.notEqual((await state()).evidence[task.id].status,'completed')
  checks.push('source-bound topic candidate and real prerequisite diagnosis with correction hints; incomplete topic cannot complete')

  await click('继续剩余实践 →');await click('40 分钟','.mg-option-grid',true);await click('继续这次学习 →')
  await browser.waitFor("Boolean(document.querySelector('.mg-robot-workbench'))")
  await input('[data-robot-field="predictX"]','0');await input('[data-robot-field="predictY"]','0');await click('验证预测并保存算例')
  assert.equal((await state()).roboticsSessions[task.id].trials[0].passed,false)
  await input('[data-robot-field="predictX"]','2');await click('验证预测并保存算例')
  await click('直角特例');await input('[data-robot-field="predictX"]','1');await input('[data-robot-field="predictY"]','1');await click('验证预测并保存算例')
  await click('自选输入');await input('[data-robot-field="length1"]','2');await input('[data-robot-field="angle2"]','-90');await input('[data-robot-field="predictX"]','1');await input('[data-robot-field="predictY"]','2');await click('验证预测并保存算例')
  const last=(await state()).roboticsSessions[task.id].trials.at(-1);assert.equal(last.kind,'custom');assert.equal(last.passed,true)
  await browser.evaluate("document.querySelector('.mg-robot-result').scrollIntoView({block:'start'})");await shot('robotics-workbench')
  await browser.evaluate("(()=>{const el=document.querySelector('[data-robot-field=\"angleUnit\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'rad');el.dispatchEvent(new Event('change',{bubbles:true}))})()")
  await delay(100);assert.ok(Math.abs(Number(await browser.evaluate("document.querySelector('[data-robot-field=\"angle1\"]').value"))-Math.PI/2)<1e-12)
  await input('[data-robot-field="predictX"]','1');await input('[data-robot-field="predictY"]','2');await click('验证预测并保存算例')
  assert.equal((await state()).roboticsSessions[task.id].trials.at(-1).passed,true)
  await input('[data-learning-field="explanation"]','先求第一段终点，再加θ₁+θ₂方向的投影；弧度与度需要统一，错解不能当作通过。')
  await browser.evaluate("const groups=document.querySelectorAll('.mg-quiz fieldset');groups[0].querySelectorAll('input')[0].click();groups[1].querySelectorAll('input')[1].click()")
  await click('检查答案并获得提示');await click('保存当前过程与草稿')
  await browser.send('Page.reload');await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('继续上次学习','.mg-well-landing',true)
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-robot-trial]').length"),5)
  assert.equal(await browser.evaluate("document.querySelector('[data-robot-field=\"angleUnit\"]').value"),'rad')
  checks.push('wrong prediction retained with feedback; zero, right and custom cases validated; unit conversion and draft/table restoration')

  await click('保存并继续 →');await input('[data-learning-field="transfer"]','用于分拣点定位：长度和坐标系要核对，比较相同测试点的实测末端位置；零位与标定结果待测。')
  await click('保存本次小步并整理 →');await click('把验证记录加入成果草稿')
  assert.ok(await browser.evaluate("document.querySelector('textarea[maxlength=\"20000\"]').value.includes('理想平面刚性')"))
  await input('textarea[maxlength="4000"]','我能用三个算例检查公式，仿真不能证明真实机械臂的定位精度。')
  const downloads=join(home,'exports');mkdirSync(downloads,{recursive:true})
  await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads})
  await click('导出运动学分析报告');await ready(join(downloads,'MIMIR-机械臂运动学分析.md'),10000)
  const report=readFileSync(join(downloads,'MIMIR-机械臂运动学分析.md'),'utf8');assert.ok(report.includes('直角'));assert.ok(report.includes('仿真'));assert.ok(report.includes('我的成果与分析'))
  writeFileSync(join(root,'artifacts','robotics-synthetic-analysis-'+growthVersion+'.md'),'<!-- 合成验收示例；不代表真实学生试用或实物测量 -->\n\n'+report)
  await click('仅保存成果与自评');await click('我确认完成这项目标')
  assert.equal((await state()).evidence[task.id].status,'completed')
  await shot('robotics-analysis-report')
  checks.push('actual Markdown export, editable analysis report and server-gated completion preserve simulation boundaries')

  await click('世界树','.mg-topbar nav',true);await click('知识地图', '.mg-journey-tabs',true)
  await browser.waitFor("Boolean(document.querySelector('.mg-map-viewport svg'))")
  assert.ok(await browser.evaluate("document.querySelector('.mg-app').textContent.includes('相对角与全局角')"))
  await shot('robotics-knowledge-map')
  const graph=(await state()).journeys[(await state()).activePlanId];assert.equal(graph.nodes.filter(node=>node.id.startsWith('topic:')).length,4)
  await click('行动清单','.mg-journey-tabs',true)
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${task.id}"] .mg-todo-open').click()`);await click('进入完整学习 →','.mg-todo-inspector')
  await click('动手学习','.mg-studio-steps',true);await click('← 上一步')
  assert.equal(await browser.evaluate("document.querySelector('.mg-robot-workbench button.mg-primary').disabled"),true)
  checks.push('topic knowledge map links four concepts to saved task; completed laboratory remains read-only')

  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(120)
  assert.ok(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  await browser.evaluate("document.querySelector('.mg-robot-result').scrollIntoView({block:'start'})");await shot('robotics-narrow')
  await browser.evaluate("localStorage.setItem('mimir.appearance.v3',JSON.stringify({mode:'dark'}))")
  await browser.send('Page.reload');await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))&&document.body.dataset.mimirMode==='dark'")
  await click('世界树','.mg-topbar nav',true);await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${task.id}"] .mg-todo-open').click()`);await click('进入完整学习 →','.mg-todo-inspector')
  await click('动手学习','.mg-studio-steps',true);await click('← 上一步');await browser.evaluate("document.querySelector('.mg-robot-result').scrollIntoView({block:'start'})");await shot('robotics-dark')
  assert.ok(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  checks.push('390-pixel table scroll stays inside page and dark laboratory renders')
  assert.deepEqual(errors,[])
  const before=await state();await stopHost();await startHost()
  const login=await fetch(instance.url,{redirect:'manual'}),cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ')
  const restored=(await(await fetch(new URL(instance.url).origin+'/api/mimir/growth/state',{headers:{cookie}})).json()).data
  assert.deepEqual(restored.roboticsSessions,before.roboticsSessions);assert.deepEqual(restored.evidence,before.evidence)
  assert.equal(learnerHash(),priorLearnerHash)
  checks.push('native restart restores diagnostics, verification records and completed report; personal database unchanged')
  writeFileSync(reportPath,JSON.stringify({passed:true,at:new Date().toISOString(),growthVersion,checks,browserExceptions:errors,syntheticHome:home,personalDatabaseUnchanged:true,paidModelCalls:0},null,2))
  console.log('Robotics topic passed: '+checks.length+' native/browser scenarios.')
} catch(error) {
  const detail=String(error.stack||error).replace(/\?token=\S+/g,'?token=[redacted]')
  writeFileSync(reportPath,JSON.stringify({passed:false,at:new Date().toISOString(),checks,browserExceptions:errors,error:detail,syntheticHome:home},null,2))
  if(browser) await shot('robotics-failure').catch(()=>{})
  console.error(detail);process.exitCode=1
} finally {
  await stopHost();if(browser){await browser.send('Browser.close').catch(()=>{});await browser.close().catch(()=>{})}if(edge?.exitCode===null)edge.kill()
}
