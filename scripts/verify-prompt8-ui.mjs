// Isolated native host, real PDF parser and browser; no model requests.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { connectBrowser } from './cdp.mjs'
import { syntheticPdf } from './prompt4-browser.mjs'

const root = resolve('.'), home = join(root, '.test-data', 'prompt8-ui-' + randomUUID())
mkdirSync(home, { recursive: true })
let host, edge, browser, instance, output = '', browserPort
const checks = [], errors = [], layouts = []
const delay = ms => new Promise(done => setTimeout(done, ms))
async function ready(file) {
  const until = Date.now() + 60000
  while (!existsSync(file) && Date.now() < until) {
    if (host?.exitCode !== null && host?.exitCode !== undefined) throw new Error('Fixture host exited: ' + output)
    await delay(100)
  }
  assert.ok(existsSync(file), 'Startup timed out: ' + file)
}
async function click(selector) {
  assert.equal(await browser.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.click();return true})()`), true, selector)
  await delay(120)
}
async function measure() {
  return browser.evaluate(`(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {width:innerWidth,height:innerHeight,bodyWidth:document.body.scrollWidth,header:box('header'),tabs:box('#paper-tabs'),view:box('#paper-view'),surface:box('#page-surface'),footer:box('.reader-footer'),import:box('#import-button'),settings:box('#settings'),page:document.querySelector('#page').value}})()`)
}
try {
  host = spawn(process.execPath, ['runtime/system/app/app.mjs', '--data-home', home], { cwd: root, windowsHide: true, env: { ...process.env, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'] })
  host.stdin.end('{}')
  for (const stream of [host.stdout, host.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-12000) })
  await ready(join(home, 'instance.json'))
  instance = JSON.parse(readFileSync(join(home, 'instance.json')))
  const browserHome = join(home, 'browser')
  edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--user-data-dir=' + browserHome, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  await ready(join(browserHome, 'DevToolsActivePort'))
  browserPort = Number(readFileSync(join(browserHome, 'DevToolsActivePort'), 'utf8').split('\n')[0])
  browser = await connectBrowser(browserPort)
  browser.on(event => { if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text) })
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await browser.send('Page.navigate', { url: instance.url })
  await browser.waitFor("Boolean(document.querySelector('.mg-wordmark-art,.mg-wordmark-light'))")
  const opened = await browser.evaluate("fetch('/api/paper-guide/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rpcId:'prompt8-ui'})}).then(r=>r.json())")
  const paperUrl = opened.result.value.url
  await browser.send('Page.navigate', { url: paperUrl })
  await browser.waitFor("Boolean(document.querySelector('#selection-tools'))&&document.querySelector('#status').textContent.includes('业务服务已连接')")
  const emptyLayout = await measure()
  assert.ok(emptyLayout.view.height > 700)
  checks.push('Empty reader connects to the native host with lower tools visible.')

  const pdf = syntheticPdf().toString('base64')
  await browser.evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(pdf)}),c=>c.charCodeAt(0)),files=new DataTransfer();for(const [i,title] of ['合成论文 A.pdf','合成论文 B · 较长标题用于检查顶部页签布局.pdf'].entries())files.items.add(new File([bytes,'\\n% synthetic fixture '+i+'\\n'],title,{type:'application/pdf'}));const input=document.querySelector('#import-file');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await browser.waitFor("document.querySelectorAll('.paper-tab').length===2&&!document.querySelector('#page-surface').hidden&&document.querySelectorAll('#text-layer span').length>0", 60000)
  checks.push('Two synthetic PDFs imported and rendered by the real parser and PDF.js.')

  for (const [width, height] of [[1440, 1000], [1280, 720], [1024, 768], [800, 700], [390, 844]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await delay(800)
    const layout = await measure()
    assert.equal(layout.header.x, 0)
    assert.equal(layout.header.y, 0)
    assert.ok(layout.tabs.y < 2)
    assert.ok(layout.import.y > layout.view.y)
    assert.ok(layout.bodyWidth <= width + 1, 'Horizontal page overflow: ' + width)
    assert.ok(layout.view.height > (width > 700 ? height * .56 : 300), 'PDF area too small: ' + JSON.stringify(layout))
    if (width > 700) assert.ok(layout.footer.bottom <= height + 1)
    assert.ok(Math.abs(layout.surface.width - (layout.view.width - 30)) < 25, 'PDF did not adapt to reading width')
    layouts.push(layout)
    if ([1440, 1280, 390].includes(width)) {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(`artifacts/prompt8-reader-${width}.png`, Buffer.from(shot.data, 'base64'))
    }
  }
  checks.push('Top-aligned title/tabs, lower tools, no horizontal page overflow and adaptive PDF at five viewport sizes.')

  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await delay(700)
  const before = await measure()
  await click('#analysis-toggle')
  await delay(700)
  const expanded = await measure()
  assert.ok(expanded.view.width > before.view.width + 250)
  assert.ok(expanded.surface.width > before.surface.width + 250)
  await click('#analysis-toggle')
  await click('#library-toggle')
  assert.equal(await browser.evaluate("document.querySelector('#paper-library').hidden"), false)
  await click('#library-close')
  await click('#settings-toggle')
  assert.equal(await browser.evaluate("document.querySelector('#settings').hidden"), false)
  assert.equal(await browser.evaluate("document.querySelector('#settings-toggle').getAttribute('aria-expanded')"), 'true')
  assert.ok((await measure()).view.height > 260)
  await click('#settings-toggle')
  await click('.paper-tab:first-child>button:first-child')
  await browser.waitFor("document.querySelector('#paper-title').textContent==='合成论文 A.pdf'&&document.querySelectorAll('#text-layer span').length>0")
  assert.equal(await browser.evaluate("document.querySelectorAll('.paper-tab>button[aria-current=true]').length"), 1)
  await click('.paper-tab:last-child .paper-tab-close')
  await browser.waitFor("document.querySelectorAll('.paper-tab').length===1")
  await click('#export')
  checks.push('Assistant and directory toggles resize the PDF; model panel opens; paper tabs switch/close; lower export remains operable.')

  // Open each registered topic in the actual learning studio, including a custom one.
  for (const courseId of ['mit-robotics', 'topic-coordinate', 'topic-ohm', 'topic-response', 'topic-data', 'custom']) {
    await browser.send('Page.navigate', { url: instance.url })
    await browser.waitFor("Boolean(document.querySelector('.mg-wordmark-light'))")
    const taskId = await browser.evaluate(`(async()=>{
      const state=()=>fetch('/api/mimir/growth/state').then(r=>r.json()).then(r=>r.data);
      const post=async(op,payload)=>{const s=await state();const r=await fetch('/api/mimir/growth/'+op,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,version:s.version,requestKey:crypto.randomUUID()})});const value=await r.json();if(!value.ok)throw Error(value.error.message);return value.data.result};
      const id=${JSON.stringify(courseId)}==='custom'?(await post('custom-choice',{label:'深入学习主题',title:'合成材料验证',source:'https://example.org/materials'})).id:${JSON.stringify(courseId)};
      const draft=await post('course-plan',{courseId:id});const plan=await post('confirm',{planId:draft.id});return plan.tasks.find(task=>task.courseRef?.id===id).id;
    })()`)
    await browser.send('Page.navigate', { url: instance.url })
    await browser.waitFor("Boolean(document.querySelector('.mg-topbar nav'))")
    assert.equal(await browser.evaluate("(()=>{const b=[...document.querySelectorAll('.mg-topbar nav button')].find(n=>n.textContent.includes('世界树'));b?.click();return Boolean(b)})()"), true)
    await browser.waitFor(`Boolean(document.querySelector('.mg-todo-row[data-task-id="${taskId}"] .mg-todo-open'))`)
    await click(`.mg-todo-row[data-task-id="${taskId}"] .mg-todo-open`)
    await browser.waitFor("Boolean(document.querySelector('.mg-todo-inspector'))")
    assert.equal(await browser.evaluate("(()=>{const b=[...document.querySelectorAll('.mg-todo-inspector button')].find(n=>n.textContent.trim()==='进入完整学习 →');b?.click();return Boolean(b)})()"), true)
    await browser.waitFor("Boolean(document.querySelector('.mg-studio-body'))")
    assert.equal(await browser.evaluate("(()=>{const b=[...document.querySelectorAll('.mg-studio-body button')].find(n=>n.textContent.trim()==='开始这次学习 →');b?.click();return Boolean(b)})()"), true)
    await browser.waitFor("Boolean(document.querySelector('[data-learning-field=prediction]'))")
    assert.equal(await browser.evaluate("Boolean(document.querySelector('.mg-course-guide,.mg-quiz,.mg-robot-diagnosis'))"), false)
    assert.equal(await browser.evaluate("document.querySelector('.mg-studio-body').textContent.includes('检查先修')"), false)
  }
  checks.push('All five built-in topics and a custom topic open step 02 without original guide panels, prerequisite tests or post-lesson quizzes.')
  assert.deepEqual(errors, [])
  writeFileSync('artifacts/prompt8-ui.json', JSON.stringify({ passed: true, checks, layouts, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, viewports: layouts.map(({ width, height, view }) => ({ width, height, readingHeight: view.height })) }))
} catch (error) {
  const state = await browser?.evaluate("({status:document.querySelector('#status')?.textContent,title:document.title,body:document.body.innerText.slice(0,700)})").catch(() => null)
  writeFileSync('artifacts/prompt8-ui.json', JSON.stringify({ passed: false, error: error.stack, checks, layouts, errors, state }, null, 2))
  console.error(error.stack)
  if (!instance) console.error(output)
  process.exitCode = 1
} finally {
  if (browser) { await browser.send('Browser.close').catch(() => {}); await browser.close().catch(() => {}) }
  if (instance) await fetch(`http://127.0.0.1:${instance.controlPort}/exit`, { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  const until = Date.now() + 8000
  while ((host?.exitCode === null || edge?.exitCode === null) && Date.now() < until) await delay(100)
  if (host?.exitCode === null || edge?.exitCode === null) { console.error('Owned fixture process did not exit normally.'); process.exitCode = 1 }
}
