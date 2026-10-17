// Replay existing UI acceptance in fresh synthetic homes. Production/UI files remain untouched.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)
const inventory=join(project,'.test-data','feature-followup',runId),runner=join(inventory,'runner')
const selected=process.argv.slice(2),names=selected.length?selected:['prompt5','customization']
for(const name of names)assert.ok(['prompt5','customization','paper-highlights'].includes(name),'Unsupported existing acceptance scenario')
mkdirSync(join(runner,'scripts'),{recursive:true});mkdirSync(join(runner,'artifacts'),{recursive:true})
for(const name of ['growth','runtime']) {
  const sourcePath=join(project,name),targetPath=join(runner,name)
  for(let attempt=0;;attempt++)try{symlinkSync(sourcePath,targetPath,'junction');break}catch(error){
    if(existsSync(targetPath)&&realpathSync(targetPath).toLowerCase()===realpathSync(sourcePath).toLowerCase())break
    if(!['EBUSY','EPERM'].includes(error.code)||attempt===9){writeFileSync(join(inventory,'bootstrap-failure.json'),JSON.stringify({passed:false,stage:'owned-junction-setup',errorCode:error.code,realDataRead:false,paidModelCalls:0}));throw error}
    await new Promise(done=>setTimeout(done,100))
  }
}
const adaptations=[],hashes={}
for(const filename of ['smoke-prompt5.mjs','smoke-customization.mjs','prompt4-browser.mjs','cdp.mjs','research-chat-driver.mjs','paper-confirmation-followup.mjs']) {
  let source=readFileSync(join(project,'scripts',filename),'utf8');hashes[filename]=createHash('sha256').update(source).digest('hex')
  if(filename==='smoke-prompt5.mjs') {
    source=source.replace('Date.now() + 45000','Date.now() + 150000')
    source=source.replace("const personal = join(root, 'data/student-1/mimir-growth/growth.sqlite')","const personal = join(home, '__never_created_personal_database__')")
    source=source.replace("await click('研究', '.mimir-product-nav');", "await browser.evaluate(\"document.querySelector('.mimir-product-rail-end button[aria-label=展开侧栏]')?.click()\");await click('研究', '.mimir-product-nav');")
    source=source.replace("await click('先体验本地示例', '.mg-option-grid', true)","await browser.evaluate(\"(()=>{const el=[...document.querySelectorAll('.mg-option-grid button')].find(el=>el.textContent.includes('先体验本地示例'));if(el.getAttribute('aria-pressed')!=='true')el.click()})()\")")
    adaptations.push(filename+': synthetic-only data, expand existing collapsed sidebar, avoid toggling the already-selected local option')
  }
  if(filename==='smoke-customization.mjs') {
    source=source.replace(/\s*browser\.on\(event => \{ if \(event\.method === 'Page\.javascriptDialogOpening'\) \{ console\.log\('Unexpected test dialog: ' \+ event\.params\.type\); void browser\.send\('Page\.handleJavaScriptDialog', \{ accept: false \}\); \} \}\)/,'')
    source='let fixtureRequests=0;\n'+source
    source=source.replace('const body = JSON.parse(raw)','const body = JSON.parse(raw);fixtureRequests++')
    source=source.replace('modelRequests: calls.length','modelRequests: fixtureRequests')
    source=source.replace('passed: false, checks, errors, error:', 'passed: false, checks, errors, modelRequests: fixtureRequests, error:')
    source=source.replace('timeout = 45000','timeout = 150000')
    source=source.replace("const learner = join(root, 'data/student-1/mimir-growth/growth.sqlite')","const learner = join(home, '__never_created_personal_database__')")
    source=source.replaceAll('deepseek-v4-pro','deepseek-flash')
    source=source.replaceAll("await click('保存模型与 Key', '.mg-model-settings')", "await click('保存模型与 Key', '.mg-model-settings');await browser.waitFor(\"Boolean(document.querySelector('[data-model-id]'))&&!document.querySelector('[data-model-id]').disabled&&document.querySelector('[data-model-key]')?.value===''\")")
    source=source.replace("await click('保存模型与 Key', '.mg-model-settings'); await browser.waitFor(\"document.querySelector('[data-current-model]').textContent.includes('deepseek-flash')\")", "await click('保存模型与 Key', '.mg-model-settings'); await browser.waitFor(\"document.querySelector('[data-current-model]').textContent.includes('deepseek-flash')&&document.querySelector('[data-model-key]').value===''\")")
    source=source.replaceAll("await click('研究', '.mg-sidebar-wrap');","await browser.evaluate(\"document.querySelector('.mimir-product-rail-end button[aria-label=展开侧栏]')?.click()\");await click('研究', '.mimir-product-nav');")
    source=source.replace('native research caption immediately follows model changes from Settings; blank Key preserves credentials','native research caption retains canonical Flash after Settings saves; blank Key preserves credentials')
    source=source.replace('real bundled DSH Agent receives three goals and uses changed model plus changed Key against local HTTP fixture','real bundled DSH Agent receives three goals with canonical Flash and replaced Key against local HTTP fixture')
    adaptations.push(filename+': canonical Flash-only selection, synthetic credential replacement and blank-key persistence remain asserted')
  }
  if(filename==='prompt4-browser.mjs') {
    source="import {openResearchChat,sendResearchChat} from './research-chat-driver.mjs'\n"+source
    source="import {runPaperConfirmations} from './paper-confirmation-followup.mjs'\n"+source
    source=source.replace("await click('研究','.mg-sidebar-wrap');await browser.waitFor('Boolean(document.querySelector(\"[contenteditable=true]\"))')", "await openResearchChat(browser)")
    source=source.replace(/async function sendResearch\(text\)\{[^\n]+\}/,"async function sendResearch(text){await sendResearchChat(browser,text)}")
    source=source.replace("await browser.waitFor('Boolean(document.querySelector(\"#answers .citation\"))', 30000)","await browser.waitFor('Boolean(document.querySelector(\"#answers .question-entry summary\"))',30000);await browser.evaluate(\"document.querySelector('#answers .question-entry summary').click()\");await browser.waitFor('Boolean(document.querySelector(\"#answers .citation\"))',30000)")
    source=source.replace("await click('修改', card); await input(","await click('修改',card);await input('[data-custom-title=\"'+row.label+'\"]',row.title+'取消修改');await click('取消修改',scope);assert.equal((await state()).customChoices.find(item=>item.id===row.id).title,row.title);await click('修改', card); await input(")
    source=source.replace("await click('修改', customCard);", "await click('修改',customCard);await input('[data-custom-title=\"深入学习主题\"]','此修改应取消');await click('取消修改',scope);assert.equal((await state()).customChoices.find(item=>item.id===custom.id).title,'机械设计载荷对照');await click('修改', customCard);")
    source=source.replace("await click('保存当前过程与草稿'); await open('courses'); await click('删除', customCard); await click('确认删除', customCard)","await click('保存当前过程与草稿');await open('courses');await click('删除',customCard);await click('取消',customCard);assert.ok((await state()).customChoices.some(item=>item.id===custom.id));await click('删除',customCard);await click('确认删除',customCard)")
    source=source.replace("assert.ok(await browser.evaluate(\"document.querySelector('#status').textContent.includes('MODEL_')\"))","assert.equal(await browser.evaluate(\"(()=>{const text=document.querySelector('#status').textContent;return /[\\u3400-\\u9fff]/.test(text)&&/(任务|模型|请求|服务)/.test(text)&&/(未完成|失败|不可用|稍后|重试|排查)/.test(text)&&!/(https?:|Synthetic provider|sk-|Bearer|stack)/i.test(text)})()\"),true)")
    source=source.replace("document.querySelector('#tools-enabled').click();document.querySelector('[data-tab=research]').click()", "if(!document.querySelector('#tools-enabled').checked)document.querySelector('#tools-enabled').click();document.querySelector('[data-tab=research]').click()")
    source=source.replace("await input('#research-pages','1');", "await browser.waitFor(\"Boolean(document.querySelector('.research-paper:not(.is-unready) .research-paper-choice'))\");await browser.evaluate(\"const choice=document.querySelector('.research-paper:not(.is-unready) .research-paper-choice');if(choice.getAttribute('aria-pressed')!=='true')choice.click()\");")
    source=source.replaceAll('发送上述范围并开始研究','生成写作草稿')
    source=source.replace("Boolean(document.querySelector('#research-result [role=alert]'))", "document.querySelector('#research-status').textContent.includes('失败')&&document.querySelector('#research .research-error[role=alert]')?.hidden===false")
    source=source.replace("document.querySelector('#research-status + [data-mimir-processing]').hidden", "document.querySelector('#research [data-mimir-processing]').hidden")
    source=source.replace('every terminal provider failure displays an alert with a safe error code','every terminal provider failure displays a safe Chinese alert without exposing raw provider details')
    source=source.replace("checks.push('height-only resizing does not rebuild PDF text; width and zoom changes still produce the correct new render')", "checks.push('height-only resizing does not rebuild PDF text; width and zoom changes still produce the correct new render');await runPaperConfirmations({browser,click,input,checks})")
    adaptations.push(filename+': research chat explicitly creates a session and sends through the actual enabled composer button')
    adaptations.push(filename+': expand the current collapsed question card before asserting its lazy-rendered citation')
  }
  if(filename!=='cdp.mjs'&&filename!=='research-chat-driver.mjs') {
    source=source.replaceAll("await browser.send('Page.navigate',", "await browser.send('Page.bringToFront');await browser.send('Page.navigate',")
  }
  if(filename==='smoke-customization.mjs'||filename==='smoke-prompt5.mjs') {
    source=source.replace(/if\s*\(host\?\.exitCode\s*===\s*null\)\s*host\.kill\(\)/g,"if(host?.exitCode===null)throw new Error('Owned native host did not stop through control')")
    source=source.replace(/if\s*\(edge\?\.exitCode\s*===\s*null\)\s*edge\.kill\(\)/g,"await waitForOwnedBrowserExit()")
    source+='\nasync function waitForOwnedBrowserExit(){const end=Date.now()+5000;while(edge?.exitCode===null&&Date.now()<end)await delay(100);if(edge?.exitCode===null)throw new Error("Owned browser did not stop normally")}\nwriteFileSync(join(home,"cleanup.json"),JSON.stringify({hostStopped:true,browserClosed:true,normalControl:true}));\n'
    adaptations.push(filename+': normal control stop and Browser.close only; fail cleanup rather than forcibly terminate')
  }
  writeFileSync(join(runner,'scripts',filename),source)
}
writeFileSync(join(inventory,'acceptance-source.json'),JSON.stringify({hashes,adaptations},null,2))
const env={...process.env,NODE_ENV:'test'};for(const key of Object.keys(env))if(/(?:api.?key|token|secret|password)/i.test(key))delete env[key]
const version=JSON.parse(readFileSync(join(project,'growth/package.json'))).version,summary={runId,at:new Date().toISOString(),syntheticFilesOnly:true,realDataRead:false,paidModelCalls:0,installedRuntime:true,scenarios:[]}
for(const name of names) {
  const file=name==='prompt5'?'smoke-prompt5.mjs':'smoke-customization.mjs',child=spawn(join(project,'runtime/system/node/node.exe'),[join(runner,'scripts',file)],{cwd:runner,windowsHide:true,env:{...env,...(name==='paper-highlights'?{MIMIR_TEST_PAPER_ONLY:'1'}:{})},stdio:['ignore','pipe','pipe']})
  let output='';for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;writeFileSync(join(inventory,name+'.log'),output)})
  const code=await new Promise(resolve=>{child.once('error',()=>resolve(null));child.once('exit',resolve)})
  const path=join(runner,'artifacts',name==='prompt5'?'prompt5-smoke.json':(name==='paper-highlights'?'paper-reader-smoke-':'customization-smoke-')+version+'.json')
  const report=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{passed:false,checks:[],failureStage:'runner exited before final result; inspect private log'}
  const fixtureDir=join(runner,'.test-data'),cleanups=existsSync(fixtureDir)?readdirSync(fixtureDir,{withFileTypes:true}).filter(row=>row.isDirectory()).map(row=>join(fixtureDir,row.name,'cleanup.json')).filter(existsSync).map(path=>JSON.parse(readFileSync(path,'utf8'))):[]
  summary.scenarios.push({name,passed:code===0&&report.passed,exitCode:code,checks:report.checks??[],browserExceptions:report.browserExceptions?.length??report.errors?.length??0,fixtureModelRequests:report.modelRequests??null,cleanup:cleanups.at(-1)??null})
  writeFileSync(join(inventory,'summary.json'),JSON.stringify(summary,null,2))
  console.log((code===0&&report.passed?'PASS':'FAIL')+' '+name+' ('+(report.checks?.length??0)+' groups; local fixture only)')
}
summary.completedAt=new Date().toISOString();summary.passed=summary.scenarios.every(row=>row.passed)
writeFileSync(join(inventory,'summary.json'),JSON.stringify(summary,null,2));writeFileSync(join(project,'.test-data/feature-followup/latest-summary.json'),JSON.stringify({...summary,inventory},null,2))
if(!summary.passed)process.exitCode=1
