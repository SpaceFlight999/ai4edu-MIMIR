// Stop only a named inventory created by verify-feature-followup; never terminate arbitrary processes.
import assert from 'node:assert/strict'
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve,relative,isAbsolute} from 'node:path'
import {fileURLToPath} from 'node:url'
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..'),base=join(project,'.test-data/feature-followup'),inventory=resolve(base,process.argv[2]??'')
assert.ok(inventory!==base&&!relative(base,inventory).startsWith('..')&&!isAbsolute(relative(base,inventory)));assert.ok(existsSync(join(inventory,'acceptance-source.json')),'Missing owned acceptance inventory')
const delay=ms=>new Promise(done=>setTimeout(done,ms)),rows=[]
for(const entry of readdirSync(join(inventory,'runner/.test-data'),{withFileTypes:true}).filter(row=>row.isDirectory())) {
  const home=join(inventory,'runner/.test-data',entry.name),row={fixture:entry.name,browserClosed:true,hostStopped:true}
  const devtools=join(home,'browser/DevToolsActivePort')
  if(existsSync(devtools)) {
    const port=Number(readFileSync(devtools,'utf8').split('\n')[0]);assert.ok(Number.isInteger(port)&&port>0&&port<65536)
    let info;try{info=await(await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(1000)})).json()}catch{}
    if(info){await new Promise((done,fail)=>{const socket=new WebSocket(info.webSocketDebuggerUrl),timer=setTimeout(()=>{socket.close();fail(new Error('Owned browser close timed out'))},5000);socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Browser.close'})));socket.addEventListener('close',()=>{clearTimeout(timer);done()},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);fail(new Error('Owned browser close failed'))},{once:true})});await delay(500);try{await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(1000)});row.browserClosed=false}catch{}}
  }
  const instanceFile=join(home,'instance.json')
  if(existsSync(instanceFile)) {
    const instance=JSON.parse(readFileSync(instanceFile,'utf8'));assert.ok(Number.isInteger(instance.controlPort)&&typeof instance.controlToken==='string')
    try{await fetch('http://127.0.0.1:'+instance.controlPort+'/exit',{method:'POST',headers:{'X-Mimir-Control':instance.controlToken},signal:AbortSignal.timeout(3000)})}catch{}
    const until=Date.now()+10000;while(existsSync(instanceFile)&&Date.now()<until)await delay(100)
    row.hostStopped=!existsSync(instanceFile)
    if(!row.hostStopped){try{await fetch(instance.url,{signal:AbortSignal.timeout(1000)});row.hostStopped=false}catch{row.hostStopped=true;row.staleInstanceFile=true}}
  }
  rows.push(row)
}
const report={passed:rows.every(row=>row.browserClosed&&row.hostStopped),normalControl:true,arbitraryProcessesTerminated:false,rows}
writeFileSync(join(inventory,'followup-cleanup.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,fixtures:rows.length,normalControl:true}));assert.ok(report.passed)
