// Real UI acceptance. No provider fixture, model credential, personal data, or backend substitute.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve, join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectBrowser } from './cdp.mjs'
import { longPaperFixture } from './long-paper-fixture.mjs'

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
async function appendEditor(text, paragraph = false) {
  const point = await browser.evaluate("(()=>{const e=document.querySelector('.mimir-paper .tiptap'),n=[...e.querySelectorAll('p,h1,h2,h3')].at(-1)??e;n.scrollIntoView({block:'center'});const range=document.createRange();range.selectNodeContents(n);range.collapse(false);const r=range.getBoundingClientRect(),b=n.getBoundingClientRect();return{x:r.height?r.x:b.x+5,y:r.height?r.y+r.height/2:b.y+b.height/2}})()");
  await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await delay(150);
  await key('End','End',{windowsVirtualKeyCode:35})
  if (paragraph) await key('Enter', 'Enter', { text: '\r', windowsVirtualKeyCode: 13 })
  await browser.send('Input.insertText', { text })
  await delay(100)
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

  const markers = { heading:'UIHEADING'+runId.slice(0,8), bold:'UIBOLD'+runId.slice(0,8), italic:'UIITALIC'+runId.slice(0,8), list:'UILIST'+runId.slice(0,8), cell:'UITABLECELL'+runId.slice(0,8) };
  const existsText = (selector, text) => 'Boolean([...document.querySelectorAll('+JSON.stringify('.mimir-paper .tiptap '+selector)+')].find(n=>n.textContent.includes('+JSON.stringify(text)+')))';
  async function selectCurrentLine(marker) {
    const point=await browser.evaluate("(()=>{const e=document.querySelector('.mimir-paper .tiptap'),walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode())if(n.data.includes("+JSON.stringify(marker)+")){n.parentElement.scrollIntoView({block:'center'});const range=document.createRange(),at=n.data.indexOf("+JSON.stringify(marker)+");range.setStart(n,at);range.setEnd(n,at+"+marker.length+");const r=range.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};}return null})()");
    assert.ok(point,'New typed marker must be present for real text selection');
    await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:2,...point});
    await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:2,...point});
    await delay(150);
    assert.ok((await browser.evaluate('window.getSelection().toString()')).includes(marker));
  }
  await sample('editor-heading-real-toolbar', async()=>{
    await appendEditor(markers.heading,true);
    await click('.mimir-toolbar button[aria-label="二级标题"]');
    await browser.waitFor(existsText('h2',markers.heading));
    return {marker:markers.heading,domNode:'h2',realToolbarClick:true};
  });
  await sample('editor-bold-real-toolbar', async()=>{
    await appendEditor(markers.bold,true); await selectCurrentLine(markers.bold);
    await click('.mimir-toolbar button[aria-label="加粗"]');
    await browser.waitFor(existsText('strong',markers.bold));
    return {marker:markers.bold,domNode:'strong',realMouseSelection:true,realToolbarClick:true};
  });
  await sample('editor-italic-real-toolbar', async()=>{
    await appendEditor(markers.italic,true); await selectCurrentLine(markers.italic);
    await click('.mimir-toolbar button[aria-label="斜体"]');
    await browser.waitFor(existsText('em',markers.italic));
    return {marker:markers.italic,domNode:'em',realMouseSelection:true,realToolbarClick:true};
  });
  await sample('editor-list-real-toolbar', async()=>{
    await appendEditor(markers.list,true); await clickText('列表','.mimir-toolbar');
    await browser.waitFor(existsText('ul li',markers.list));
    return {marker:markers.list,domNode:'ul li',realToolbarClick:true};
  });
  // Enter twice at a list's end exits the new empty item through the real keyboard.
  await click('.mimir-paper .tiptap'); await key('End','End',{modifiers:2,windowsVirtualKeyCode:35});
  await key('Enter','Enter',{text:'\r',windowsVirtualKeyCode:13}); await key('Enter','Enter',{text:'\r',windowsVirtualKeyCode:13});
  let formulaLatex;
  await sample('editor-formula-cancel-and-insert-real-controls',async()=>{
    const before=await browser.evaluate("document.querySelectorAll('.mimir-paper .tiptap [data-mimir-formula]').length");
    await clickText('公式','.mimir-toolbar'); await browser.waitFor("Boolean(document.querySelector('math-field'))");
    await clickText('取消','.mimir-modal');
    await browser.waitFor("!document.querySelector('.mimir-modal')");
    assert.equal(await browser.evaluate("document.querySelectorAll('.mimir-paper .tiptap [data-mimir-formula]').length"),before);
    await clickText('公式','.mimir-toolbar'); await browser.waitFor("Boolean(document.querySelector('math-field'))");
    const mathDoc=await browser.send('DOM.getDocument'), mathNode=await browser.send('DOM.querySelector',{nodeId:mathDoc.root.nodeId,selector:'math-field'});
    await browser.send('DOM.focus',{nodeId:mathNode.nodeId}); await delay(150);
    await key('x','KeyX',{text:'x',unmodifiedText:'x',windowsVirtualKeyCode:88});
    await key('+','Equal',{text:'+',unmodifiedText:'=',modifiers:8,windowsVirtualKeyCode:187});
    await key('y','KeyY',{text:'y',unmodifiedText:'y',windowsVirtualKeyCode:89});
    await browser.waitFor("document.querySelector('math-field').value.includes('x')&&document.querySelector('math-field').value.includes('y')");
    formulaLatex=await browser.evaluate("document.querySelector('math-field').value");
    await clickText('插入公式','.mimir-modal');
    await browser.waitFor("!document.querySelector('.mimir-modal')&&document.querySelectorAll('.mimir-paper .tiptap [data-mimir-formula]').length==="+(before+1));
    const node=await browser.evaluate("(()=>{const n=[...document.querySelectorAll('.mimir-paper .tiptap [data-mimir-formula]')].at(-1);return{latex:n.getAttribute('data-latex'),id:n.getAttribute('data-formula-id')}})()");
    assert.equal(node.latex,formulaLatex); assert.match(node.id,/^[0-9a-f-]{36}$/);
    return {cancelKeptFormulaCount:true,realMathKeyboardInput:true,realInsertButton:true,latex:formulaLatex,structuredFormulaId:true};
  });
  if(await browser.evaluate("Boolean(document.querySelector('.mimir-modal'))")) await clickText('取消','.mimir-modal');
  await sample('editor-table-insert-edit-real-controls',async()=>{
    await click('.mimir-paper .tiptap'); await key('End','End',{modifiers:2,windowsVirtualKeyCode:35});
    const before=await browser.evaluate("document.querySelectorAll('.mimir-paper .tiptap table').length");
    await clickText('表格','.mimir-toolbar');
    await browser.waitFor("document.querySelectorAll('.mimir-paper .tiptap table').length==="+(before+1));
    await click('.mimir-paper .tiptap table:last-of-type tr:first-child th:first-child');
    await browser.send('Input.insertText',{text:markers.cell});
    await browser.waitFor(existsText('table th',markers.cell));
    const table=await browser.evaluate("(()=>{const n=[...document.querySelectorAll('.mimir-paper .tiptap table')].at(-1);return{rows:n.rows.length,columns:[...n.rows].map(r=>r.cells.length),headerCells:n.querySelectorAll('th').length,text:n.textContent}})()");
    assert.equal(table.rows,2); assert.deepEqual(table.columns,[2,2]); assert.equal(table.headerCells,2);
    return {...table,realToolbarClick:true,realCellTyping:true};
  });
  await sample('editor-rich-content-explicit-save-and-refresh',async()=>{
    await click('.mimir-save-button'); await browser.waitFor("document.querySelector('.mimir-status')?.textContent==='文稿已保存'",5000);
    await browser.send('Page.reload',{ignoreCache:true});
    await browser.waitFor("Boolean(document.querySelector('.mimir-product-nav'))",60000);
    if(!await browser.evaluate("Boolean(document.querySelector('.mimir-paper .tiptap')?.getBoundingClientRect().width)")) {
      await click('.mimir-product-nav button[aria-label="文稿"]');
      await browser.waitFor("Boolean(document.querySelector('.mimir-nav-document'))"); await click('.mimir-nav-document');
    }
    await browser.waitFor(existsText('h2',markers.heading),60000);
    await browser.waitFor(existsText('strong',markers.bold)); await browser.waitFor(existsText('em',markers.italic));
    await browser.waitFor(existsText('ul li',markers.list)); await browser.waitFor(existsText('table th',markers.cell));
    assert.ok(await browser.evaluate("[...document.querySelectorAll('.mimir-paper .tiptap [data-mimir-formula]')].some(n=>n.getAttribute('data-latex')==="+JSON.stringify(formulaLatex)+")"));
    return {explicitSaveStatus:'文稿已保存',actualPageReload:true,persistedNodes:['h2','strong','em','ul li','formula','2x2 table'],noBackendSubstitution:true};
  });
  await browser.evaluate("document.querySelector('.mimir-nav-tools')?.scrollIntoView({block:'center'})");
  await click('.mimir-nav-tools'); await browser.waitFor("Boolean(document.querySelector('.mimir-tools')?.getBoundingClientRect().width)&&!document.querySelector('.mimir-tools')?.closest('[hidden]')");
  await clickText('本地运行','.mimir-tool-tabs'); await browser.waitFor("Boolean(document.querySelector('.mimir-code-input'))");
  await sample('tool-long-output-real-wheel-scroll-first-last',async()=>{
    const code='print("UI-LONG-FIRST")\nfor n in range(120):\n    print("UI-LONG-LINE-%03d" % n)\nprint("UI-LONG-LAST")\n';
    await click('.mimir-code-input'); await key('a','KeyA',{modifiers:2,windowsVirtualKeyCode:65});
    await browser.send('Input.insertText',{text:code}); await browser.waitFor('document.querySelector(\".mimir-code-input\").value==='+JSON.stringify(code)); await delay(100); await clickText('运行脚本','.mimir-tool-body');
    await browser.waitFor("document.querySelector('.mimir-tool-result')?.textContent.includes('UI-LONG-LAST')",120000);
    const selector='.mimir-tool-result';
    await browser.evaluate("document.querySelector('.mimir-tool-result').scrollIntoView({block:'center'})");
    const before=await browser.evaluate("(()=>{const n=document.querySelector('.mimir-tool-result'),r=n.getBoundingClientRect();return{height:n.clientHeight,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop,overflowY:getComputedStyle(n).overflowY,containsFirst:n.textContent.includes('UI-LONG-FIRST'),containsLast:n.textContent.includes('UI-LONG-LAST'),lines:n.textContent.split('\\n').length,point:{x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2)}}})()");
    assert.ok(before.containsFirst&&before.containsLast); assert.ok(before.scrollHeight>before.height); assert.ok(['auto','scroll'].includes(before.overflowY));
    for(let i=0;i<8;i++){await browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:750,...before.point});await delay(50)}
    await browser.waitFor("(()=>{const n=document.querySelector('.mimir-tool-result');return n.scrollTop+n.clientHeight>=n.scrollHeight-2})()");
    const bottom=await browser.evaluate("(()=>{const n=document.querySelector('.mimir-tool-result');return{scrollTop:n.scrollTop,atEnd:n.scrollTop+n.clientHeight>=n.scrollHeight-2}})()");
    for(let i=0;i<8;i++){await browser.send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,deltaY:-750,...before.point});await delay(50)}
    await browser.waitFor("document.querySelector('.mimir-tool-result').scrollTop===0");
    return {...before,point:undefined,bottom,realMouseWheel:true,returnedToStart:true};
  });
  await browser.evaluate("document.querySelector('.mimir-product-nav button[aria-label=\"论文\"]')?.scrollIntoView({block:'center'})");
  await click('.mimir-product-nav button[aria-label="论文"]');
  await browser.waitFor("Boolean(document.querySelector('.mimir-reading-panel iframe')?.src)");
  const paperUrl=await browser.evaluate("document.querySelector('.mimir-reading-panel iframe').src");
  assert.equal(new URL(paperUrl).hostname,'127.0.0.1');
  await browser.send('Page.navigate',{url:paperUrl}); await browser.waitFor("Boolean(document.querySelector('#import-file'))");
  await sample('paper-import-synthetic-pdf-real-file-control',async()=>{
    const path=join(home,'UI-PAPER-SYNTHETIC.pdf'); writeFileSync(path,longPaperFixture(1,'ui-paper-delete-capability'));
    const doc=await browser.send('DOM.getDocument'), input=await browser.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#import-file'});
    await browser.send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path]});
    await browser.waitFor("!document.querySelector('#page-surface').hidden&&document.querySelector('#text-layer').textContent.includes('ui-paper-delete-capability')",60000);
    await click('#library-toggle'); await browser.waitFor("!document.querySelector('#paper-library').hidden&&document.querySelectorAll('#paper-list .paper-item').length===1");
    return {realFileInput:true,syntheticPages:1,actualPDFCanvas:await browser.evaluate("document.querySelector('#canvas').width>0"),libraryCount:1};
  });
  const paperControls=await browser.evaluate("[...document.querySelectorAll('button')].filter(n=>!n.closest('[hidden]')&&n.getBoundingClientRect().width).map(n=>({text:n.textContent.trim().slice(0,80),aria:n.getAttribute('aria-label')}))");
  const deletionControls=paperControls.filter(n=>/删除论文|移除论文|彻底删除论文|删除文件|移除文件/.test(n.text+' '+n.aria));
  report.paperDeletion={available:deletionControls.length>0,actualConfirmCancelVerified:false,passed:null,observedVisibleControls:paperControls,
    reason:deletionControls.length?'Existing whole-paper delete control needs verification.':'The current reader offers tab close, rename, and parse controls; it has no whole-paper or source-file delete UI. Closing a tab retains local paper data.'};
  assert.equal(deletionControls.length,0,'An existing deletion control must be exercised instead of marked unavailable.');
  await snapshot('paper-delete-capability-observed');
  assert.equal(report.requests.filter(row=>/\/ai\/(assist|suggest|generate)/.test(row.path)).length,0);
  assert.deepEqual(report.browserExceptions,[]);
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
  report.passed = !report.failure && report.checks.length === 9 && report.checks.every(row => row.passed) && report.browserExceptions.length === 0 && report.cleanup.browserStopped && report.cleanup.nativeHostStopped && !report.cleanup.browserCloseFailed && !report.cleanup.hostCloseFailed && !report.cleanup.credentialRemovalFailed
  report.completedAt = new Date().toISOString(); save()
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, paperDeletionAvailable: report.paperDeletion?.available ?? null, paidModelCalls: 0 }))
  if (!report.passed) process.exitCode = 1
}
