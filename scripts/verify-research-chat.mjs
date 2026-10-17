// A local transport fixture exercises the same selectors used by explicit live acceptance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {connectBrowser} from './cdp.mjs';
import {openResearchChat,sendResearchChat,readNewResearchReply} from './research-chat-driver.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),home=join(project,'.test-data','research-chat',randomUUID());
mkdirSync(join(home,'profiles/web'),{recursive:true});writeFileSync(join(home,'owned-by-chat-fixture.json'),JSON.stringify({material:'synthetic chat fixture'}));
const reply='本机模拟答复：理想模型仅用于核验流程；没有实物测试。核对相同参考系再代入。',calls=[],exceptions=[];
let host,edge,browser,instance,log='';
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const provider=createServer(async(request,response)=>{
  try{let raw='';for await(const bytes of request)raw+=bytes;const body=JSON.parse(raw);assert.equal(request.headers['x-api-key'],'synthetic-local-chat-key');assert.equal(body.model,'deepseek-flash');calls.push({model:body.model});
    response.writeHead(200,{'content-type':'text/event-stream'});const emit=event=>response.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');
    emit({type:'message_start',message:{id:'fixture',type:'message',role:'assistant',model:body.model,content:[],usage:{input_tokens:20,output_tokens:0}}});emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:reply}});emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:40}});emit({type:'message_stop'});response.end();
  }catch(error){exceptions.push(error.name);if(!response.headersSent)response.writeHead(500);response.end();}
});
async function wait(check,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await delay(100)}throw new Error('Isolated chat fixture readiness timed out')}
async function closeBrowser(){if(!edge||edge.exitCode!==null)return;const port=Number(readFileSync(join(home,'browser/DevToolsActivePort'),'utf8').split('\n')[0]);try{const info=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();await new Promise((done,fail)=>{const socket=new WebSocket(info.webSocketDebuggerUrl),timer=setTimeout(()=>{socket.close();fail(new Error('Fixture browser close timeout'))},5000);socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Browser.close'})));socket.addEventListener('close',()=>{clearTimeout(timer);done()},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);fail(new Error('Fixture browser close error'))},{once:true})})}catch{await delay(500)}await wait(()=>edge.exitCode!==null,5000)}
const report={passed:false,realDataRead:false,paidModelCalls:0,isolatedHome:true,localFixture:true,canonicalModel:true};
try{
  await new Promise(done=>provider.listen(0,'127.0.0.1',done));writeFileSync(join(home,'profiles/web/cordis.patch.yml'),'- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: off\n- id: llm-deepseek\n  config:\n    baseURL: http://127.0.0.1:'+provider.address().port+'\n    thinking: disabled\n    retryPolicy:\n      mode: normal\n      maxRetries: 0\n');
  const env={...process.env,NODE_ENV:'test'};for(const key of Object.keys(env))if(/(?:api.?key|token|secret|password)/i.test(key))delete env[key];
  host=spawn(join(project,'runtime/system/node/node.exe'),[join(project,'runtime/system/app/app.mjs'),'--data-home',home],{cwd:project,windowsHide:true,env,stdio:['pipe','pipe','pipe']});host.stdin.end(JSON.stringify({apiKey:'synthetic-local-chat-key'}));
  for(const stream of[host.stdout,host.stderr])stream.on('data',bytes=>{log+=bytes;writeFileSync(join(home,'native.log'),log)});
  await wait(()=>existsSync(join(home,'instance.json')));instance=JSON.parse(readFileSync(join(home,'instance.json'),'utf8'));
  edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--remote-debugging-port=0','--no-first-run','--user-data-dir='+join(home,'browser'),'about:blank'],{windowsHide:true,env,stdio:'ignore'});
  await wait(()=>existsSync(join(home,'browser/DevToolsActivePort')),20000);browser=await connectBrowser(Number(readFileSync(join(home,'browser/DevToolsActivePort'),'utf8').split('\n')[0]));browser.on(event=>{if(event.method==='Runtime.exceptionThrown')exceptions.push('Runtime exception')});
  await browser.send('Page.navigate',{url:instance.url});await browser.waitFor('Boolean(document.querySelector(".mg-well-landing"))');await openResearchChat(browser);const previousReplies=await sendResearchChat(browser,'仅验证本机输入发送路径，请保留理想模型及没有实物测试的限定，给一个核对步骤；不要调用工具。');
  assert.equal(await readNewResearchReply(browser,previousReplies,30000),reply);assert.ok(calls.length>0);assert.deepEqual(exceptions,[]);report.passed=true;
}catch(error){writeFileSync(join(home,'failure.json'),JSON.stringify({error:error.stack,markup:await browser?.evaluate('({composer:document.querySelector("[data-composer-input]")?.outerHTML,buttons:[...document.querySelectorAll("[data-composer-card] button")].map(node=>({label:node.getAttribute("aria-label"),disabled:node.disabled})),text:document.body.innerText.slice(-3000)})').catch(()=>null)},null,2));report.error={name:error.name,message:'Isolated local chat acceptance failed; details remain private.'};process.exitCode=1}
finally{
  await browser?.close().catch(()=>{});await closeBrowser().catch(()=>{report.browserCloseFailed=true;report.passed=false;process.exitCode=1});
  if(instance)await fetch('http://127.0.0.1:'+instance.controlPort+'/exit',{method:'POST',headers:{'X-Mimir-Control':instance.controlToken},signal:AbortSignal.timeout(5000)}).catch(()=>{});
  if(instance)await wait(()=>!existsSync(join(home,'instance.json'))&&host.exitCode!==null,10000).catch(()=>{report.hostCloseFailed=true;report.passed=false;process.exitCode=1});
  provider.closeAllConnections();await new Promise(done=>provider.close(done));report.modelCalls=calls.length;report.browserExceptions=exceptions.length;report.canonicalModel=calls.length>0&&calls.every(row=>row.model==='deepseek-flash');
  report.cleanup={browserClosed:!edge||edge.exitCode!==null,nativeHostStopped:!host||host.exitCode!==null};
  writeFileSync(join(home,'summary.json'),JSON.stringify(report,null,2));writeFileSync(join(project,'artifacts/research-chat-fixture-20261010.json'),JSON.stringify(report,null,2));console.log((report.passed?'PASS':'FAIL')+' research chat local fixture');
}
