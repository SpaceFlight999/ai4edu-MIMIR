// Replay the native chat fixture plus directory operations, with its own UUID home and browser.
import {spawn} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,createHash} from 'node:crypto'
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8),inventory=join(project,'.test-data/session-management',runId),runner=join(inventory,'runner')
mkdirSync(join(runner,'scripts'),{recursive:true});mkdirSync(join(runner,'artifacts'),{recursive:true})
for(const name of ['runtime','growth'])symlinkSync(join(project,name),join(runner,name),'junction')
for(const name of ['cdp.mjs','research-chat-driver.mjs','session-management-followup.mjs'])writeFileSync(join(runner,'scripts',name),readFileSync(join(project,'scripts',name)))
let source=readFileSync(join(project,'scripts/verify-research-chat.mjs'),'utf8')
const originalHash=createHash('sha256').update(source).digest('hex')
source="import {runSessionManagement} from './session-management-followup.mjs';\n"+source
source=source.replace('const report={passed:false,','const report={checks:[],passed:false,')
const anchor="assert.equal(await readNewResearchReply(browser,previousReplies,30000),reply);assert.ok(calls.length>0);"
if(!source.includes(anchor))throw new Error('Original local chat fixture changed; review injection before replay')
source=source.replace(anchor,`assert.equal(await readNewResearchReply(browser,previousReplies,30000),reply);assert.ok(calls.length>0);
  await runSessionManagement({browser,reply,checks:report.checks,restart:async()=>{
    await fetch('http://127.0.0.1:'+instance.controlPort+'/exit',{method:'POST',headers:{'X-Mimir-Control':instance.controlToken},signal:AbortSignal.timeout(5000)});
    await wait(()=>!existsSync(join(home,'instance.json'))&&host.exitCode!==null,10000);
    host=spawn(join(project,'runtime/system/node/node.exe'),[join(project,'runtime/system/app/app.mjs'),'--data-home',home],{cwd:project,windowsHide:true,env,stdio:['pipe','pipe','pipe']});host.stdin.end(JSON.stringify({apiKey:'synthetic-local-chat-key'}));
    for(const stream of [host.stdout,host.stderr])stream.on('data',bytes=>{log+=bytes;writeFileSync(join(home,'native.log'),log)});
    await wait(()=>existsSync(join(home,'instance.json')));instance=JSON.parse(readFileSync(join(home,'instance.json'),'utf8'));
    await browser.send('Page.bringToFront');await browser.send('Page.navigate',{url:instance.url});
  }});`)
source=source.replace('markup:await browser?.evaluate(',"directory:await browser?.evaluate('[...document.querySelectorAll(\".mimir-session-row\")].map(row=>row.outerHTML)').catch(()=>null),markup:await browser?.evaluate(")
writeFileSync(join(runner,'scripts/verify-research-chat.mjs'),source)
writeFileSync(join(inventory,'source-adaptations.json'),JSON.stringify({originalHash,adaptations:['append existing UI session-management controls after local chat','restart only owned native host through control endpoint'],uiModified:false},null,2))
const env={...process.env,NODE_ENV:'test'};for(const key of Object.keys(env))if(/(?:api.?key|token|secret|password)/i.test(key))delete env[key]
const child=spawn(join(project,'runtime/system/node/node.exe'),[join(runner,'scripts/verify-research-chat.mjs')],{cwd:runner,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;writeFileSync(join(inventory,'runner.log'),output)})
const code=await new Promise(resolve=>child.once('exit',resolve))
const report=JSON.parse(readFileSync(join(runner,'artifacts/research-chat-fixture-20261010.json'),'utf8'))
const summary={runId,at:new Date().toISOString(),...report,exitCode:code,syntheticFilesOnly:true,realDataRead:false,paidModelCalls:0,uiModified:false}
writeFileSync(join(inventory,'summary.json'),JSON.stringify(summary,null,2));writeFileSync(join(project,'.test-data/session-management/latest-summary.json'),JSON.stringify({...summary,inventory},null,2))
console.log((code===0&&report.passed?'PASS':'FAIL')+' session management ('+report.checks.length+' groups)')
if(code!==0||!report.passed)process.exitCode=1
