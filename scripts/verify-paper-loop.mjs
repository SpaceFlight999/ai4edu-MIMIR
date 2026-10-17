// Re-run the original PDF acceptance with local-only replies and private fixtures.
// The UI and installed runtime remain untouched; only the copied acceptance adapts.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
const inventory=join(project,'.test-data','paper-integration',runId),runner=join(inventory,'runner');
mkdirSync(join(runner,'scripts'),{recursive:true});mkdirSync(join(runner,'artifacts'),{recursive:true});
for(const name of ['runtime','growth'])symlinkSync(join(project,name),join(runner,name),'junction');
const files=['smoke-prompt6.mjs','cdp.mjs','prompt4-browser.mjs','long-paper-fixture.mjs'],hashes={};
for(const file of files){
  let source=readFileSync(join(project,'scripts',file),'utf8');hashes[file]=createHash('sha256').update(source).digest('hex');
  if(file==='smoke-prompt6.mjs'){
    source=source.replace("const personalFiles=['data/student-1/mimir-growth/growth.sqlite','data/student-1/mimir-workbench/paper-guide/papers.json'];","const personalFiles=[]; // This isolated acceptance never reads a personal home.");
    // Background CDP tabs may have timers suspended; assess automatic refresh in the foreground.
    source=source.replace('async function verifyReview(){','async function verifyReview(){await reviewBrowser.send("Page.bringToFront");');
    source=source.replaceAll("await browser.send('Page.navigate',", "await browser.send('Page.bringToFront');await browser.send('Page.navigate',");
    source=source.replace("await browser.waitFor(\"document.querySelector('#paper-title').textContent==='Synthetic-A.pdf · 修订'\");await click('[data-tab=ask]')", "await browser.waitFor(\"document.querySelector('#paper-title').textContent==='Synthetic-A.pdf · 修订'&&Boolean(document.querySelector('#text-layer span'))\");await click('[data-tab=ask]')");
    source=source.replace("if(host?.exitCode===null)host.kill();instance=null;","if(host?.exitCode===null)throw new Error('Owned fixture host did not stop through control');instance=null;");
    source=source.replace("edge?.kill();await stop();provider.closeAllConnections();await new Promise(done=>provider.close(done));","try{await closeFixtureBrowser();}finally{try{await stop();}finally{provider.closeAllConnections();await new Promise(done=>provider.close(done));}}");
    source+='\nasync function closeFixtureBrowser(){if(edge?.exitCode!==null)return;const port=Number(readFileSync(join(home,"browser/DevToolsActivePort"),"utf8").split("\\n")[0]);try{const info=await(await fetch("http://127.0.0.1:"+port+"/json/version")).json();await new Promise((done,fail)=>{const socket=new WebSocket(info.webSocketDebuggerUrl),timer=setTimeout(()=>{socket.close();fail(new Error("Owned browser close timed out"))},5000);socket.addEventListener("open",()=>socket.send(JSON.stringify({id:1,method:"Browser.close"})));socket.addEventListener("close",()=>{clearTimeout(timer);done()},{once:true});socket.addEventListener("error",()=>{clearTimeout(timer);fail(new Error("Owned browser close failed"))},{once:true})});}catch(error){try{await fetch("http://127.0.0.1:"+port+"/json/version",{signal:AbortSignal.timeout(1000)});throw error}catch(check){if(check===error)throw error}}const end=Date.now()+5000;while(edge.exitCode===null&&Date.now()<end)await delay(100);if(edge.exitCode===null)throw new Error("Owned fixture browser did not stop normally")}\n';
    source=source.replace("}catch(e){const reviewSnapshot=", "}catch(e){const paperSnapshot=await browser?.evaluate(\"({status:document.querySelector('#status')?.textContent,title:document.querySelector('#paper-title')?.textContent,tabs:[...document.querySelectorAll('.paper-tab')].map(n=>n.textContent),library:[...document.querySelectorAll('.paper-item')].map(n=>({text:n.textContent,current:n.getAttribute('aria-current')})),empty:{hidden:document.querySelector('#empty')?.hidden,text:document.querySelector('#empty')?.textContent},surfaceHidden:document.querySelector('#page-surface')?.hidden,spans:document.querySelectorAll('#text-layer span').length,canvas:{width:document.querySelector('canvas')?.width,height:document.querySelector('canvas')?.height}})\").catch(()=>null);writeFileSync('artifacts/paper-reopen-diagnostic.json',JSON.stringify({paperSnapshot,checks,errors},null,2));const reviewSnapshot=");
  }
  writeFileSync(join(runner,'scripts',file),source);
}
writeFileSync(join(inventory,'acceptance-source.json'),JSON.stringify({hashes,adaptations:['no personal data reads','normal control and browser shutdown','reader DOM snapshot on failure','bring reader to foreground before navigation and await parsed text rather than cached title']},null,2));
const env={...process.env,NODE_ENV:'test'};for(const key of Object.keys(env))if(/(?:api.?key|token|secret|password)/i.test(key))delete env[key];
const flags=process.argv.slice(2);for(const flag of flags)assert.ok(['--long-input','--model-fix','--output-fix','--comparison-fix','--history-fix','--question-fix'].includes(flag),'Unsupported paper acceptance flag');
const child=spawn(join(project,'runtime/system/node/node.exe'),[join(runner,'scripts/smoke-prompt6.mjs'),'--document-fix',...flags],{cwd:runner,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
let log='';for(const stream of[child.stdout,child.stderr])stream.on('data',bytes=>{log+=bytes;writeFileSync(join(inventory,'acceptance.log'),log)});
const exitCode=await new Promise(done=>{child.on('error',()=>done(null));child.on('exit',done)});
const report=JSON.parse(readFileSync(join(runner,'artifacts/document-smoke.json'),'utf8'));
const summary={runId,passed:exitCode===0&&report.passed,exitCode,checks:report.checks?.length??0,errors:report.errors?.length??0,modelCalls:report.modelCalls??0,paidModelCalls:0,realDataRead:false,isolatedHome:true,fixtureHost:'installed native DSH runtime via Node',flags,inventory};
writeFileSync(join(inventory,'summary.json'),JSON.stringify(summary,null,2));writeFileSync(join(project,'.test-data/paper-integration/latest-summary.json'),JSON.stringify(summary,null,2));
console.log((summary.passed?'PASS':'FAIL')+' paper-loop ('+summary.checks+' groups, local fixture only)');
assert.ok(summary.passed,'Paper acceptance failed; see private inventory');
