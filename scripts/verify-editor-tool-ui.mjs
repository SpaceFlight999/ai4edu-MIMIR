// Real UI acceptance. No provider fixture, model credential, personal data, or backend substitute.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve, join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectBrowser } from './cdp.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runId = randomUUID(), home = join(project, '.test-data', 'editor-tool-ui-' + runId)
const browserHome = join(home, 'browser'), downloads = join(home, 'downloads')
const reportAt = process.argv.indexOf('--report')
const artifact = reportAt < 0 ? join(project, 'artifacts', 'editor-tool-ui-followup-20261011.json') : resolve(process.argv[reportAt + 1] ?? '')
assert.equal(dirname(artifact), join(project, 'artifacts'))
assert.match(basename(artifact), /^editor-tool-ui-[a-z0-9-]+\.json$/)
assert.equal(existsSync(artifact), false, 'Keep historical reports; use a new artifact name.')
assert.equal(dirname(home), join(project, '.test-data'))
assert.match(basename(home), /^editor-tool-ui-[0-9a-f-]{36}$/)
for (const directory of [home, downloads]) mkdirSync(directory, { recursive: true })
writeFileSync(join(home, 'owned-by-editor-tool-ui.json'), JSON.stringify({ runId, project, material: 'synthetic UI acceptance only' }))
const env = { ...process.env }
for (const key of Object.keys(env)) if (/(?:api.?key|token|secret|password)/i.test(key)) delete env[key]
const report = { at: new Date().toISOString(), version: JSON.parse(readFileSync(join(project, 'growth/package.json'), 'utf8')).version,
  nativeLauncher: true, actualBrowserUI: true, syntheticHomeOnly: true, realDataRead: false, paidModelCalls: 0,
  checks: [], requests: [], downloads: [], toolCancellation: { status: 'not_checked' }, browserExceptions: [], cleanup: {}, passed: false }
let launcher, edge, browser, browserPort, instance, log = '', origin
const delay = ms => new Promise(done => setTimeout(done, ms))
async function wait(check, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw new Error('Owned synthetic UI fixture readiness timed out.')
}
function save() { writeFileSync(artifact, JSON.stringify(report, null, 2)) }
async function snapshot(name) {
  const value = await browser.evaluate(`({title:document.title,buttons:[...document.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().width).map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{text:n.textContent.trim().slice(0,80),aria:n.getAttribute('aria-label'),disabled:n.disabled,rect:{x:r.x,y:r.y,width:r.width,height:r.height},visibility:getComputedStyle(n).visibility,hit:hit?{tag:hit.tagName,class:hit.className,text:hit.textContent?.trim().slice(0,80)}:null,hitInside:n.contains(hit)}}),text:document.body.innerText.slice(-5000)})`)
  writeFileSync(join(home, name + '.json'), JSON.stringify(value, null, 2))
  const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(home, name + '.png'), Buffer.from(screenshot.data, 'base64'))
}
async function click(selector) {
  const targetPoint = `(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})];for(const n of nodes){if(n.disabled||n.closest('[hidden]')||getComputedStyle(n).visibility==='hidden')continue;const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(r.width&&r.height&&n.contains(hit))return{x,y};}return null})()`
  await browser.waitFor(`Boolean(${targetPoint})`, 5000)
  const point = await browser.evaluate(targetPoint)
  assert.ok(point, 'UI button missing, hidden, or disabled: ' + selector)
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
}
async function clickText(text, scope = 'body') {
  await browser.waitFor(`Boolean([...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(n=>{if(n.textContent.trim()!==${JSON.stringify(text)}||n.closest('[hidden]')||getComputedStyle(n).visibility==='hidden')return false;const r=n.getBoundingClientRect();return r.width&&r.height&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}))`, 5000)
  const selector = await browser.evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(n=>{if(n.textContent.trim()!==${JSON.stringify(text)}||n.closest('[hidden]')||getComputedStyle(n).visibility==='hidden')return false;const r=n.getBoundingClientRect();return r.width&&r.height&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});if(!n)return null;n.dataset.editorToolFixture=${JSON.stringify(text)};return '[data-editor-tool-fixture='+JSON.stringify(${JSON.stringify(text)})+']'})()`)
  assert.ok(selector, 'UI button not found: ' + text)
  await click(selector)
}
async function key(key, code, extra = {}) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...extra })
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, ...extra })
}
async function appendEditor(text, paragraph = false) {
  await click('.mimir-paper .tiptap')
  await key('End', 'End', { modifiers: 2, windowsVirtualKeyCode: 35 })
  if (paragraph) await key('Enter', 'Enter', { text: '\r', windowsVirtualKeyCode: 13 })
  await browser.send('Input.insertText', { text })
}
async function editorText() { return browser.evaluate("document.querySelector('.mimir-paper .tiptap').innerText.trim()") }
async function sample(name, run) {
  const check = { name, passed: false }, start = Date.now(); report.checks.push(check)
  try { check.evidence = await run(); check.passed = true }
  catch (error) { check.error = { name: error.name, message: error.message.slice(0, 400) }; await snapshot('failure-' + name).catch(() => {}) }
  check.seconds = Math.round((Date.now() - start) / 1000); save()
  console.log((check.passed ? 'PASS ' : 'FAIL ') + name)
}
async function downloaded(extension, before) {
  await wait(() => readdirSync(downloads).some(name => !before.has(name) && name.endsWith(extension) && statSync(join(downloads, name)).size > 0), 30000)
  const name = readdirSync(downloads).find(name => !before.has(name) && name.endsWith(extension))
  const path = resolve(downloads, name); assert.equal(dirname(path), downloads)
  const bytes = readFileSync(path)
  const evidence = { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), realUIDownload: true }
  report.downloads.push(evidence)
  return { evidence, text: bytes.toString('utf8') }
}
async function closeBrowser() {
  if (!browserPort || !edge || edge.exitCode !== null) return
  try {
    const info = await (await fetch('http://127.0.0.1:' + browserPort + '/json/version')).json()
    await new Promise((done, fail) => {
      const socket = new WebSocket(info.webSocketDebuggerUrl)
      const timer = setTimeout(() => { socket.close(); fail(new Error('Owned browser close timeout')) }, 5000)
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
      socket.addEventListener('close', () => { clearTimeout(timer); done() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); fail(new Error('Owned browser close error')) }, { once: true })
    })
  } catch { await delay(300) }
  await wait(() => edge.exitCode !== null, 7000)
}
try {
  launcher = spawn(join(project, 'runtime', 'Mimir.exe'), ['--headless', '--data-home', home], { cwd: project, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [launcher.stdout, launcher.stderr]) stream.on('data', bytes => { log = (log + bytes).slice(-12000); writeFileSync(join(home, 'native-launcher.log'), log) })
  await wait(() => existsSync(join(home, 'instance.json')))
  instance = JSON.parse(readFileSync(join(home, 'instance.json'), 'utf8')); origin = new URL(instance.url).origin
  assert.equal(new URL(origin).hostname, '127.0.0.1')
  edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + browserHome, 'about:blank'], { windowsHide: true, env, stdio: 'ignore' })
  await wait(() => existsSync(join(browserHome, 'DevToolsActivePort')), 20000)
  browserPort = Number(readFileSync(join(browserHome, 'DevToolsActivePort'), 'utf8').split('\n')[0])
  browser = await connectBrowser(browserPort)
  const requestRows = new Map()
  browser.on(event => {
    if (event.method === 'Runtime.exceptionThrown') report.browserExceptions.push({ text: event.params.exceptionDetails.text })
    if (event.method === 'Network.requestWillBeSent') {
      const { requestId, request } = event.params, url = new URL(request.url)
      if (url.origin !== origin || !url.pathname.startsWith('/api/')) return
      let input = {}; try { input = JSON.parse(request.postData ?? '{}') } catch {}
      const row = { method: request.method, path: url.pathname, ...(input.operation ? { operation: input.operation } : {}) }
      report.requests.push(row); requestRows.set(requestId, row)
    }
    if (event.method === 'Network.responseReceived') {
      const row = requestRows.get(event.params.requestId)
      if (row) row.status = event.params.response.status
    }
    if (event.method === 'Network.loadingFinished') {
      const row = requestRows.get(event.params.requestId)
      if (row?.operation === 'runtime.run') void browser.send('Network.getResponseBody', { requestId: event.params.requestId }).then(result => {
        const payload = JSON.parse(result.base64Encoded ? Buffer.from(result.body, 'base64').toString() : result.body)
        const value = payload.data; row.completed = true; row.result = { ok: payload.ok, exitCode: value?.execution?.exitCode, stdout: value?.execution?.stdout?.trim(), timedOut: value?.execution?.timedOut, generatedFiles: value?.files?.map(file => file.name) }
      }).catch(() => { row.responseInspectionFailed = true })
    }
  })
  await browser.send('Network.enable')
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url })
  await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  await snapshot('landing-observed')
  await click('.mimir-product-nav button[aria-label="文稿"]')
  await browser.waitFor("Boolean(document.querySelector('.mimir-nav-document'))")
  await snapshot('manuscript-navigation-observed')
  await click('.mimir-nav-document')
  await browser.waitFor("Boolean(document.querySelector('.mimir-paper .tiptap'))")
  await browser.send('Page.bringToFront')
  await delay(1400)
  await browser.waitFor("document.querySelector('.mimir-status')?.textContent==='文稿已保存'")
  await snapshot('editor-observed')
  const marker = 'UIUNDOREDO' + runId.slice(0, 8), latest = 'UILATESTEXPORT' + runId.slice(0, 8)
  const originalText = await editorText(); let editedText
  await sample('editor-undo-redo-real-toolbar', async () => {
    await appendEditor(marker, true)
    await browser.waitFor(`document.querySelector('.mimir-paper .tiptap').innerText.includes(${JSON.stringify(marker)})`)
    editedText = await editorText(); assert.notEqual(editedText, originalText)
    await click('.mimir-toolbar button[aria-label="撤销"]')
    await browser.waitFor(`!document.querySelector('.mimir-paper .tiptap').innerText.includes(${JSON.stringify(marker)})`)
    assert.equal(await editorText(), originalText)
    await click('.mimir-toolbar button[aria-label="重做"]')
    await browser.waitFor(`document.querySelector('.mimir-paper .tiptap').innerText.includes(${JSON.stringify(marker)})`)
    assert.equal(await editorText(), editedText)
    await click('.mimir-save-button')
    await browser.waitFor("document.querySelector('.mimir-status')?.textContent==='文稿已保存'")
    return { typedText: marker, revertedToOriginalText: true, restoredExactEditedText: true, explicitSaveStatus: '文稿已保存' }
  })
  await sample('editor-export-latest-markdown-from-ui', async () => {
    await appendEditor(' ' + latest)
    await browser.waitFor(`document.querySelector('.mimir-paper .tiptap').innerText.includes(${JSON.stringify(latest)})`)
    const statusAtExport = await browser.evaluate("document.querySelector('.mimir-status').textContent")
    const before = new Set(readdirSync(downloads)); await clickText('导出 Markdown', '.mimir-export')
    const file = await downloaded('.md', before)
    assert.ok(file.text.includes(marker)); assert.ok(file.text.includes(latest)); assert.ok(file.text.includes(originalText.split('\n')[0]))
    return { ...file.evidence, statusAtExport, latestVisibleTextIncluded: true, redoTextIncluded: true }
  })
  await sample('editor-export-latest-latex-from-ui', async () => {
    const before = new Set(readdirSync(downloads)); await clickText('导出 LaTeX', '.mimir-export')
    const file = await downloaded('.tex', before)
    assert.ok(file.text.includes(latest)); assert.ok(file.text.includes(marker)); assert.ok(file.text.includes('\\begin{document}'))
    return { ...file.evidence, latestVisibleTextIncluded: true, completeDocumentWrapper: true }
  })
  await snapshot('editor-final')
  await click('.mimir-nav-tools')
  await browser.waitFor("Boolean(document.querySelector('.mimir-tools')?.getBoundingClientRect().width)&&!document.querySelector('.mimir-tools')?.closest('[hidden]')")
  await snapshot('tools-observed')
  await clickText('本地运行', '.mimir-tool-tabs')
  await browser.waitFor("Boolean(document.querySelector('.mimir-code-input'))")
  await snapshot('runtime-ui-observed')
  const script = 'from pathlib import Path\nimport time\nprint("UI-TOOL-START", flush=True)\ntime.sleep(12)\nPath("ui-tool-result.txt").write_text("synthetic UI completed once", encoding="utf-8")\nprint("UI-TOOL-DONE", flush=True)\n'
  await click('.mimir-code-input')
  await key('a', 'KeyA', { modifiers: 2, windowsVirtualKeyCode: 65 })
  await browser.send('Input.insertText', { text: script })
  await browser.waitFor(`document.querySelector('.mimir-code-input').value===${JSON.stringify(script)}`)
  await sample('tool-ui-prevents-repeat-runtime-submit', async () => {
    const before = report.requests.filter(row => row.operation === 'runtime.run').length
    await clickText('运行脚本', '.mimir-tool-body')
    await browser.waitFor("Boolean([...document.querySelectorAll('.mimir-tool-body button')].find(n=>n.textContent.trim()==='运行脚本'&&n.disabled))")
    const point = await browser.evaluate("(()=>{const n=[...document.querySelectorAll('.mimir-tool-body button')].find(n=>n.textContent.trim()==='运行脚本');const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
    // A second real pointer click hits the disabled button while the actual process is pending.
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
    const controls = await browser.evaluate("[...document.querySelectorAll('.mimir-tools button')].filter(n=>n.getBoundingClientRect().width).map(n=>({text:n.textContent.trim(),aria:n.getAttribute('aria-label'),disabled:n.disabled}))")
    const cancel = controls.find(row => /取消|停止/.test(row.text + ' ' + row.aria))
    report.toolCancellation = { status: cancel ? 'available_not_exercised' : 'unavailable', pendingOperation: 'runtime.run', visibleToolControlsInspected: true,
      backendAbortPathPresent: true, actualUICancellationVerified: false, reason: cancel ? 'Visible control requires separate verification.' : 'The pending local runtime panel exposes no cancel/stop button. Backend request-signal cancellation is not a UI action.' }
    await snapshot('runtime-pending-disabled')
    await delay(500)
    assert.equal(report.requests.filter(row => row.operation === 'runtime.run').length - before, 1)
    await browser.waitFor("Boolean([...document.querySelectorAll('.mimir-tool-body button')].find(n=>n.textContent.trim()==='运行脚本'&&!n.disabled))", 25000)
    await wait(() => report.requests.some(row => row.operation === 'runtime.run' && row.completed), 5000)
    const requests = report.requests.filter(row => row.operation === 'runtime.run').slice(before)
    assert.equal(requests.length, 1); assert.equal(requests[0].status, 200); assert.equal(requests[0].result.ok, true)
    assert.equal(requests[0].result.exitCode, 0); assert.equal(requests[0].result.timedOut, false)
    assert.equal(requests[0].result.stdout.replace(/\r\n/g, '\n'), 'UI-TOOL-START\nUI-TOOL-DONE')
    assert.ok(requests[0].result.generatedFiles.includes('ui-tool-result.txt'))
    assert.ok(await browser.evaluate("document.querySelector('.mimir-tools').innerText.includes('UI-TOOL-DONE')"))
    return { secondRealPointerClick: true, disabledWhilePending: true, requests: 1, actualProcessExitCode: 0, stdout: requests[0].result.stdout, generatedFiles: requests[0].result.generatedFiles, resultVisible: true, reenabledAfterCompletion: true }
  })
  await snapshot('runtime-completed')
  assert.equal(report.requests.filter(row => /\/ai\/(assist|suggest|generate)/.test(row.path)).length, 0)
  assert.deepEqual(report.browserExceptions, [])
} catch (error) {
  report.failure = { name: error.name, message: error.message.slice(0, 400) }
  await snapshot('fixture-failure').catch(() => {})
} finally {
  await browser?.close().catch(() => {})
  await closeBrowser().catch(() => { report.cleanup.browserCloseFailed = true })
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => { report.cleanup.hostCloseFailed = true })
  if (instance) await wait(() => !existsSync(join(home, 'instance.json')), 15000).catch(() => { report.cleanup.hostCloseFailed = true })
  report.cleanup = { ...report.cleanup, browserStopped: !edge || edge.exitCode !== null, nativeHostStopped: !existsSync(join(home, 'instance.json')) }
  // Only exact fixed files inside this newly created UUID home; no recursive deletion.
  for (const name of ['instance.json', '.credentials.yaml', '.credentials.yaml.lock', 'model.secret']) {
    const target = resolve(home, name); assert.equal(dirname(target), home)
    await rm(target, { force: true }).catch(error => { if (error.code !== 'ENOENT') report.cleanup.credentialRemovalFailed = true })
  }
  report.passed = !report.failure && report.checks.length === 4 && report.checks.every(row => row.passed) && report.browserExceptions.length === 0 && report.cleanup.browserStopped && report.cleanup.nativeHostStopped && !report.cleanup.browserCloseFailed && !report.cleanup.hostCloseFailed && !report.cleanup.credentialRemovalFailed
  report.completedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, toolCancellation: report.toolCancellation.status, paidModelCalls: 0 }))
  if (!report.passed) process.exitCode = 1
}
