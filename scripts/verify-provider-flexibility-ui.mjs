// Real installed UI and native pi-ai transport; local synthetic server only.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { connectBrowser } from './cdp.mjs'
import { openResearchChat, sendResearchChat, readNewResearchReply } from './research-chat-driver.mjs'
import { prepareTitlePlanHome, verifyTitlePlanUi } from './title-plan-ui-cases.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const home = join(project, '.test-data', 'provider-flexibility-' + randomUUID())
mkdirSync(join(home, 'profiles/web'), { recursive: true })
writeFileSync(join(home, 'owned-by-provider-fixture.json'), JSON.stringify({ material: 'synthetic provider UI acceptance only' }))
const arg = process.argv.indexOf('--report'), reportPath = resolve(arg < 0 ? 'artifacts/provider-flexibility-ui-20261011.json' : process.argv[arg + 1])
assert.equal(dirname(reportPath), join(project, 'artifacts'))
assert.equal(existsSync(reportPath), false)
const reply = 'θ₁相对基座固定+x轴，θ₂相对第一杆。理想模型没有实物验证。先画两杆，再核对投影相加。'
const calls = [], exceptions = [], checks = []
const adaptation = process.argv.includes('--adaptation')
const titlePlan = process.argv.includes('--title-plan')
let preSwitchCalls = 0
let host, edge, browser, instance, log = ''
const delay = ms => new Promise(done => setTimeout(done, ms))
const report = { passed: false, version: '0.12.10', realDataRead: false, paidModelCalls: 0, productionMode: true, isolatedHome: true, checks }
const provider = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ object: 'list', data: ['local-model-a', 'local-model-b'].map(id => ({ id, object: 'model', owned_by: 'local-fixture' })) }))
      return
    }
    assert.equal(request.url, '/v1/chat/completions')
    let raw = ''; for await (const bytes of request) raw += bytes
    const body = JSON.parse(raw), history = JSON.stringify(body.messages)
    assert.equal(request.headers.authorization, 'Bearer synthetic-local-key')
    const isRepair = history.includes('请重新回答原用户问题'), isChat = history.includes('最多120字')
    if (adaptation) writeFileSync(join(home, 'last-synthetic-request.json'), JSON.stringify(body, null, 2))
    calls.push({ model: body.model, path: request.url, isChat, isRepair })
    const text = isChat && !isRepair ? '长'.repeat(159) : isRepair ? reply : '合成科研会话'
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const send = value => response.write('data: ' + JSON.stringify(value) + '\n\n')
    const base = { id: 'fixture-' + calls.length, object: 'chat.completion.chunk', created: 1, model: body.model }
    send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 } })
    response.end('data: [DONE]\n\n')
  } catch (error) { exceptions.push(error.name); if (!response.headersSent) response.writeHead(500); response.end() }
})
async function wait(check, timeout = 150000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw new Error('Owned provider fixture readiness timed out')
}
async function clickText(text, scope = 'body') {
  const expression = `(()=>{const el=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(node=>node.textContent.trim()===${JSON.stringify(text)}&&node.getBoundingClientRect().width>0);if(!el||el.disabled)return false;el.click();return true})()`
  await browser.waitFor(`Boolean([...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(node=>node.textContent.trim()===${JSON.stringify(text)}&&!node.disabled&&node.getBoundingClientRect().width>0))`, 15000)
  assert.equal(await browser.evaluate(expression), true)
}
async function select(selector, value) {
  await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)})?.querySelector('option[value='+JSON.stringify(${JSON.stringify(value)})+']'))`)
  await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`)
}
async function fillNative(label, value) {
  const selector = '[data-native-provider-settings] input[aria-label^=' + JSON.stringify(label) + ']'
  await browser.waitFor(`Boolean([...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getBoundingClientRect().width>0))`)
  assert.equal(await browser.evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.getBoundingClientRect().width>0);if(!el)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`), true)
}
async function closeBrowser() {
  if (!edge || edge.exitCode !== null) return
  const port = Number(readFileSync(join(home, 'browser/DevToolsActivePort'), 'utf8').split('\n')[0])
  const info = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json()
  await new Promise((done, fail) => {
    const socket = new WebSocket(info.webSocketDebuggerUrl), timer = setTimeout(() => { socket.close(); fail(new Error('Browser close timeout')) }, 5000)
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
    socket.addEventListener('close', () => { clearTimeout(timer); done() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); fail(new Error('Browser close error')) }, { once: true })
  }).catch(() => {})
  // Closing the last target can terminate Edge before the second connection
  // receives its close event. Confirm process exit instead of failing that race.
  await wait(() => edge.exitCode !== null, 10000)
}
try {
  if(titlePlan)prepareTitlePlanHome(home)
  await new Promise(done => provider.listen(0, '127.0.0.1', done))
  const endpoint = 'http://127.0.0.1:' + provider.address().port + '/v1'
  writeFileSync(join(home, 'profiles/web/cordis.patch.yml'), '- id: agent-default-model\n  config:\n    provider: mimir-local\n    model: local-model-a\n- id: llm-pi-ai\n  config:\n    providers:\n      mimir-local:\n        displayName: Local Gateway\n        apiKeyEnv: DEEPSEEK_API_KEY\n        api: openai-completions\n        baseURL: ' + endpoint + '\n        models:\n          - id: local-model-a\n            name: Local Model A\n            reasoningEfforts: false\n          - id: local-model-b\n            name: Local Model B\n            reasoningEfforts: false\n        retryPolicy:\n          mode: normal\n          maxRetries: 0\n')
  const env = { ...process.env, NODE_ENV: 'production' }
  for (const key of Object.keys(env)) if (/(?:api.?key|token|secret|password)/i.test(key)) delete env[key]
  host = spawn(join(project, 'runtime/system/node/node.exe'), [join(project, 'runtime/system/app/app.mjs'), '--data-home', home], { cwd: project, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] })
  host.stdin.end(JSON.stringify({ apiKey: 'synthetic-local-key' }))
  for (const stream of [host.stdout, host.stderr]) stream.on('data', bytes => { log += bytes; writeFileSync(join(home, 'native.log'), log) })
  await wait(() => existsSync(join(home, 'instance.json')))
  instance = JSON.parse(readFileSync(join(home, 'instance.json'), 'utf8'))
  edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--user-data-dir=' + join(home, 'browser'), 'about:blank'], { windowsHide: true, env, stdio: 'ignore' })
  await wait(() => existsSync(join(home, 'browser/DevToolsActivePort')), 20000)
  browser = await connectBrowser(Number(readFileSync(join(home, 'browser/DevToolsActivePort'), 'utf8').split('\n')[0]))
  browser.on(event => {
    if (event.method === 'Runtime.exceptionThrown') {
      exceptions.push(event.params.exceptionDetails)
      writeFileSync(join(home, 'browser-exceptions.json'), JSON.stringify(exceptions, null, 2))
    }
  })
  await browser.send('Page.navigate', { url: instance.url })
  await browser.waitFor('Boolean(document.querySelector(".mg-well-landing"))')
  if(titlePlan)await verifyTitlePlanUi({browser,project,checks})
  else {
  await openResearchChat(browser)
  if (adaptation) {
    const previous = await sendResearchChat(browser, 'Synthetic first question. Do not call tools.')
    assert.equal(await readNewResearchReply(browser, previous, 60000), '合成科研会话')
    preSwitchCalls = calls.length
    assert.ok(calls.every(call => call.model === 'local-model-a'))
  }
  await browser.evaluate('window.dispatchEvent(new CustomEvent("mimir:settings",{detail:"models"}))')
  await browser.waitFor('document.querySelector("[data-current-model]")?.textContent.includes("Local Model A")')
  checks.push({ name: 'startup-keeps-custom-provider-and-model', passed: true })
  if (adaptation) {
    await browser.waitFor('Boolean(document.querySelector("[data-model-preview]"))')
    assert.equal(await browser.evaluate('document.querySelectorAll(".mg-model-settings .mimir-model-badge").length'), 0)
    await select('[data-model-provider]', 'deepseek-official')
    await browser.waitFor('document.querySelector("[data-model-preview] .mimir-model-version-text")?.textContent==="1017"')
    assert.equal(await browser.evaluate('[...document.querySelector("[data-model-id]").options].some(o=>o.textContent.includes("1017"))'),true)
    assert.deepEqual(await browser.evaluate('[...document.querySelector("[data-model-effort]").options].filter(o=>o.value).map(o=>o.value)'), ['off','low','high','max'])
    await select('[data-model-effort]', 'max')
    await clickText('保存模型与 Key', '.mg-model-settings')
    await browser.waitFor('document.querySelector("[data-current-model]")?.textContent.includes("Max")')
    const current = await browser.evaluate('fetch("/api/mimir/growth/model-selection").then(r=>r.json()).then(r=>r.data)')
    assert.equal(current.model, 'deepseek-flash'); assert.equal(current.reasoningEffort, 'max'); assert.equal(current.version, '1017')
    await browser.send('Emulation.setDeviceMetricsOverride', { width:1280, height:960, deviceScaleFactor:1, mobile:false })
    writeFileSync(join(project, 'artifacts/model-api-settings-light-20261017.png'), Buffer.from((await browser.send('Page.captureScreenshot', {format:'png'})).data, 'base64'))
    await clickText('外观', '.mimir-settings-dialog nav')
    await clickText('深色', '.mimir-mode-options')
    await clickText('模型', '.mimir-settings-dialog nav')
    await browser.waitFor('document.querySelector("[data-current-model] .mimir-model-version-text")?.textContent==="1017"')
    const badge = await browser.evaluate('(()=>{const n=document.querySelector("[data-current-model] .mimir-model-version-text"),s=getComputedStyle(n);return {mode:document.body.dataset.mimirMode,color:s.color,background:s.backgroundColor}})()')
    assert.equal(badge.mode, 'dark'); assert.equal(badge.background, 'rgba(0, 0, 0, 0)')
    assert.equal(await browser.evaluate('document.querySelectorAll(".mg-model-settings .mimir-model-badge").length'),0)
    writeFileSync(join(project, 'artifacts/model-api-settings-dark-20261017.png'), Buffer.from((await browser.send('Page.captureScreenshot', {format:'png'})).data, 'base64'))
    await browser.send('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true })
    assert.equal(await browser.evaluate('document.querySelector(".mimir-settings-dialog").getBoundingClientRect().width<=innerWidth'),true)
    writeFileSync(join(project, 'artifacts/model-api-settings-mobile-20261017.png'), Buffer.from((await browser.send('Page.captureScreenshot', {format:'png'})).data, 'base64'))
    await browser.send('Emulation.setDeviceMetricsOverride', { width:1280, height:960, deviceScaleFactor:1, mobile:false })
    checks.push({ name:'deepseek-1017-badge-real-effort-save-and-responsive-light-dark-ui', passed:true })
    await browser.evaluate('(()=>{const n=document.querySelector("[data-model-key]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,"synthetic-unsaved-other-provider-key");n.dispatchEvent(new Event("input",{bubbles:true}))})()')
    await browser.evaluate('fetch("/api/mimir/growth/model-settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider:"mimir-local",model:"local-model-a"})}).then(r=>r.json()).then(r=>{if(!r.ok)throw Error("synthetic selection failed");window.dispatchEvent(new CustomEvent("mimir-model-changed"))})')
    await browser.waitFor('document.querySelector("[data-model-provider]").value==="mimir-local"&&document.querySelector("[data-model-key]").value===""')
    checks.push({name:'external-provider-change-clears-unsaved-key-before-saving',passed:true})
    // A global settings change must not relabel an existing session as a different model.
    await browser.evaluate('document.querySelector(".mimir-settings-header button[aria-label=关闭设置]").click()')
    await browser.waitFor('document.querySelector("[data-research-model]")?.textContent.includes("Local Model A")')
    checks.push({ name:'existing-session-display-keeps-actual-model-after-global-default-change', passed:true })
    await browser.evaluate('window.dispatchEvent(new CustomEvent("mimir:settings",{detail:"models"}))')
    await browser.waitFor('Boolean(document.querySelector("[data-configure-providers]"))')
  }
  await clickText('配置提供商', '.mg-model-settings')
  await browser.waitFor('Boolean(document.querySelector("[data-native-provider-settings]"))')
  await clickText('添加模型提供商', '[data-native-provider-settings]')
  await clickText('自定义模型 API', '[data-native-provider-settings]')
  await browser.waitFor('document.querySelector("[data-native-provider-settings]")?.innerText.includes("API 地址")')
  const editor = await browser.evaluate('(()=>{const node=document.querySelector("[data-native-provider-settings]");return {text:node.innerText,fields:[...node.querySelectorAll("input,select,textarea")].map(el=>({tag:el.tagName,type:el.type,placeholder:el.placeholder,aria:el.getAttribute("aria-label"),id:el.id,labels:[...(el.labels||[])].map(label=>label.textContent.trim()),options:el.tagName==="SELECT"?[...el.options].map(o=>({value:o.value,label:o.text})):undefined}))}})()')
  writeFileSync(join(home, 'provider-editor-controls.json'), JSON.stringify(editor, null, 2))
  assert.match(editor.text, /Provider ID/)
  assert.match(editor.text, /API 协议/)
  assert.match(editor.text, /模型/)
  checks.push({ name: 'native-custom-provider-editor-available', passed: true })
  await fillNative('Provider ID', 'added-gateway')
  await fillNative('显示名称', 'Added Gateway')
  await fillNative('API 地址', endpoint)
  await fillNative('API 密钥', 'synthetic-local-key')
  await clickText('添加模型', '[data-native-provider-settings]')
  await fillNative('模型 ID', 'local-model-b')
  await clickText('创建提供商', '[data-native-provider-settings]')
  await wait(() => readFileSync(join(home, 'profiles/web/cordis.patch.yml'), 'utf8').includes('added-gateway:'))
  checks.push({ name: 'native-editor-creates-custom-provider-model-and-write-only-credential', passed: true })
  await clickText('返回模型选择', '[data-native-provider-settings]')
  await select('[data-model-provider]', 'added-gateway')
  await select('[data-model-id]', 'local-model-b')
  await clickText('保存模型与 Key', '.mg-model-settings')
  await browser.waitFor('document.querySelector("[data-current-model]")?.textContent.includes("local-model-b")')
  assert.equal(await browser.evaluate('document.querySelector("[data-model-key]").value'), '')
  const profile = readFileSync(join(home, 'profiles/web/cordis.patch.yml'), 'utf8')
  assert.match(profile, /model: local-model-b/)
  assert.match(profile, /provider: added-gateway/)
  checks.push({ name: 'custom-model-selection-saves-without-forced-migration', passed: true })
  await browser.evaluate('document.querySelector(".mimir-settings-header button[aria-label=关闭设置]").click()')
  if (adaptation) {
    await browser.evaluate('document.querySelector("[data-research-model] button[aria-haspopup=menu]").click()')
    await browser.waitFor('Boolean(document.querySelector("[role=menu] [role=menuitem]"))')
    await browser.evaluate('document.querySelector("[role=menu] [role=menuitem]").click()')
    await browser.waitFor('[...document.querySelectorAll("[role=group]")].some(n=>n.innerText.includes("Added Gateway"))')
    assert.equal(await browser.evaluate('document.querySelectorAll("[role=menu] .mimir-model-badge").length'),0)
    assert.equal(await browser.evaluate('document.querySelector("[role=menu]").innerText.includes("1017")'),true)
    await browser.evaluate('[...document.querySelectorAll("[role=group]")].find(n=>n.innerText.includes("Added Gateway")).querySelector("button[title=local-model-b]").click()')
    await browser.waitFor('document.querySelector("[data-research-model]")?.textContent.includes("local-model-b")')
    checks.push({ name:'native-session-selector-switches-current-session-with-provider-and-model', passed:true })
  }
  const previous = await sendResearchChat(browser, '已知二连杆均为1米、角均为0度，末端(2,0)米。请用中文最多120字解释参考系、限制与一个核查步骤。不要调用工具。')
  assert.equal(await readNewResearchReply(browser, previous, 60000), reply)
  assert.equal(calls.filter(call => call.isRepair).length, 1)
  assert.ok(calls.length >= 3 && calls.slice(preSwitchCalls).every(call => call.model === 'local-model-b'))
  checks.push({ name: 'native-openai-compatible-chat-title-and-one-quality-repair-use-selected-model', passed: true })
  if (adaptation) {
    await browser.evaluate('document.querySelector("[data-research-model] button[aria-haspopup=menu]").click()')
    await browser.waitFor('Boolean(document.querySelector("[role=menu] [role=menuitem]"))')
    await browser.evaluate('document.querySelector("[role=menu] [role=menuitem]").click()')
    await browser.waitFor(`Boolean(document.querySelector('[role=menu] button[title="DeepSeek-V4.1-Flash-1017"]'))`)
    await browser.evaluate(`document.querySelector('[role=menu] button[title="DeepSeek-V4.1-Flash-1017"]').click()`)
    await browser.waitFor('document.querySelector("[data-research-model] .mimir-model-badge")?.textContent==="1017"')
    writeFileSync(join(project,'artifacts/model-api-research-1017-20261017.png'),Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    checks.push({name:'active-model-has-blue-1017-while-settings-and-all-dropdown-models-use-plain-1017',passed:true})
    await browser.evaluate('document.querySelector(".mimir-product-nav button[aria-label=论文]").click()')
    await browser.waitFor('Boolean(document.querySelector(".mimir-reading-panel iframe")?.src)')
    const tree = await browser.send('Page.getFrameTree')
    const child = tree.frameTree.childFrames?.find(node=>node.frame.url.includes('127.0.0.1'))
    assert.ok(child)
    const world = await browser.send('Page.createIsolatedWorld',{frameId:child.frame.id,worldName:'model-ui-acceptance'})
    const reader = async expression => {
      const result = await browser.send('Runtime.evaluate',{expression,contextId:world.executionContextId,returnByValue:true,awaitPromise:true})
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
    }
    await wait(()=>reader('document.querySelector("#settings-toggle")?.textContent.includes("1017")'))
    checks.push({name:'reader-serves-model-module-and-reads-token-scoped-shared-settings',passed:true})
    await reader('document.querySelector("#settings-toggle").click()')
    await browser.waitFor('Boolean(document.querySelector(".mimir-settings-dialog[open]"))')
    await select('[data-model-provider]','deepseek-official')
    await browser.waitFor('document.querySelector("[data-model-preview] .mimir-model-version-text")?.textContent==="1017"')
    await select('[data-model-effort]','low')
    await clickText('保存模型与 Key','.mg-model-settings')
    await wait(()=>reader('document.querySelector("#settings-toggle .reader-model-badge")?.textContent==="1017"&&document.querySelector("#settings-toggle").textContent.includes("Low")'))
    assert.equal(await reader('document.querySelector("#settings-toggle").textContent.includes("Low")'),true)
    await browser.evaluate('document.querySelector(".mimir-settings-header button[aria-label=关闭设置]").click()')
    writeFileSync(join(project,'artifacts/model-api-reader-20261017.png'),Buffer.from((await browser.send('Page.captureScreenshot',{format:'png'})).data,'base64'))
    checks.push({name:'reader-refreshes-model-and-effort-after-parent-settings-save',passed:true})
    await browser.send('Page.navigate',{url:child.frame.url})
    await browser.waitFor('document.querySelector("#settings-toggle .reader-model-badge")?.textContent==="1017"')
    await browser.evaluate('document.querySelector("#settings-toggle").click()')
    await browser.waitFor('document.querySelector("#model-preview").textContent.includes("1017")')
    assert.equal(await browser.evaluate('document.querySelector("#model-preview").textContent.includes("1017")&&document.querySelectorAll("#settings .reader-model-badge").length===0'),true)
    await select('#model-effort','max')
    await clickText('使用此模型','#settings')
    await browser.waitFor('document.querySelector("#settings-toggle").textContent.includes("Max")')
    const rejected = await browser.evaluate('fetch(new URL("api/model-settings",location.href),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider:"deepseek-official",model:"deepseek-flash"})}).then(r=>r.status)')
    assert.equal(rejected,403)
    checks.push({name:'standalone-reader-saves-actual-effort-and-retains-token-and-csrf-checks',passed:true})
  }
  }
  assert.deepEqual(exceptions, [])
  report.passed = true
} catch (error) {
  writeFileSync(join(home, 'failure.json'), JSON.stringify({ error: error.stack, markup: await browser?.evaluate('({text:document.body.innerText.slice(-7000),buttons:[...document.querySelectorAll("button")].map(el=>({text:el.textContent.trim(),aria:el.getAttribute("aria-label"),disabled:el.disabled}))})').catch(() => null) }, null, 2))
  report.error = { name: error.name, message: 'Local provider UI acceptance failed; details retained in the owned synthetic fixture.' }
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  await closeBrowser().catch(error => { report.cleanupError = error.message; report.passed = false; process.exitCode = 1 })
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  if (instance) await wait(() => !existsSync(join(home, 'instance.json')) && host.exitCode !== null, 10000).catch(error => { report.cleanupError = error.message; report.passed = false; process.exitCode = 1 })
  provider.closeAllConnections(); await new Promise(done => provider.close(done))
  report.modelCalls = calls.length; report.requests = calls; report.browserExceptions = exceptions.length
  report.cleanup = { browserClosed: !edge || edge.exitCode !== null, nativeHostStopped: !host || host.exitCode !== null }
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, localModelCalls: calls.length, paidModelCalls: 0, cleanup: report.cleanup, syntheticHome: home }))
}
