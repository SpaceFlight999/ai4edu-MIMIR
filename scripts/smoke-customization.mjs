// Isolated native DSH + browser test; all model and arXiv responses are synthetic.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import { templatePlan } from '../growth/src/domain.mjs'
import { connectBrowser } from './cdp.mjs'
import { runPrompt4Scenarios, runPaperScenarios } from './prompt4-browser.mjs'

const root = resolve('.'), version = JSON.parse(readFileSync('growth/package.json')).version
const home = join(root, '.test-data', 'customization-' + randomUUID()), report = join(root, 'artifacts', (process.env.MIMIR_TEST_PAPER_ONLY ? 'paper-reader-smoke-' : 'customization-smoke-') + version + '.json')
const learner = join(root, 'data/student-1/mimir-growth/growth.sqlite'), hash = () => existsSync(learner) ? createHash('sha256').update(readFileSync(learner)).digest('hex') : null, beforeHash = hash()
const checks = [], errors = [], calls = []; let host, edge, browser, instance, output = '', expectedKey = 'synthetic-initial-key'
const delay = ms => new Promise(done => setTimeout(done, ms))
let providerBehavior={};const providerControl=value=>{providerBehavior=value;};
async function ready(file, timeout = 45000) { const end = Date.now() + timeout; while (Date.now() < end) { if (existsSync(file)) return; if (host?.exitCode !== null && host?.exitCode !== undefined) throw new Error('Host exited'); await delay(100) } throw new Error('Isolated host timed out') }
const provider = createServer(async (request, response) => {
  try {
    assert.equal(request.headers['x-api-key'], expectedKey)
    let raw = ''; for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw)
    const payload = (body.messages || []).flatMap(item => item.content || []).flatMap(item => { try { const value = JSON.parse(item.text); return value.profile ? [value] : [] } catch { return [] } })[0]
    if (payload) calls.push({ model: body.model, goals: payload.profile.goals, keyMatches: true })
    let content = payload ? JSON.stringify(templatePlan(payload.profile)) : '合成测试回应'
    const prompt = (body.messages || []).flatMap(item => item.content || []).map(item => item.text || '').join('\n')
    if(providerBehavior.delayMs)await delay(providerBehavior.delayMs)
    if(providerBehavior.failure){response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({type:'error',error:{type:'overloaded_error',message:'Synthetic provider failure'}}));return;}
    const original = prompt.match(/原文：(\[[\s\S]*\])$/), review = prompt.match(/论点：(\[[\s\S]*\])$/)
    if (original) { const evidence = JSON.parse(original[1])[0]; content = JSON.stringify({ claims: [{ topic: '合成方法', kind: '作者主张', text: '合成论文要求保持输入与单位一致。', evidence: [{ evidenceId: evidence.evidenceId, quote: evidence.quote.slice(0, 180) }] }] }) }
    if (review) content = JSON.stringify({ checks: JSON.parse(review[1]).map(item => ({ id: item.id, supported: false, missingDetails: ['合成响应仅用于UI验收'], reason: '仅验证引用与操作路径，不作真实学术判断。' })) })
    if(providerBehavior.reply)content=providerBehavior.reply
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const emit = value => response.write('event: ' + value.type + '\ndata: ' + JSON.stringify(value) + '\n\n')
    emit({ type: 'message_start', message: { id: 'msg-test', type: 'message', role: 'assistant', model: body.model, content: [], usage: { input_tokens: 20, output_tokens: 0 } } })
    emit({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    emit({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: content } })
    emit({ type: 'content_block_stop', index: 0 })
    emit({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 30 } })
    emit({ type: 'message_stop' }); response.end()
  } catch (error) { errors.push(error.message); if (!response.headersSent) response.writeHead(500); response.end() }
})
async function start() {
  host = spawn(process.execPath, ['--import', pathToFileURL(join(home, 'research-fixture.mjs')).href, join(root, 'runtime/system/app/app.mjs'), '--data-home', home], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  host.stdin.end(JSON.stringify({ apiKey: 'synthetic-initial-key' }))
  for (const stream of [host.stdout, host.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-10000) })
  await ready(join(home, 'instance.json')); instance = JSON.parse(readFileSync(join(home, 'instance.json')))
}
async function stop() {
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(4000) }).catch(() => {})
  const end = Date.now() + 10000; while (host && host.exitCode === null && Date.now() < end) await delay(100)
  if (host?.exitCode === null) host.kill(); host = null; instance = null
}
async function click(label, scope = '.mg-app', contains = false) {
  assert.equal(await browser.evaluate(`(() => {const el=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(el=>${contains ? 'el.textContent.includes(' + JSON.stringify(label) + ')' : 'el.textContent.trim()===' + JSON.stringify(label)});if(!el||el.disabled)return false;el.click();return true})()`), true, 'Missing button: ' + label)
  await delay(160); await browser.waitFor("!document.querySelector('.mg-busy')")
}
async function input(selector, value) {
  assert.equal(await browser.evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return false;const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`), true, 'Missing field: ' + selector)
  await delay(100)
}
const state = () => browser.evaluate("fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data)")
async function shot(name) { const png = await browser.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(root, 'artifacts', version + '-custom-' + name + '.png'), Buffer.from(png.data, 'base64')) }
async function add(label, title, detail = '') {
  const scope = '[data-more-label="' + label + '"]'
  await click('其他', scope); await input('[data-custom-title="' + label + '"]', title)
  if (detail) await input('[data-custom-detail="' + label + '"]', detail)
  await click('添加' + label, scope)
  assert.ok((await state()).customChoices.some(item => item.label === label && item.title === title))
}
try {
  mkdirSync(join(home, 'profiles/web'), { recursive: true })
  await new Promise(done => provider.listen(0, '127.0.0.1', done))
  writeFileSync(join(home, 'profiles/web/cordis.patch.yml'), '- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: off\n- id: llm-deepseek\n  config:\n    baseURL: http://127.0.0.1:' + provider.address().port + '\n    thinking: disabled\n    retryPolicy:\n      mode: normal\n      maxRetries: 0\n')
  const atom = '<feed><entry><id>http://arxiv.org/abs/2609.12345v1</id><title>Synthetic Soft Robot</title><published>2026-09-30T12:00:00Z</published><summary>Synthetic fixture</summary></entry></feed>'
  writeFileSync(join(home, 'research-fixture.mjs'), 'const original=globalThis.fetch;globalThis.fetch=(url,options)=>String(url).startsWith("https://export.arxiv.org/api/query")?Promise.resolve(new Response(' + JSON.stringify(atom) + ')):original(url,options);')
  await start()
  const browserHome = join(home, 'browser')
  edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--user-data-dir=' + browserHome, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  await ready(join(browserHome, 'DevToolsActivePort')); browser = await connectBrowser(Number(readFileSync(join(browserHome, 'DevToolsActivePort'), 'utf8').split('\n')[0]))
  browser.on(event => { if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text) })
  browser.on(event => { if (event.method === 'Page.javascriptDialogOpening') { console.log('Unexpected test dialog: ' + event.params.type); void browser.send('Page.handleJavaScriptDialog', { accept: false }); } })
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  if (process.env.MIMIR_TEST_PAPER_ONLY) await runPaperScenarios({browser,click,input,state,delay,shot,checks,home,providerControl}); else {
  const titleFits = () => browser.evaluate("(() => {const el=document.querySelector('.mg-landing-copy h1');return !el.querySelector('br') && el.scrollWidth <= el.clientWidth+1 && el.offsetHeight <= parseFloat(getComputedStyle(el).lineHeight)+1})()")
  assert.ok(await titleFits()); assert.ok(await browser.evaluate("document.querySelector('.mg-sidebar-entry').textContent.includes('我的成长计划')")); await shot('home')
  for (const width of [1024, 780, 390, 360]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 780 }); await delay(100)
    if (!await titleFits()) { await shot('failed-title-' + width); console.log(await browser.evaluate("(() => {const el=document.querySelector('.mg-landing-copy h1');return {width:el.clientWidth,scroll:el.scrollWidth,height:el.offsetHeight,font:getComputedStyle(el).fontSize,line:getComputedStyle(el).lineHeight,landing:document.querySelector('.mg-well-landing').clientWidth}})()")) }
    assert.ok(await titleFits(), 'Title does not fit at ' + width)
    assert.ok(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth+1'))
  }
  await shot('home-narrow'); checks.push('single-line home title at 1440/1024/780/390/360, no overflow, improved sidebar wording')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await click('开启我的成长配置', '.mg-well-landing', true)
  await add('专业方向', '生物医学工程'); await click('选择这项补充', '[data-more-label="专业方向"]'); await click('确认并继续 →')
  await add('学习目标', '设计软体机器人'); await click('选择这项补充', '[data-more-label="学习目标"]')
  await add('学习目的', '探索医工交叉'); await click('选择这项补充', '[data-more-label="学习目的"]')
  await browser.evaluate("[...document.querySelectorAll('summary')].find(el=>el.textContent.includes('用自己的话描述')).click()")
  await click('＋ 添加一个目标'); await input('[data-personal-goal="2"]', '记录一次实验的误差来源')
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-personal-goal]').length"), 3)
  await shot('goals')
  for (let i = 0; i < 4; i++) await click('确认并继续 →')
  await click('保存配置'); assert.equal((await state()).profile.goals.length, 3); assert.equal((await state()).profile.major, '生物医学工程')
  checks.push('custom major/purpose/goal, three editable goals, saved profile preserves all goal entries')
  await click('智慧之泉', '.mg-topbar nav', true); await click('课程与知识图谱 →', '.mg-learning-doors', true)
  await add('核心课', '生物力学基础'); await add('公开课', '软体机器人课程')
  await click('竞赛与工作台', '.mg-page-tabs'); await add('竞赛与历史题', '校园医疗机器人赛')
  await click('打开自定义竞赛工作台 →'); await input('[data-workspace-field="requirements"]', '设计抓取流程并列出异常情况')
  await click('保存工作台草稿'); const customId = (await state()).customChoices.find(item => item.label === '竞赛与历史题').id
  assert.equal((await state()).competitionWorkspaces[customId].fields.requirements, '设计抓取流程并列出异常情况')
  checks.push('other core/public courses persist; custom competition opens, edits and saves the real workspace')
  await click('前沿研究 Top N', '.mg-page-tabs'); await browser.waitFor("Boolean(document.querySelector('[data-model-provider] option[value=\"deepseek-official\"]'))")
  await add('研究方向', '软体机器人研究', 'soft robot'); await click('选择这项补充', '[data-more-label="研究方向"]')
  await click('联网获取近期成果'); await browser.waitFor("Boolean(document.querySelector('.mg-research-list'))"); assert.ok(await browser.evaluate("document.querySelector('.mg-research-list').textContent.includes('Synthetic Soft Robot')"))
  const catalog = await browser.evaluate("fetch('/api/mimir/growth/models').then(r=>r.json()).then(r=>r.data)")
  assert.equal(catalog.providers.find(item => item.id === 'deepseek-official').credential.writable, true)
  await input('[data-model-id]', 'deepseek-v4-pro'); await input('[data-model-key]', 'synthetic-replacement-key'); expectedKey = 'synthetic-replacement-key'
  await click('保存模型与 Key', '.mg-model-settings'); await browser.waitFor("document.querySelector('[data-current-model]').textContent.includes('deepseek-v4-pro')")
  assert.equal(await browser.evaluate("document.querySelector('[data-model-key]').value"), '')
  await shot('research'); checks.push('custom research actually queries feed; selected model displayed and editable; replacement API Key stored without echo')
  await click('兴趣探索', '.mg-page-tabs'); await add('兴趣方向', '医疗机械设计', 'medical robot')
  assert.equal((await state()).customChoices.length, 8)
  await click('研究', '.mg-sidebar-wrap'); await browser.waitFor("document.querySelector('[data-research-model]')?.textContent.includes('deepseek-v4-pro')")
  await browser.evaluate("window.dispatchEvent(new CustomEvent('mimir:settings',{detail:'models'}))")
  await browser.waitFor("Boolean(document.querySelector('[aria-label=\"模型与API Key配置\"]'))")
  await browser.waitFor("document.querySelector('[data-current-model]')?.textContent.includes('deepseek-v4-pro')"); await browser.waitFor("Boolean(document.querySelector('[data-model-id] option[value=\"deepseek-v4-pro\"]'))"); await delay(350); await shot('settings')
  checks.push('all eight other-choice categories work; native Settings / Models includes model and API Key controls')
  await input('[data-model-id]', 'deepseek-flash'); await click('保存模型与 Key', '.mg-model-settings')
  await browser.waitFor("document.querySelector('[data-research-model]')?.textContent.includes('deepseek-flash')")
  await input('[data-model-id]', 'deepseek-v4-pro'); await click('保存模型与 Key', '.mg-model-settings')
  await browser.waitFor("document.querySelector('[data-research-model]')?.textContent.includes('deepseek-v4-pro')")
  checks.push('native research caption immediately follows model changes from Settings; blank Key preserves credentials')
  await click('外观', '.mimir-settings-layout nav'); await click('深色', '.mimir-preferences'); await click('模型', '.mimir-settings-layout nav')
  await browser.waitFor("Boolean(document.querySelector('[data-model-id] option[value=\"deepseek-v4-pro\"]'))"); await delay(350); await shot('settings-dark')
  assert.equal(await browser.evaluate('document.body.dataset.mimirMode'), 'dark')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(350)
  assert.ok(await browser.evaluate("(() => {const dialog=document.querySelector('.mimir-settings-dialog'); return dialog.scrollWidth<=dialog.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1})()")); await shot('settings-narrow')
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await click('外观', '.mimir-settings-layout nav'); await click('浅色', '.mimir-preferences'); await click('模型', '.mimir-settings-layout nav')
  await browser.waitFor("Boolean(document.querySelector('[data-model-id] option[value=\"deepseek-v4-pro\"]'))"); await delay(350); await shot('settings')
  checks.push('model and Key controls remain visible in light/dark theme, 390-pixel modal fits without horizontal overflow')
  const generated = await browser.evaluate("(async()=>{const state=await fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data);const r=await fetch('/api/mimir/growth/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile:state.profile,mode:'model',version:state.version,requestKey:crypto.randomUUID()})});return {status:r.status,body:await r.json()}})()")
  assert.equal(generated.status, 200, generated.body.error?.message); assert.equal(generated.body.data.result.model.engine, 'dsh-agent'); assert.equal(generated.body.data.result.model.model, 'deepseek-v4-pro')
  assert.equal(calls.at(-1).model, 'deepseek-v4-pro'); assert.equal(calls.at(-1).goals.length, 3)
  assert.ok(!JSON.stringify(await state()).includes('synthetic-replacement-key')); assert.ok(!await browser.evaluate("JSON.stringify(localStorage).includes('synthetic-replacement-key')"))
  checks.push('real bundled DSH Agent receives three goals and uses changed model plus changed Key against local HTTP fixture')
  const prior = await state(); await stop(); await start()
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  const restored = await state(); assert.deepEqual(restored.customChoices, prior.customChoices); assert.deepEqual(restored.profile.goals, prior.profile.goals); assert.equal(restored.modelSelection.model, 'deepseek-v4-pro')
  assert.equal((await browser.evaluate("fetch('/api/mimir/growth/models').then(r=>r.json()).then(r=>r.data)")).providers.find(item => item.id === 'deepseek-official').credential.configured, true)
  // The old launcher credential must not replace the Key saved in Settings.
  const routed = await browser.evaluate("fetch('/api/mimir/growth/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'合成重启验证',mode:'model',version:" + restored.version + ",requestKey:crypto.randomUUID()})}).then(r=>r.status)")
  assert.equal(routed, 200); checks.push('restart restores custom choices, goals, model and Key; stale launcher Key does not override the saved credential')
  // Direct fixture calls above intentionally bypass React's state; synchronize before new UI saves.
  await browser.send('Page.reload'); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await runPrompt4Scenarios({ browser, click, input, state, delay, shot, checks, home,providerControl })
  }
  assert.equal(hash(), beforeHash); assert.deepEqual(errors, [])
  writeFileSync(report, JSON.stringify({ passed: true, at: new Date().toISOString(), growthVersion: version, checks, browserExceptions: errors, actualDshRuntime: true, modelRequests: calls.length, realOnlineModelCalls: 0, paidModelCalls: 0, personalDatabaseUnchanged: true, syntheticHome: home }, null, 2))
  console.log('Customization passed: ' + checks.length + ' native/browser scenarios.')
} catch (error) {
  if (browser) { await shot('failure').catch(() => {}); console.log(await browser.evaluate("document.body.innerText.slice(-2400)").catch(() => 'Browser unavailable')) }
  const safe = value => String(value).replace(/\?token=\S+/g, '?token=[redacted]').replaceAll('synthetic-initial-key', '[synthetic key]').replaceAll('synthetic-replacement-key', '[synthetic key]')
  writeFileSync(report, JSON.stringify({ passed: false, checks, errors, error: safe(error.stack), startupDiagnostic: safe(output), syntheticHome: home }, null, 2)); console.error(safe(error.stack)); process.exitCode = 1
} finally {
  await stop(); if (browser) { await browser.send('Browser.close').catch(() => {}); await browser.close().catch(() => {}) } if (edge?.exitCode === null) edge.kill()
  provider.closeAllConnections(); await new Promise(done => provider.close(done))
}
