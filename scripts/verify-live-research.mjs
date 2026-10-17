// Explicit opt-in diagnostic: never print instance tokens, credentials or paper text.
import {readFileSync, readdirSync, existsSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const live=process.argv.includes('--live'),reload=process.argv.includes('--reload');
if(!live&&!reload)throw new Error('Choose --reload for local restart only, or explicitly authorise --live for a provider call.');
const home=resolve('data/student-1'),stateFile=join(home,'instance.json'),directory=join(home,'mimir-workbench/research-runs');
const runs=readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(readFileSync(join(directory,name))));
if(runs.some(run=>run.status==='running'))throw new Error('There is an active research task; do not interrupt it.');
const previous=runs.filter(run=>run.status==='failed').sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
if(live&&!previous)throw new Error('No failed research task to verify.');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
let instance=JSON.parse(readFileSync(stateFile));
if(reload){
  const oldPid=instance.pid;
  const stopped=await fetch('http://127.0.0.1:'+instance.controlPort+'/exit',{method:'POST',headers:{'X-Mimir-Control':instance.controlToken},signal:AbortSignal.timeout(5000)});
  if(!stopped.ok)throw new Error('Graceful shutdown refused.');
  const deadline=Date.now()+30000;
  let exited=false;
  while(Date.now()<deadline){try{process.kill(instance.pid,0);}catch{exited=true;break;}await delay(200);}
  if(!exited)throw new Error('Graceful shutdown still pending; no forced termination.');
  spawn(resolve('runtime/Mimir.exe'),['--data-home',home],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
  const ready=Date.now()+60000;
  while(Date.now()<ready){if(existsSync(stateFile)){const next=JSON.parse(readFileSync(stateFile));if(next.pid!==instance.pid){instance=next;break;}}await delay(250);}
  if(!existsSync(stateFile)||JSON.parse(readFileSync(stateFile)).pid===oldPid)throw new Error('Restart did not complete.');
  console.log('Updated native host loaded.');
}
if(!live)process.exit(0);
const session=await fetch(instance.url,{redirect:'manual',signal:AbortSignal.timeout(5000)});
const cookie=session.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ');
const opened=await fetch(new URL('/api/paper-guide/open',instance.url),{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({rpcId:randomUUID()}),signal:AbortSignal.timeout(5000)});
const openResult=await opened.json(),url=openResult.result?.value?.url;
if(!url)throw new Error('Cannot open paper service.');
const endpoint=new URL(url);
async function api(operation,args={}){
  const response=await fetch(new URL('api/'+operation,endpoint),{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Guide':'1'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  const value=await response.json();
  if(!response.ok)throw Object.assign(new Error(value.message??'Service refused verification.'),{code:value.error});
  return value;
}
const available=await api('papers');
for(const paper of previous.input.papers){const current=available.find(row=>row.paperId===paper.paperId);if(!current?.researchToolsEnabled||!current.guideReady||current.version!==paper.version)throw new Error('Existing paper authorisation or guide changed; do not resubmit.');}
const started=await api('research-start',{...previous.input,consent:true});
console.log('Existing authorised task submitted to its configured model.');
const deadline=Date.now()+16*60000;let run;
while(Date.now()<deadline){run=await api('research-get',{runId:started.runId,view:'status'});if(run.status!=='running')break;console.log(JSON.stringify({status:run.status,modelCalls:run.metrics.modelCalls,elapsedSeconds:Math.floor((Date.now()-Date.parse(run.createdAt))/1000)}));await delay(15000);}
const stored=JSON.parse(readFileSync(join(directory,started.runId+'.json')));
const report={at:new Date().toISOString(),version:JSON.parse(readFileSync('growth/package.json')).version,passed:run.status==='succeeded',runId:started.runId,status:run.status,model:run.model,metrics:run.metrics,error:run.error,sourcePages:stored.snapshot.map(p=>p.pages.length),evidenceCount:stored.snapshot.reduce((n,p)=>n+p.evidence.length,0),providerCalls:run.metrics.modelCalls,autoPublished:false};
writeFileSync('artifacts/research-live-repair.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(!report.passed)process.exitCode=1;
