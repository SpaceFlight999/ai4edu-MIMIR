// Native host, PDF parser and browser; all model responses use a local synthetic provider.
import {createServer} from 'node:http';
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { connectBrowser } from './cdp.mjs'
import { syntheticPdf } from './prompt4-browser.mjs'

const root = resolve('.'), home = join(root, '.test-data', 'prompt10-ui-' + randomUUID())
mkdirSync(home, { recursive: true })
let host, edge, browser, instance, output = '', browserPort
const checks = [], errors = [], layouts = []
const delay = ms => new Promise(done => setTimeout(done, ms))
let synthesisAttempts=0,modelDelay=1200;
const modelCalls=[];
const provider=createServer(async(req,res)=>{
  try{
    let raw='';for await(const bytes of req)raw+=bytes;
    const body=JSON.parse(raw),text=(body.messages??[]).flatMap(row=>row.content??[]).map(row=>row.text??'').join('\n');
    const payload=(body.messages??[]).flatMap(row=>row.content??[]).flatMap(row=>{try{return [JSON.parse(row.text)];}catch{return [];}}).find(row=>row.stage);
    modelCalls.push({stage:payload?.stage??'guide',level:payload?.outputConstraints?.level??0});
    await delay(modelDelay);
    let value={},truncated=false;
    const original=text.match(/原文：(\[[\s\S]*\])$/),review=text.match(/论点：(\[[\s\S]*\])$/);
    if(original){const e=JSON.parse(original[1])[0];value={claims:['研究问题','数据','方法','训练','评价','设备'].map(topic=>({topic,kind:'系统解释',text:'为了理解'+topic+'，可进一步核对原文的输入、预测与观察。',evidence:[{evidenceId:e.evidenceId,quote:e.quote.slice(0,180)}]}))};}
    if(review)value={checks:JSON.parse(review[1]).map(row=>({id:row.id,supported:false,missingDetails:['合成验收'],reason:'用于验证界面与保存路径，内容需要核对。'}))};
    if(payload){const rows=payload.context,refs=rows.map(row=>row.evidence[0].citationId),statement={text:'可进一步比较相同输入下的预测与观察，并记录适用条件。',kind:'model_inference',evidenceIds:refs};
      if(payload.stage==='analysis')value={papers:rows.map(p=>({paperId:p.paperId,claims:[{...statement,evidenceIds:[p.evidence[0].citationId]}],methods:[],limitations:[],criticalQuestions:[],conditions:Object.fromEntries(['dataset','metric','protocol'].map(key=>[key,{value:null,evidenceIds:[]}]))})),readRequests:[]};
      if(payload.stage==='synthesis'){synthesisAttempts++;truncated=synthesisAttempts<=3;value={comparisons:[],gaps:[{text:'当前引文尚不足以确认外推性能。',kind:'unknown',evidenceIds:[]}],draft:[statement]};}
      if(payload.stage==='review')value={issues:[],semanticAssessments:[]};
    }
    res.writeHead(200,{'content-type':'text/event-stream'});
    const emit=value=>res.write('event: '+value.type+'\ndata: '+JSON.stringify(value)+'\n\n');
    emit({type:'message_start',message:{id:'fixture',type:'message',role:'assistant',model:body.model,content:[],usage:{input_tokens:20,output_tokens:0}}});
    emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});
    emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:truncated?'{"draft":[':JSON.stringify(value)}});
    emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:truncated?'max_tokens':'end_turn'},usage:{output_tokens:30}});emit({type:'message_stop'});res.end();
  }catch(e){errors.push(e.message);if(!res.headersSent)res.writeHead(500);res.end();}
});
async function input(selector,value){
  await browser.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),proto=node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}))})()`);
}
async function paperApi(op,args={}){return browser.evaluate(`fetch(new URL('api/'+${JSON.stringify(op)},location.href),{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Guide':'1'},body:JSON.stringify(${JSON.stringify(args)})}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.message);return value})`);}
async function screenshot(name){const shot=await browser.send('Page.captureScreenshot',{format:'png'});writeFileSync('artifacts/prompt10-'+name+'.png',Buffer.from(shot.data,'base64'));}
async function selectOriginal(){
  const quote=await browser.evaluate("(()=>{const spans=[...document.querySelectorAll('#text-layer span')].filter(n=>n.textContent.trim()),range=document.createRange();range.setStart(spans[0].firstChild,0);range.setEnd(spans.at(-1).firstChild,spans.at(-1).textContent.length);const selected=getSelection();selected.removeAllRanges();selected.addRange(range);document.querySelector('#text-layer').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return selected.toString()})()");
  assert.ok(quote.length>140);await browser.waitFor("!document.querySelector('#selection-tools').hidden");return quote;
}
async function runResultScenarios(){
  await click('#generate');
  await browser.waitFor("!document.querySelector('#thinking-panel').hidden&&document.querySelector('.thinking-time').textContent.includes('已经思考')");
  await delay(1100);assert.ok(await browser.evaluate("document.querySelector('.thinking-time').textContent.match(/[1-9]\\d* 秒/)!==null"));
  await screenshot('thinking');
  await browser.waitFor("document.querySelectorAll('#guide-result .claim').length===6&&document.querySelector('#thinking-panel').hidden",30000);
  assert.equal(await browser.evaluate("[...document.querySelectorAll('#guide-result details')].every(n=>!n.open)"),true);
  assert.equal(await browser.evaluate("document.querySelector('#guide-result .result-titles').children.length"),4);
  await click('#guide-result .title-overflow>summary');
  await click('#guide-result .title-overflow .result-title-link:last-child');
  assert.equal(await browser.evaluate("document.querySelector('#guide-result .reader-disclosure').open"),true);
  assert.equal(await browser.evaluate("document.activeElement.textContent.includes('设备')"),true);
  await click('#guide-result .compact-metadata>summary');
  assert.equal(await browser.evaluate("document.querySelector('#guide-result .compact-metadata').open"),true);
  for(const id of ['argument-map','reproduction']){
    assert.ok(await browser.evaluate(`document.querySelectorAll('#${id}-titles .result-title-link').length>=6`));
    assert.ok(await browser.evaluate(`document.querySelectorAll('#${id} .claim button').length>=6`));
  }
  checks.push('Guide metadata and details are collapsed; title preview expands and jumps; evidence map and reproduction include navigable headings and workbench buttons.');

  const answerQuote=await selectOriginal();await click('#ask-selection');await input('#question','解释该研究的方法与条件。');await click('#ask-button');
  await browser.waitFor("!document.querySelector('#thinking-panel').hidden");
  assert.equal(await browser.evaluate("document.querySelector('.thinking-time').compareDocumentPosition(document.querySelector('.thinking-task small'))&Node.DOCUMENT_POSITION_FOLLOWING"),4);
  await browser.waitFor("document.querySelectorAll('#answers .claim').length===6&&document.querySelector('#thinking-panel').hidden",30000);
  assert.equal(await browser.evaluate("document.querySelector('#answers .compact-metadata').open"),false);
  assert.equal(await browser.evaluate(`document.querySelector('#answers .compact-metadata').textContent.includes(${JSON.stringify(answerQuote)})`),true);
  await click('#answers .title-overflow>summary');await click('#answers .title-overflow .result-title-link:last-child');
  assert.equal(await browser.evaluate("document.activeElement.textContent.includes('设备')"),true);
  checks.push('Question uses the shared region with elapsed time before processing status, collapsed metadata and functional title navigation.');

  const noteQuote=await selectOriginal();await click('#annotate-selection');
  assert.equal(await browser.evaluate("Boolean(document.querySelector('#note-tags,#note-filter'))"),false);
  assert.equal(await browser.evaluate("document.querySelector('#note-anchor-details').open"),false);
  assert.equal(await browser.evaluate(`document.querySelector('#note-anchor').textContent.includes(${JSON.stringify(noteQuote)})`),true);
  await input('#note-title','我的方法观察');await input('#note-text','输入与结果需要在相同条件下进行对照。');await click('#note-save');
  await browser.waitFor("document.querySelector('#note-list details>summary')?.textContent==='我的方法观察'");
  assert.equal(await browser.evaluate("document.querySelector('#note-list details').open"),false);
  await click('#note-list details>summary');await click('#note-list .compact-metadata>summary');
  assert.equal(await browser.evaluate(`document.querySelector('#note-list .compact-metadata').textContent.includes(${JSON.stringify(noteQuote)})`),true);
  await browser.send('Page.reload');await browser.waitFor("Boolean(document.querySelector('#selection-tools'))&&document.querySelectorAll('.paper-tab').length===1");
  await click('[data-tab=notes]');await browser.waitFor("document.querySelector('#note-list details>summary')?.textContent==='我的方法观察'");
  checks.push('Annotation title replaces filter/tags, saves durably, labels the collapsed note and retains expandable provenance after reload.');

  await click('#tools-enabled');await click('[data-tab=research]');await browser.waitFor("Boolean(document.querySelector('.research-paper-choice[aria-disabled=false]'))");await click('.research-paper-choice');await input('#research-question','给出有证据支持的精简分析与应用条件。');await click('#research-start');
  await browser.waitFor("!document.querySelector('#thinking-panel').hidden");
  await browser.waitFor("!document.querySelector('#research-publish').disabled&&document.querySelector('#thinking-panel').hidden",60000);
  assert.equal(synthesisAttempts,4);
  assert.deepEqual(modelCalls.filter(row=>row.stage==='synthesis').map(row=>row.level),[0,1,2,3]);
  assert.equal(await browser.evaluate("[...document.querySelectorAll('#research-result details')].every(node=>!node.open)"),true);
  await click('#research-result .result-title-link');
  assert.equal(await browser.evaluate("[...document.querySelectorAll('#research-result details')].find(n=>n.querySelector('summary')?.textContent==='综合写作草稿').open"),true);
  await screenshot('results');
  browser.on(event=>{if(event.method==='Page.javascriptDialogOpening')void browser.send('Page.handleJavaScriptDialog',{accept:true});});
  await click('#research-publish');
  await browser.waitFor("document.querySelector('#status').textContent.includes('已导入到工作台')",15000);
  const review=await connectBrowser(browserPort);
  try{
    await review.send('Page.navigate',{url:instance.url});await review.waitFor("Boolean(document.querySelector('.mg-wordmark-light'))");
    const proposals=await review.evaluate("fetch('/api/mimir/document/proposals').then(r=>r.json()).then(r=>r.data)");
    const proposal=proposals.find(row=>row.reason?.includes('研究运行层草稿'));
    assert.ok(proposal);assert.ok(proposal.evidenceIds.length>0);
    const appended=proposal.operations.map(op=>op.after.slice(op.before.length)).join('\n');
    assert.match(appended,/预测与观察/);assert.doesNotMatch(appended,/生成时间|任务 [a-z0-9-]+|原文引文|SHA-256|覆盖范围|研究笔记|Semantic support|paper-[a-z0-9]+/i);
  }finally{await review.close();}
  checks.push('Research survives three real transport truncations via progressive recursive reduction; draft disclosure/navigation works and clean prose can be submitted to workbench suggestions.');
}
async function runAllImportScenarios(){
  const sent=[];
  async function send(label,scope){
    const clicked=await browser.evaluate(`(()=>{document.querySelector('#status').textContent='';const button=[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(n=>n.textContent.trim()==='送到工作台'&&!n.disabled);button?.click();return Boolean(button)})()`);
    assert.equal(clicked,true,label+' import button missing');
    await browser.waitFor("document.querySelector('#status').textContent.includes('建议已提交')");sent.push(label);
  }
  await click('[data-tab=guide]');await click('#guide-result .result-title-link');await send('导读','#guide-result');
  await click('[data-tab=ask]');await click('#answers .result-title-link');await send('提问','#answers');
  await click('[data-tab=guide]');await click('#argument-map-titles .result-title-link');await send('证据地图','#argument-map');
  await click('#reproduction-titles .result-title-link');await send('复现准备清单','#reproduction');
  if(await browser.evaluate("document.querySelector('#paper-library').hidden"))await click('#library-toggle');
  await send('原文证据','#evidence-list');

  // Direct callers cannot bypass the common formatter by including raw metadata.
  const paper=(await paperApi('papers')).find(row=>row.title==='合成论文 A.pdf');
  const evidence=(await paperApi('evidence',{paperId:paper.paperId,query:'',offset:0})).items[0];
  const target=await paperApi('workbench-target',{paperId:paper.paperId});
  const args={paperId:paper.paperId,evidenceIds:[evidence.evidenceId],text:'生成时间：2026-10-16T13:09:43.776Z\n规范导入：比较预测与观察，结论仅限本次条件。\n来源：合成论文 A.pdf · PDF 第 1 页 · SHA-256 '+'a'.repeat(64)+' · 证据 5be5783e-7717-49f5-8660-5c2e5813efa7',expectedVersion:target.expectedVersion,requestId:randomUUID(),idempotencyKey:randomUUID()};
  const direct=await paperApi('workbench-propose',args),again=await paperApi('workbench-propose',args);
  assert.equal(direct.changeSetId,again.changeSetId);
  const review=await connectBrowser(browserPort);
  try{
    await review.send('Page.navigate',{url:instance.url});await review.waitFor("Boolean(document.querySelector('.mg-wordmark-light'))");
    const proposals=await review.evaluate("fetch('/api/mimir/document/proposals').then(r=>r.json()).then(r=>r.data)");
    assert.equal(proposals.length,7);assert.ok(proposals.every(row=>row.evidenceIds.length>0));
    for(const row of proposals){
      const added=row.operations.map(op=>op.after.slice(op.before.length)).join('\n');
      assert.doesNotMatch(added,/生成时间|草稿生成时间|SHA-256|证据 [a-f\d]{8}-/i);
      if(!row.reason?.includes('研究运行层草稿')){assert.match(added,/原文引文：/);assert.match(added,/来源：合成论文 A.pdf · PDF 第 1 页/);}
    }
    const saved=await review.evaluate(`(async()=>{const post=async(path,body)=>{const r=await fetch('/api/mimir/document/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const value=await r.json();if(!value.ok)throw Error(value.error.message);return value.data;};const grant=await post('authorize',{changeSetId:${JSON.stringify(direct.changeSetId)}});await post('apply',{changeSetId:${JSON.stringify(direct.changeSetId)},grantId:grant.grantId,expectedVersion:${target.expectedVersion},requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()});return fetch('/api/mimir/document').then(r=>r.json()).then(r=>r.data)})()`);
    assert.equal(saved.version,target.expectedVersion+1);
    const text=JSON.stringify(saved.content);assert.match(text,/规范导入/);assert.doesNotMatch(text,/生成时间|SHA-256|5be5783e-7717/);
  }finally{await review.close();}
  checks.push('Program A is enforced for guide, answer, map, reproduction, original evidence and research imports; direct API replay stays idempotent, all seven stored proposals are clean and applying a proposal retains readable sources.');
  console.log(JSON.stringify({sharedImports:sent.length+1,storedProposals:7,appliedDocument:true}));
}
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
  await new Promise(done=>provider.listen(0,'127.0.0.1',done));mkdirSync(join(home,'profiles/web'),{recursive:true});writeFileSync(join(home,'profiles/web/cordis.patch.yml'),'- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: off\n- id: llm-deepseek\n  config:\n    baseURL: http://127.0.0.1:'+provider.address().port+'\n    thinking: disabled\n    retryPolicy:\n      mode: normal\n      maxRetries: 0\n');
  host = spawn(process.execPath, ['runtime/system/app/app.mjs', '--data-home', home], { cwd: root, windowsHide: true, env: { ...process.env, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'] })
  host.stdin.end(JSON.stringify({apiKey:'synthetic-prompt10-key'}))
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
  const opened = await browser.evaluate("fetch('/api/paper-guide/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rpcId:'prompt10-ui'})}).then(r=>r.json())")
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
      writeFileSync(`artifacts/prompt10-reader-${width}.png`, Buffer.from(shot.data, 'base64'))
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
  await runResultScenarios();
  await runAllImportScenarios();
  assert.deepEqual(errors, [])
  writeFileSync('artifacts/prompt10-ui.json', JSON.stringify({ passed: true, checks, layouts, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, viewports: layouts.map(({ width, height, view }) => ({ width, height, readingHeight: view.height })) }))
} catch (error) {
  const state = await browser?.evaluate("({status:document.querySelector('#status')?.textContent,title:document.title,research:document.querySelector('#research-status')?.textContent,researchErrors:[...document.querySelectorAll('.research-error')].filter(n=>!n.hidden).map(n=>n.textContent),paperChoices:[...document.querySelectorAll('.research-paper-choice')].map(n=>({ready:n.getAttribute('aria-disabled'),selected:n.getAttribute('aria-pressed')})),body:document.body.innerText.slice(-1400)})").catch(() => null)
  writeFileSync('artifacts/prompt10-ui.json', JSON.stringify({ passed: false, error: error.stack, checks, layouts, errors, state }, null, 2))
  console.error(error.stack)
  if (!instance) console.error(output)
  process.exitCode = 1
} finally {
  if (browser) { await browser.send('Browser.close').catch(() => {}); await browser.close().catch(() => {}) }
  if (instance) await fetch(`http://127.0.0.1:${instance.controlPort}/exit`, { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  const until = Date.now() + 8000
  while ((host?.exitCode === null || edge?.exitCode === null) && Date.now() < until) await delay(100)
  provider.closeAllConnections();await new Promise(done=>provider.close(done));
  if (host?.exitCode === null || edge?.exitCode === null) { console.error('Owned fixture process did not exit normally.'); process.exitCode = 1 }
}
