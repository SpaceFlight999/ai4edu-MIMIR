// Real UI acceptance. No provider fixture, model credential, personal data, or backend substitute.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve, join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectBrowser } from './cdp.mjs'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runId = randomUUID(), home = join(project, '.test-data', 'editor-tool-ui-' + runId)
const browserHome = join(home, 'browser'), downloads = join(home, 'downloads')
const reportAt = process.argv.indexOf('--report')
const artifact = reportAt < 0 ? join(project, 'artifacts', 'editor-remaining-ui-followup-20261011.json') : resolve(process.argv[reportAt + 1] ?? '')
assert.equal(dirname(artifact), join(project, 'artifacts'))
assert.match(basename(artifact), /^editor-remaining-ui-[a-z0-9-]+\.json$/)
assert.equal(existsSync(artifact), false, 'Keep historical reports; use a new artifact name.')
assert.equal(dirname(home), join(project, '.test-data'))
assert.match(basename(home), /^editor-tool-ui-[0-9a-f-]{36}$/)
for (const directory of [home, downloads]) mkdirSync(directory, { recursive: true })
writeFileSync(join(home, 'owned-by-editor-tool-ui.json'), JSON.stringify({ runId, project, material: 'synthetic UI acceptance only' }))
const env = { ...process.env }
for (const key of Object.keys(env)) if (/(?:api.?key|token|secret|password)/i.test(key)) delete env[key]
const report = { at: new Date().toISOString(), version: JSON.parse(readFileSync(join(project, 'growth/package.json'), 'utf8')).version,
  nativeLauncher: true, actualBrowserUI: true, syntheticHomeOnly: true, realDataRead: false, paidModelCalls: 0,
  checks: [], requests: [], downloads: [], scope:'Existing rich-text formatting, formula, table, long output, and paper deletion capability only', priorFourChecksNotRepeated:true, earlierAttemptsPreserved:['artifacts/editor-remaining-ui-followup-20261011.json','artifacts/editor-remaining-ui-recheck-20261011.json'], actionSequence:[], documentSaves:[], paperDeletion:null, browserExceptions: [], cleanup: {}, passed: false }
let launcher, edge, browser, browserPort, instance, log = '', origin
const delay = ms => new Promise(done => setTimeout(done, ms))
async function wait(check, timeout = 150000) {
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
  report.actionSequence.push({action:'realPointerClick',selector,at:new Date().toISOString()});
  const targetPoint = `(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})];for(const n of nodes){if(n.disabled||n.closest('[hidden]')||getComputedStyle(n).visibility==='hidden')continue;const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);if(r.width&&r.height&&n.contains(hit))return{x,y};}return null})()`
  await browser.waitFor(`Boolean(${targetPoint})`, 5000)
  const point = await browser.evaluate(targetPoint)
  assert.ok(point, 'UI button missing, hidden, or disabled: ' + selector)
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
  await delay(100)
}
async function clickText(text, scope = 'body') {
  await browser.waitFor(`Boolean([...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(n=>{if(n.textContent.trim()!==${JSON.stringify(text)}||n.closest('[hidden]')||getComputedStyle(n).visibility==='hidden')return false;const r=n.getBoundingClientRect();return r.width&&r.height&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}))`, 5000)
  const selector = await browser.evaluate(`(()=>{const n=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(n=>{if(n.textContent.trim()!==${JSON.stringify(text)}||n.closest('[hidden]')||getComputedStyle(n).visibility==='hidden')return false;const r=n.getBoundingClientRect();return r.width&&r.height&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});if(!n)return null;n.dataset.editorToolFixture=${JSON.stringify(text)};return '[data-editor-tool-fixture='+JSON.stringify(${JSON.stringify(text)})+']'})()`)
  assert.ok(selector, 'UI button not found: ' + text)
  await click(selector)
}
async function key(key, code, extra = {}) {
  report.actionSequence.push({action:'realKey',key,code,modifiers:extra.modifiers??0,at:new Date().toISOString()});
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...extra })
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, ...extra })
  await delay(80)
}
async function sample(name, run) {
  const check = { name, passed: false }, start = Date.now(); report.checks.push(check)
  try { check.evidence = await run(); check.passed = true }
  catch (error) { check.error = { name: error.name, message: error.message.slice(0, 400) }; await snapshot('failure-' + name).catch(() => {}) }
  check.seconds = Math.round((Date.now() - start) / 1000); save()
  console.log((check.passed ? 'PASS ' : 'FAIL ') + name)
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
      if(url.pathname==='/api/mimir/document/save') {
        const safeNode=n=>({type:n.type,attrs:n.attrs,marks:n.marks,text:n.text,content:Array.isArray(n.content)?n.content.map(safeNode):undefined});
        row.saveInput={documentId:input.documentId,baseVersion:input.baseVersion,expectedVersion:input.expectedVersion,content:input.content?safeNode(input.content):undefined};
        report.documentSaves.push(row);
        void browser.evaluate("[...document.querySelector('.tiptap').querySelectorAll('[data-block-id]')].map(n=>({tag:n.tagName,blockId:n.getAttribute('data-block-id'),text:n.textContent}))").then(nodes=>{row.sourceDOM=nodes}).catch(()=>{});
      }
      report.requests.push(row); requestRows.set(requestId, row)
    }
    if (event.method === 'Network.responseReceived') {
      const row = requestRows.get(event.params.requestId)
      if (row) row.status = event.params.response.status
    }
    if (event.method === 'Network.loadingFinished') {
      const row = requestRows.get(event.params.requestId)
      if(row?.path==='/api/mimir/document/save') void browser.send('Network.getResponseBody',{requestId:event.params.requestId}).then(result=>{const payload=JSON.parse(result.base64Encoded?Buffer.from(result.body,'base64').toString():result.body);row.saveResponse={ok:payload.ok,error:payload.error,message:payload.message,version:payload.data?.version}}).catch(()=>{row.saveResponseInspectionFailed=true});
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
  report.initialEditorStructure=await browser.evaluate("[...document.querySelector('.tiptap').querySelectorAll('[data-block-id]')].map(n=>({tag:n.tagName,blockId:n.getAttribute('data-block-id'),text:n.textContent}))")


  await click('.mimir-nav-tools'); await browser.waitFor("Boolean(document.querySelector('.mimir-tools')?.getBoundingClientRect().width)&&!document.querySelector('.mimir-tools')?.closest('[hidden]')");
  await clickText('本地运行','.mimir-tool-tabs'); await browser.waitFor("Boolean(document.querySelector('.mimir-code-input'))");
  await sample('tool-long-output-current-ui-and-native-wheel',async()=>{
    const code='print("UI-LONG-FIRST")\nfor n in range(120):\n    print("UI-LONG-LINE-%03d" % n)\nprint("UI-LONG-LAST")\n';
    await click('.mimir-code-input');await key('a','KeyA',{modifiers:2,windowsVirtualKeyCode:65});await browser.send('Input.insertText',{text:code});
    await browser.waitFor('document.querySelector(".mimir-code-input").value==='+JSON.stringify(code));await delay(100);await clickText('运行脚本','.mimir-tool-body');
    await browser.waitFor("document.querySelector('.mimir-tool-success')?.textContent.includes('UI-LONG-LAST')",30000);
    await wait(()=>report.requests.some(n=>n.operation==='runtime.run'&&n.completed),5000);
    const request=report.requests.find(n=>n.operation==='runtime.run'&&n.completed);assert.equal(request.result.exitCode,0);assert.equal(request.status,200);
    const initial=await browser.evaluate("(()=>{const n=document.querySelector('.mimir-tool-success');let parent=n;const parents=[];while(parent){const css=getComputedStyle(parent);parents.push({tag:parent.tagName,class:parent.className,scrollHeight:parent.scrollHeight,clientHeight:parent.clientHeight,scrollTop:parent.scrollTop,overflowY:css.overflowY});parent=parent.parentElement}return{containsFirst:n.textContent.includes('UI-LONG-FIRST'),containsLast:n.textContent.includes('UI-LONG-LAST'),resultClass:n.className,whiteSpace:getComputedStyle(n).whiteSpace,innerOverflowY:getComputedStyle(n).overflowY,innerScrollHeight:n.scrollHeight,innerClientHeight:n.clientHeight,parents}})()");
    report.longOutputObservation=initial;
    assert.ok(initial.containsFirst&&initial.containsLast);
    const scrollParent=initial.parents.find(n=>['auto','scroll'].includes(n.overflowY)&&n.scrollHeight>n.clientHeight);assert.ok(scrollParent,'Existing scrollable tool container must be observable.');
    const parentClass=String(scrollParent.class).split(' ').filter(Boolean)[0],selector='.'+parentClass;
    const point=await browser.evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+"),r=n.getBoundingClientRect();return{x:r.x+r.width*.7,y:r.y+Math.min(200,r.height/2)}})()");
    const geometry=()=>browser.evaluate("(()=>{const parent=document.querySelector("+JSON.stringify(selector)+"),p=parent.getBoundingClientRect(),n=document.querySelector('.mimir-tool-success'),walk=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);let text;while(text=walk.nextNode())if(text.data.includes('UI-LONG-LAST'))break;const range=document.createRange(),at=text.data.indexOf('UI-LONG-LAST');range.setStart(text,at);range.setEnd(text,at+12);const r=range.getBoundingClientRect();return{scrollTop:parent.scrollTop,lastMarkerVisible:r.top>=p.top&&r.bottom<=p.bottom,markerTop:r.top,markerBottom:r.bottom,parentTop:p.top,parentBottom:p.bottom}})()");
    let after=await geometry();const atStart=after.scrollTop;
    // The complete output can already fit onscreen; still perform a real wheel action.
    await browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:220,...point});await delay(150);after=await geometry();
    report.longOutputWheelObservation={startScrollTop:atStart,after};
    for(let i=0;i<18&&!after.lastMarkerVisible;i++){await browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:220,...point});await delay(80);after=await geometry()}
    assert.ok(after.lastMarkerVisible,'The last output marker must become visible through real wheel scrolling.');
    assert.ok(after.scrollTop>atStart,'Native wheel must move the tool container.');
    for(let i=0;i<18;i++){await browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:-220,...point});await delay(50)}
    const returned=await geometry();assert.equal(returned.scrollTop,0);
    return {...initial,actualRuntimeExitCode:0,httpStatus:200,completeOutputPrefixSuffix:true,dedicatedOutputScrollAvailable:['auto','scroll'].includes(initial.innerOverflowY)&&initial.innerScrollHeight>initial.innerClientHeight,existingToolContainerScroll:scrollParent.class,realMouseWheel:true,startScrollTop:atStart,after,returnedToStart:true};
  });
  assert.equal(report.requests.filter(row=>/\/ai\/(assist|suggest|generate)/.test(row.path)).length,0);
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
  report.passed = !report.failure && report.checks.length === 1 && report.checks.every(row => row.passed) && report.browserExceptions.length === 0 && report.cleanup.browserStopped && report.cleanup.nativeHostStopped && !report.cleanup.browserCloseFailed && !report.cleanup.hostCloseFailed && !report.cleanup.credentialRemovalFailed
  report.completedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, paperDeletionAvailable: report.paperDeletion?.available ?? null, paidModelCalls: 0 }))
  if (!report.passed) process.exitCode = 1
}
