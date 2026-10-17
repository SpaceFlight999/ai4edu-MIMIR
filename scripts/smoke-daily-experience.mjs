// Synthetic, isolated native host and browser validation. Never opens learner data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { connectBrowser } from './cdp.mjs'

const growthVersion = JSON.parse(readFileSync('growth/package.json', 'utf8')).version
const root = resolve('.'), home = join(root, '.test-data', `daily-experience-${randomUUID()}`), browserHome = join(home, 'browser-profile')
const reportPath = join(root, `artifacts/daily-experience-smoke-${growthVersion}.json`)
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
  await startHost(); await apiCheck()
  edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + browserHome, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  await ready(join(browserHome, 'DevToolsActivePort'), 20000)
  browser = await connectBrowser(Number(readFileSync(join(browserHome, 'DevToolsActivePort'), 'utf8').split('\n')[0]))
  browser.on(event => {
    if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text)
    if (event.method === 'Page.javascriptDialogOpening') { dialogs.push(event.params); void browser.send('Page.handleJavaScriptDialog', { accept: event.params.type === 'beforeunload' }).catch(() => {}) }
  })
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('.mg-library-node'))")
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-core-id]').length"), 8)
  await click('更多 · 搜索', '[data-more-label="核心课"]')
  await input('[data-option-search="核心课"]', 'Python')
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-core-id]').length"), 1)
  await input('[data-option-search="核心课"]', '不存在的课')
  assert.ok(await browser.evaluate("document.querySelector('[data-more-label=\"核心课\"] .mg-search-empty').textContent.includes('没有找到')"))
  await click('清除搜索', '[data-more-label="核心课"]')
  await click('更多 · 搜索', '[data-more-label="公开课"]')
  await input('[data-option-search="公开课"]', 'MIT Python')
  assert.equal(await browser.evaluate("document.querySelector('[data-more-label=\"公开课\"]').querySelectorAll('.mg-library-course-link').length"), 1)
  await click('竞赛与工作台', '.mg-page-tabs')
  await click('更多 · 搜索', '[data-more-label="竞赛与历史题"]')
  await input('[data-option-search="竞赛与历史题"]', '2025')
  assert.ok(await browser.evaluate("document.querySelector('[data-more-label=\"竞赛与历史题\"]').querySelectorAll('article').length > 0"))
  await click('前沿研究 Top N', '.mg-page-tabs')
  await click('更多 · 搜索', '[data-more-label="研究方向"]')
  await input('[data-option-search="研究方向"]', '人机协作')
  await click('人机协作', '[data-more-label="研究方向"]', true)
  assert.equal(await browser.evaluate("document.querySelector('.mg-research-controls select').value"), 'collaboration')
  await click('兴趣探索', '.mg-page-tabs')
  await click('更多 · 搜索', '[data-more-label="兴趣方向"]')
  await input('[data-option-search="兴趣方向"]', '具身')
  assert.equal(await browser.evaluate("document.querySelectorAll('.mg-interest-cards article').length"), 1)
  await shot('daily-search')
  await click('知识图谱与公开课', '.mg-page-tabs')
  checks.push('more and search in core courses, all public courses, competition historical problems, research and interests; empty state and selection remain coherent')
  await browser.evaluate("document.querySelector('[data-core-id=\"python\"]').click()")
  await browser.waitFor("Boolean(document.querySelector('[data-core-detail=\"python\"]'))")
  await click('我已有基础', '.mg-core-detail')
  await browser.waitFor("document.querySelector('.mg-core-practice').textContent.includes('迁移案例')")
  await click('尚未开始', '.mg-core-detail')
  await browser.waitFor("document.querySelector('.mg-core-practice').textContent.includes('概念检查')")
  await click('进入推荐练习 →', '.mg-core-detail'); await browser.waitFor("Boolean(document.querySelector('.mg-plan-changes'))")
  let recommendedState = await state()
  const recommended = recommendedState.plans.find(plan => plan.status === 'draft').tasks.find(task => task.courseRef)
  assert.equal(recommended.courseRef.id, 'mit-python'); assert.equal(recommended.courseRef.variant, 'foundation')
  await click('放弃候选'); await click('知识与实践', '.mg-topbar nav', true)
  await browser.waitFor("Boolean(document.querySelector('.mg-curriculum'))")
  await shot('core-courses-recommendation')
  checks.push('eight core courses with public resources, saved self-reported basics, differentiated exercises and source-specific practice candidate')
  await click('检索本课资料', '.mg-core-materials')
  await browser.waitFor("Boolean(document.querySelector('.mg-materials-results') || document.querySelector('.mg-core-materials .mg-inline-error'))", 30000)
  materialsLive = await browser.evaluate("(() => {const results=document.querySelector('.mg-materials-results');return results ? {available:true,items:results.querySelectorAll('article').length,empty:results.querySelectorAll('article').length===0} : {available:false,message:document.querySelector('.mg-core-materials .mg-inline-error').textContent}})()")
  assert.ok(await browser.evaluate("document.querySelector('.mg-core-materials a').href.startsWith('https://arxiv.org/search/')"))
  await shot('core-course-materials-search')
  checks.push(materialsLive.available ? 'native materials endpoint retrieves live arXiv results or explicit no matches with source date and fallback link' : 'native materials endpoint reports live upstream unavailability explicitly and keeps official search usable')
  await click('MIT 18.06', '.mg-library-node', true); await click('为这门课程设计学习候选 →')
  await browser.waitFor("Boolean(document.querySelector('.mg-plan-changes'))")
  let saved = await state(); assert.equal(saved.activePlanId, null)
  assert.ok(await browser.evaluate("document.querySelector('.mg-plan-changes').textContent.includes('新增目标')"))
  await shot('course-loop-proposal')
  await click('确认使用这份方案'); await browser.waitFor("Boolean(document.querySelector('.mg-learning-studio'))")
  saved = await state(); let plan = saved.plans.find(plan => plan.id === saved.activePlanId), task = plan.tasks.find(task => task.courseRef)
  assert.equal(task.courseRef.id, 'mit-linear')
  assert.ok(await browser.evaluate("document.querySelector('.mg-course-source a').href.includes('18-06')"))
  checks.push('chosen course creates its own source-bound candidate, explicit confirmation opens matching workshop')

  await click('10 分钟', '.mg-option-grid', true); await click('开始这次学习 →')
  await input('[data-learning-field="prediction"]', '线性变换可表达旋转；乘法前需要核对维度。')
  const tab = await browser.evaluate("document.querySelector('.mg-studio-header p').textContent")
  await click('知识与实践', '.mg-topbar nav', true)
  assert.equal(dialogs.at(-1)?.type, 'confirm'); assert.equal(await browser.evaluate("document.querySelector('.mg-studio-header p').textContent"), tab)
  checks.push('unsaved navigation shows a warning and cancellation retains the edited learning page')
  await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  assert.ok(await browser.evaluate("document.querySelector('.mg-resume-detail').textContent.includes('草稿待恢复')"))
  await click('继续上次学习', '.mg-well-landing', true)
  await browser.waitFor("Boolean(document.querySelector('.mg-draft-recovery'))")
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-field=\"prediction\"]').value"), '')
  await shot('daily-draft-recovery')
  await click('← 返回培养方案')
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${task.id}"] .mg-todo-open').click()`)
  await click('进入完整学习 →', '.mg-todo-inspector')
  assert.ok(await browser.evaluate("Boolean(document.querySelector('.mg-draft-recovery'))"))
  await browser.evaluate(`fetch('/api/mimir/growth/state').then(r=>r.json()).then(async ({data:s})=>{await fetch('/api/mimir/growth/learning',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:s.version,requestKey:crypto.randomUUID(),taskId:${JSON.stringify(task.id)},step:1,workIndex:0,minutes:10,scopeStart:0,fields:{prediction:'另一页已经保存的内容'},draftForm:{artifactText:'',reflection:'',confidence:3},quizAnswers:[-1,-1]})})})`)
  await browser.send('Page.reload');await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('继续上次学习','.mg-well-landing',true)
  assert.ok(await browser.evaluate("document.querySelector('.mg-draft-recovery').textContent.includes('备份后有更新')"))
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-field=\"prediction\"]').value"), '另一页已经保存的内容')
  await click('恢复浏览器草稿')
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-field=\"prediction\"]').value"), '线性变换可表达旋转；乘法前需要核对维度。')
  const beforeFailedSave = await state()
  await browser.evaluate("window.__dailyFetch=window.fetch;window.fetch=async function(...args){if(String(args[0]).includes('/growth/learning'))throw new TypeError('Synthetic connection loss');return window.__dailyFetch(...args)}")
  await click('保存学习草稿')
  assert.ok(await browser.evaluate("document.querySelector('.mg-notice').textContent.includes('本机服务连接中断')"))
  assert.equal((await state()).version, beforeFailedSave.version)
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-field=\"prediction\"]').value"), '线性变换可表达旋转；乘法前需要核对维度。')
  await shot('daily-error-recovery')
  await browser.evaluate('window.fetch=window.__dailyFetch')
  await input('[data-learning-field="prediction"]', '保存失败后，我继续写的新内容。')
  await click('重试上次操作')
  assert.equal((await state()).version, beforeFailedSave.version + 1)
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-field=\"prediction\"]').value"), '保存失败后，我继续写的新内容。')
  await click('保存学习草稿')
  assert.ok(await browser.evaluate("document.querySelector('.mg-save-state').textContent.includes('成长记录已保存')"))
  await input('[data-learning-field="prediction"]', '重试时不重复保存：核对矩阵维度。')
  await browser.evaluate("window.__dailyFetch=window.fetch;window.__dropOnce=true;window.fetch=async function(...args){const r=await window.__dailyFetch(...args);if(window.__dropOnce&&String(args[0]).includes('/growth/learning')){window.__dropOnce=false;await r.clone().text();throw new TypeError('Synthetic lost acknowledgement')}return r}")
  await click('保存学习草稿')
  const committedVersion = (await state()).version
  await click('重试上次操作')
  assert.equal((await state()).version, committedVersion)
  await browser.evaluate('window.fetch=window.__dailyFetch')
  await input('[data-learning-field="prediction"]', '发生并发时保留我的新草稿。')
  await browser.evaluate("fetch('/api/mimir/growth/state').then(r=>r.json()).then(async ({data:s})=>{await fetch('/api/mimir/growth/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:s.version,requestKey:crypto.randomUUID(),profile:s.profile})})})")
  await click('保存学习草稿')
  assert.ok(await browser.evaluate("document.querySelector('.mg-notice').textContent.includes('保存记录已变化')"))
  assert.ok(!await browser.evaluate("[...document.querySelectorAll('.mg-notice button')].some(b=>b.textContent==='重试上次操作')"))
  await click('刷新保存记录')
  assert.equal(await browser.evaluate("document.querySelector('[data-learning-field=\"prediction\"]').value"), '发生并发时保留我的新草稿。')
  await click('保存学习草稿')
  checks.push('unsaved refresh offers explicit backup restoration; failed connection retains fields; lost acknowledgement retries once; version conflict refresh preserves current edits')
  await click('保存本次小步并整理 →')
  await input('textarea[maxlength="20000"]', '可恢复的未提交成果草稿。')
  await input('textarea[maxlength="4000"]', '可恢复的未提交自评。')
  await click('保存当前过程与草稿')
  await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('继续上次学习', '.mg-well-landing', true); await browser.waitFor("Boolean(document.querySelector('.mg-learning-studio'))")
  assert.equal(await browser.evaluate("document.querySelector('textarea[maxlength=\"20000\"]').value"), '可恢复的未提交成果草稿。')
  assert.equal(await browser.evaluate("document.querySelector('textarea[maxlength=\"4000\"]').value"), '可恢复的未提交自评。')
  await click('仅保存成果与自评'); await click('我确认完成这项目标')
  assert.equal((await state()).evidence[task.id].status, 'submitted')
  assert.ok(await browser.evaluate("document.querySelector('.mg-notice').textContent.includes('课程目标还需要')"))
  checks.push('10-minute scope ends after one block; refresh restores draft and incomplete coursework cannot complete')

  await click('继续剩余实践 →'); await click('40 分钟', '.mg-option-grid', true); await click('继续这次学习 →')
  assert.ok(await browser.evaluate("document.querySelector('.mg-section-heading').textContent.includes('实践 2')"))
  await input('[data-learning-field="explanation"]', '矩阵内侧维度需要相同。旋转改变表达，不能代替避障。')
  await browser.evaluate("(() => {const groups=document.querySelectorAll('.mg-quiz fieldset');groups[0].querySelectorAll('input')[0].click();groups[1].querySelectorAll('input')[1].click()})()")
  await click('保存学习草稿'); await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('继续上次学习', '.mg-well-landing', true)
  assert.equal(await browser.evaluate("document.querySelectorAll('.mg-quiz input:checked').length"), 2)
  await click('检查答案并获得提示'); assert.equal((await state()).evidence[task.id].quiz.correct, 2)
  await click('保存并继续 →')
  await input('[data-learning-field="transfer"]', '把坐标变换用于机械臂定位；用已知点核对方向与单位，真实精度仍需实测。')
  await shot('course-loop-workshop'); await click('保存本次小步并整理 →')
  await click('动手学习', '.mg-studio-steps', true); await click('← 上一步')
  await browser.evaluate("(() => {const groups=document.querySelectorAll('.mg-quiz fieldset');groups[0].querySelectorAll('input')[1].click();groups[1].querySelectorAll('input')[0].click()})()")
  await click('保存学习草稿')
  await browser.evaluate("(() => {const groups=document.querySelectorAll('.mg-quiz fieldset');groups[0].querySelectorAll('input')[0].click();groups[1].querySelectorAll('input')[1].click()})()")
  await click('检查答案并获得提示'); await click('成果与反馈', '.mg-studio-steps', true)
  await click('仅保存成果与自评'); await click('我确认完成这项目标')
  assert.equal((await state()).evidence[task.id].status, 'completed')
  checks.push('resume remaining blocks, selected answer persistence, correct feedback and complete course artifact')
  await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('世界树', '.mg-topbar nav', true)
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${task.id}"] .mg-todo-open').click()`)
  await browser.waitFor("Boolean(document.querySelector('.mg-todo-inspector'))"); await click('进入完整学习 →', '.mg-todo-inspector')
  assert.deepEqual(await browser.evaluate("[...document.querySelectorAll('.mg-quiz fieldset')].map(group => [...group.querySelectorAll('input')].findIndex(input => input.checked))"), [0, 1])
  await click('选择下一步', '.mg-studio-steps', true)
  await click('当前已经够用', '.mg-learning-checkpoint', true); await input('.mg-learning-checkpoint textarea', '先把成果用于机械臂坐标换算，并验证单位和标定条件。')
  await click('保存目的选择'); await click('预览课程下一步候选 →')
  checks.push('completed refresh chooses checked answers over an older draft and permits saving the purpose choice')
  saved = await state(); assert.equal(saved.activePlanId, plan.id)
  const draft = saved.plans.find(plan => plan.status === 'draft'); assert.equal(draft.tasks.find(task => task.courseRef).courseRef.variant, 'transfer')
  assert.ok(await browser.evaluate("document.querySelector('.mg-plan-changes').textContent.includes('延续记录')"))
  await shot('course-loop-next-candidate'); await click('确认使用这份方案')
  saved = await state(); assert.equal(saved.evidence[task.id].status, 'completed')
  assert.ok(await browser.evaluate("document.querySelector('.mg-previous-work').textContent.includes('回看上一项')"))
  checks.push('purpose feedback produces a different candidate, shows retained work, preserves history and previous artifact')

  await click('世界树', '.mg-topbar nav', true)
  let active = (await state()).plans.find(plan => plan.id === (saved.activePlanId))
  const todo = active.tasks.find(task => task.area === 'research')
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${todo.id}"] input[type=checkbox]').click()`)
  await browser.waitFor(`document.querySelector('.mg-todo-row[data-task-id="${todo.id}"]').classList.contains('is-done')`)
  assert.ok(await browser.evaluate(`getComputedStyle(document.querySelector('.mg-todo-row[data-task-id="${todo.id}"] strong')).textDecorationLine.includes('line-through')`))
  assert.equal((await state()).evidence[todo.id].source, 'self-report')
  await shot('interactive-todo-list')
  await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await click('世界树', '.mg-topbar nav', true)
  assert.equal(await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${todo.id}"] input[type=checkbox]').checked`), true)
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${todo.id}"] input[type=checkbox]').click()`)
  await browser.waitFor(`!document.querySelector('.mg-todo-row[data-task-id="${todo.id}"]').classList.contains('is-done')`)
  assert.ok(!await browser.evaluate(`getComputedStyle(document.querySelector('.mg-todo-row[data-task-id="${todo.id}"] strong')).textDecorationLine.includes('line-through')`))
  const nextCourse = active.tasks.find(task => task.courseRef)
  await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${nextCourse.id}"] input[type=checkbox]').click()`)
  await delay(200); await browser.waitFor("!document.querySelector('.mg-busy')")
  assert.equal(await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${nextCourse.id}"] input[type=checkbox]').checked`), false)
  checks.push('to-do checkbox marks and strikes text, survives refresh, reverses on uncheck, and cannot bypass course work')

  // All four workshop types now stop at the selected number of small steps.
  for (const [area, minutes, fieldsByBlock] of [
    ['research', 10, [{paperTitle:'实际测试材料',source:'合成验收来源',readingGoal:'理解问题与方法'}]],
    ['competition', 20, [{inputs:'合成输入',outputs:'合成输出',constraint:'合成约束'},{flow:'检测 → 抓取 → 放置 → 验证',exceptionA:'漏检',responseA:'重新检测',exceptionB:'超时',responseB:'等待并检查'}]],
    ['interest', 40, [{scene:'室内导航',attraction:'观察路径变化'},null,{branch:'规划',exploreQuestion:'遇到障碍如何调整？',experiment:'比较两条路径'}]],
  ]) {
    await click('世界树', '.mg-topbar nav', true)
    const s = await state(), p = s.plans.find(p=>p.id===s.activePlanId), t = p.tasks.find(t=>t.area===area && t.week===1)
    await browser.evaluate(`document.querySelector('.mg-todo-row[data-task-id="${t.id}"] .mg-todo-open').click()`)
    await browser.waitFor("Boolean(document.querySelector('.mg-todo-inspector'))"); await click('进入完整学习 →', '.mg-todo-inspector')
    await click(minutes+' 分钟', '.mg-option-grid', true); await click('开始这次学习 →')
    for (let i=0;i<fieldsByBlock.length;i++) {
      const patch=fieldsByBlock[i]
      if(patch) for(const [key,value] of Object.entries(patch)) {
        const selector='[data-learning-field="'+key+'"]'
        assert.ok(await browser.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), 'Missing field '+area+' '+key+'; '+await browser.evaluate("document.querySelector('.mg-learning-studio')?.innerText.slice(0,800) || document.querySelector('.mg-app').innerText.slice(-800)"))
        if(await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).tagName==='SELECT'`)) {
          await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(100)
        } else await input(selector,value)
      }
      else await browser.evaluate("document.querySelectorAll('.mg-classification select').forEach((el,i)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,['感知','规划','执行'][i]);el.dispatchEvent(new Event('change',{bubbles:true}))})")
      await delay(100);await click(i===fieldsByBlock.length-1?'保存本次小步并整理 →':'保存并继续 →')
    }
    assert.equal((await state()).learningSessions[t.id].step,2)
    await click('保存当前过程与草稿')
    assert.equal((await state()).evidence[t.id]?.status==='completed',false)
    await browser.send('Page.reload');await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
    await click('继续上次学习','.mg-well-landing',true)
    assert.ok(await browser.evaluate("Boolean(document.querySelector('textarea[maxlength=\"20000\"]'))"))
    await shot('daily-'+area+'-'+minutes)
  }
  checks.push('paper 10 minutes saves one step, competition 20 minutes saves two, interest 40 minutes saves three; all resume from home without auto-completion')

  await input('textarea[maxlength="4000"]','本地自评无需连接模型。')
  await click('获取 AI 成果反馈')
  assert.ok(await browser.evaluate("document.querySelector('.mg-notice').textContent.includes('AI 暂时未能完成')"))
  await click('仅保存成果与自评', '.mg-notice')
  checks.push('unconfigured AI explains failure and allows explicit record-only recovery without losing artifact')
  await click('保存当前过程与草稿')

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await delay(200); await shot('course-loop-narrow')
  assert.ok(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), 'Page overflows narrow viewport')
  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('.mg-curriculum'))")
  assert.ok(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), 'Core recommendations overflow narrow viewport')
  await shot('core-courses-narrow')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.evaluate("localStorage.setItem('mimir.appearance.v3',JSON.stringify({mode:'dark'}))")
  await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing')) && document.body.dataset.mimirMode==='dark'")
  await click('知识与实践', '.mg-topbar nav', true); await browser.waitFor("Boolean(document.querySelector('.mg-curriculum'))")
  await delay(200); await shot('course-loop-dark')
  checks.push('390-pixel layout has no document overflow, dark and reduced-motion renders')
  assert.deepEqual(errors, [])
  const beforeRestart = await state()
  await stopHost(); await startHost()
  const login = await fetch(instance.url, { redirect: 'manual' }), cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const response = await fetch(new URL(instance.url).origin + '/api/mimir/growth/state', { headers: { cookie } }), restored = (await response.json()).data
  assert.equal(restored.activePlanId, beforeRestart.activePlanId); assert.deepEqual(restored.learningSessions, beforeRestart.learningSessions); assert.deepEqual(restored.evidence, beforeRestart.evidence)
  checks.push('native host restart restores confirmed plan, learning sessions and historical evidence')
  assert.equal(learnerHash(), priorLearnerHash)
  writeFileSync(reportPath, JSON.stringify({ passed: true, at: new Date().toISOString(), growthVersion, checks, materialsLive, browserExceptions: errors, syntheticHome: home, personalDatabaseUnchanged: true, paidModelCalls: 0, unitTests: existsSync(`artifacts/unit-tests-${growthVersion}.json`) ? JSON.parse(readFileSync(`artifacts/unit-tests-${growthVersion}.json`, 'utf8')).pass : null }, null, 2))
  console.log('Daily experience passed: ' + checks.length + ' native/browser scenarios; no model calls or personal-data writes.')
} catch (error) {
  const detail = String(error.stack || error).replace(/\?token=\S+/g, '?token=[redacted]')
  writeFileSync(reportPath, JSON.stringify({ passed: false, at: new Date().toISOString(), checks, browserExceptions: errors, error: detail, syntheticHome: home }, null, 2))
  console.error(detail); process.exitCode = 1
} finally {
  await stopHost()
  if (browser) { await browser.send('Browser.close').catch(() => {}); await browser.close().catch(() => {}) }
  if (edge?.exitCode === null) edge.kill()
}
