// Actual bundled DSH Agent loop + HTTP provider transport; model and paper data are controlled fixtures.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { defaultProfile, templatePlan } from '../growth/src/domain.mjs'

const root=resolve('.'), version=JSON.parse(readFileSync('growth/package.json','utf8')).version
const home=join(root,'.test-data','dsh-agent-'+randomUUID()), reportPath=join(root,'artifacts','dsh-agent-smoke-'+version+'.json')
const learnerFile=join(root,'data/student-1/mimir-growth/growth.sqlite'), learnerHash=()=>existsSync(learnerFile)?createHash('sha256').update(readFileSync(learnerFile)).digest('hex'):null, beforeHash=learnerHash()
const checks=[], wire=[], errors=[], fakeKey='synthetic-dsh-integration-key'
let host, instance, cookie, origin, state, providerMode='success', blockedResponse, output=''
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function waitFor(predicate, timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await delay(80)}throw new Error('Isolated DSH test timed out')}
function sse(response, {text,tool,reason}={}){
  response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'})
  const emit=data=>response.write('event: '+data.type+'\ndata: '+JSON.stringify(data)+'\n\n')
  emit({type:'message_start',message:{id:'msg_'+randomUUID(),type:'message',role:'assistant',model:'deepseek-flash',content:[],usage:{input_tokens:20,output_tokens:0}}})
  emit({type:'content_block_start',index:0,content_block:tool?{type:'tool_use',id:'tool_'+randomUUID(),name:tool.name,input:tool.args}:{type:'text',text:''}})
  if(!tool)emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:text||''}})
  emit({type:'content_block_stop',index:0})
  emit({type:'message_delta',delta:{stop_reason:reason||(tool?'tool_use':'end_turn'),stop_sequence:null},usage:{output_tokens:30}})
  emit({type:'message_stop'});response.end()
}
function inputPayload(body){
  for(const message of body.messages||[])for(const block of message.content||[]){
    if(block.type!=='text')continue
    try{const data=JSON.parse(block.text);if(data.resources||data.artifactText||data.message||Array.isArray(data.items))return data}catch{}
  }
  return null
}
function finalText(payload){
  if(payload.resources)return JSON.stringify(templatePlan(payload.profile))
  if(payload.artifactText)return JSON.stringify({summary:'合成模型反馈：请继续解释相对角和实物边界。',checks:payload.task.criteria.map(criterion=>({criterion,status:'supported',feedback:'依据所提供的文字；不表示整门课程掌握。'})),nextStep:'核对一组自定义姿态。'})
  if(payload.items)return JSON.stringify({overview:'合成摘要概览',items:payload.items.map(item=>({id:item.id,summary:'根据提供的摘要整理。',question:'全文采用了什么验证方法？'}))})
  return '合成教练建议：先解释第二关节相对角，再写下自己的检查方法。'
}
const provider=createServer(async(request,response)=>{
  try{
    if(!request.url.endsWith('/messages')){response.writeHead(404);response.end();return}
    assert.equal(request.headers['x-api-key'],fakeKey)
    let raw='';for await(const data of request)raw+=data
    const body=JSON.parse(raw),payload=inputPayload(body),toolResults=(body.messages||[]).flatMap(message=>message.content||[]).filter(block=>block.type==='tool_result')
    // A runtime helper (e.g. a session title) is not a growth operation.
    if(!payload){sse(response,{text:'合成验收'});return}
    const schemas=(body.tools||[]).map(tool=>tool.name)
    assert.deepEqual([...schemas].sort(),['growth_course_unit','growth_learning_context','growth_robotics_check'])
    assert.ok(JSON.stringify(body.system).includes('面向本专科学生的成长教练'))
    assert.ok(!JSON.stringify(body).includes(root),'runtime workspace path must not enter the learning request')
    assert.ok(!JSON.stringify(body).includes('<runtime_context>'),'dynamic runtime context must stay suppressed')
    wire.push({kind:payload.resources?'plan':payload.artifactText?'evidence':payload.items?'research':'feedback',schemas,toolResults})
    if(providerMode==='auth'){response.writeHead(401,{'content-type':'application/json'});response.end(JSON.stringify({error:{type:'authentication_error',message:'SECRET-ERROR-MUST-NOT-LEAK'}}));return}
    if(providerMode==='stall'){blockedResponse=()=>sse(response,{text:finalText(payload)});return}
    if(providerMode==='invalid'){sse(response,{text:'not-json'});return}
    if(providerMode==='limit'||toolResults.length===0){
      const tool=providerMode==='forbidden'?{name:'pwsh',args:{command:'Write-Output synthetic-only'}}:payload.artifactText?{name:'growth_robotics_check',args:{length1:1,length2:1,angle1:0,angle2:90,unit:'deg',predictX:1,predictY:1}}:payload.resources?{name:'growth_course_unit',args:{courseId:'mit-robotics',variant:'foundation'}}:{name:'growth_learning_context',args:{}}
      sse(response,{tool});return
    }
    sse(response,{text:finalText(payload)})
  }catch(error){errors.push(String(error.message));if(!response.headersSent)response.writeHead(500);response.end()}
})
async function getState(){const response=await fetch(origin+'/api/mimir/growth/state',{headers:{cookie}});assert.equal(response.status,200);state=(await response.json()).data;return state}
async function requestOp(operation,payload,key=randomUUID(),requestVersion=state.version){
  const response=await fetch(origin+'/api/mimir/growth/'+operation,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({...payload,version:requestVersion,requestKey:key})})
  return {status:response.status,body:await response.json()}
}
async function op(operation,payload){const response=await requestOp(operation,payload);assert.equal(response.status,200,operation+': '+response.body.error?.message);state=response.body.data.state;return response.body.data.result}
async function startHost(){
  host=spawn(process.execPath,['--import',pathToFileURL(join(home,'paper-fixture.mjs')).href,join(root,'runtime/system/app/app.mjs'),'--data-home',home],{cwd:root,windowsHide:true,env:{...process.env,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']})
  host.stdin.end(JSON.stringify({apiKey:fakeKey}));output=''
  for(const stream of [host.stdout,host.stderr])stream.on('data',data=>{output=(output+data).slice(-10000)})
  await waitFor(()=>{if(host.exitCode!==null)throw new Error('Isolated host exited: '+output.replace(/\?token=\S+/g,'?token=[redacted]').replaceAll(fakeKey,'[synthetic credential]'));return existsSync(join(home,'instance.json'))},45000)
  instance=JSON.parse(readFileSync(join(home,'instance.json'),'utf8'));origin=new URL(instance.url).origin
  const login=await fetch(instance.url,{redirect:'manual'});cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
  await getState()
}
async function stopHost(){
  if(instance)await fetch(`http://127.0.0.1:${instance.controlPort}/exit`,{method:'POST',headers:{'X-Mimir-Control':instance.controlToken},signal:AbortSignal.timeout(4000)}).catch(()=>{})
  if(host){await waitFor(()=>host.exitCode!==null,10000).catch(()=>host.kill());host=null}instance=null
}
try{
  mkdirSync(join(home,'profiles','web'),{recursive:true})
  await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve))
  writeFileSync(join(home,'profiles','web','cordis.patch.yml'),'- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: off\n- id: llm-deepseek\n  config:\n    baseURL: http://127.0.0.1:'+provider.address().port+'\n    thinking: disabled\n    retryPolicy:\n      mode: normal\n      maxRetries: 0\n')
  const paper='<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2609.12345v1</id><title>Synthetic robot control</title><published>2026-09-30T12:00:00Z</published><updated>2026-09-30T12:00:00Z</updated><summary>Controlled test abstract, not a real paper claim.</summary><author><name>Synthetic author</name></author></entry></feed>'
  writeFileSync(join(home,'paper-fixture.mjs'),'const original=globalThis.fetch;globalThis.fetch=(url,options)=>String(url).startsWith("https://export.arxiv.org/api/query")?Promise.resolve(new Response('+JSON.stringify(paper)+',{headers:{"content-type":"application/atom+xml"}})):original(url,options);')
  await startHost();assert.equal(state.growthVersion,version)
  assert.equal((await fetch(origin+'/api/mimir/growth/state')).status,401)
  assert.equal((await fetch(origin+'/api/mimir/growth/generate',{method:'POST',headers:{cookie,origin:'https://example.invalid','content-type':'application/json'},body:'{}'})).status,403)
  checks.push('actual native DSH boot, inherited model route, authenticated growth API and cross-origin denial')
  const draft=await op('generate',{mode:'model',profile:defaultProfile()})
  assert.equal(draft.model.engine,'dsh-agent');assert.equal(draft.model.steps,2);assert.ok(draft.model.tools.some(tool=>tool.name==='growth_course_unit'&&tool.success));assert.equal(state.activePlanId,null)
  await op('confirm',{planId:draft.id})
  checks.push('real DSH Agent registry/loop and provider HTTP stream perform a course lookup before a validated candidate; confirmation remains explicit')
  const topicDraft=await op('course-plan',{courseId:'mit-robotics',topicRef:'planar-2r-v1'});await op('confirm',{planId:topicDraft.id})
  const topic=state.plans.find(plan=>plan.id===state.activePlanId).tasks.find(task=>task.topicRef)
  const beforeTrials=structuredClone(state.roboticsSessions)
  await op('evidence',{taskId:topic.id,mode:'model',artifactText:'x使用两段投影之和，第二关节相对角需要相加。仿真不表示真实定位精度。',reflection:'先区分理想模型与实物。',confidence:3})
  assert.equal(state.evidence[topic.id].model.engine,'dsh-agent');assert.ok(state.evidence[topic.id].assessment.summary.includes('合成模型反馈'))
  assert.deepEqual(state.roboticsSessions,beforeTrials);assert.notEqual(state.evidence[topic.id].status,'completed')
  checks.push('Agent simulation tool informs structured evidence feedback but does not create student verification records or complete the task')
  await op('feedback',{mode:'model',message:'我想理解为什么第二段要使用两个角的和。'})
  assert.equal(state.messages.at(-1).model.engine,'dsh-agent')
  const reviewed=await op('review',{mode:'model',advance:false});assert.equal(reviewed.model.engine,'dsh-agent');assert.equal(state.activePlanId,topicDraft.id)
  const digest=await op('research-digest',{topic:'robot-learning',count:5});assert.equal(digest.model.engine,'dsh-agent');assert.equal(digest.items.length,1)
  checks.push('feedback, stage review and source-bound research digest all run through actual DSH Agents; controlled paper fixture is explicitly synthetic')
  providerMode='forbidden';await op('generate',{mode:'model'})
  assert.ok(wire.at(-1).toolResults.some(result=>result.is_error));assert.ok(!wire.some(item=>item.schemas.includes('pwsh')))
  checks.push('a provider-forged pwsh call is denied and no system/file tools are advertised to the learning Agent')
  for(const mode of ['invalid','auth','limit']){
    providerMode=mode;const before=await getState(),reply=await requestOp('generate',{mode:'model'})
    assert.ok(reply.status>=400,mode);assert.ok(!JSON.stringify(reply.body).includes('SECRET-ERROR'));assert.deepEqual(await getState(),before)
  }
  checks.push('malformed JSON, authentication errors and step-budget exhaustion leave growth state intact and redact upstream details')
  providerMode='stall';blockedResponse=null
  const key=randomUUID(),beforeCancel=await getState(),pending=requestOp('generate',{mode:'model'},key)
  await waitFor(()=>blockedResponse!==null)
  const cancelled=await fetch(origin+'/api/mimir/growth/cancel',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({requestKey:key})});assert.equal(cancelled.status,200)
  assert.equal((await pending).body.error.code,'CANCELLED');assert.deepEqual(await getState(),beforeCancel)
  checks.push('explicit cancellation aborts a stalled real provider request and disposes its Agent without committing')
  blockedResponse=null
  const stale=requestOp('generate',{mode:'model'});await waitFor(()=>blockedResponse!==null)
  await op('profile',{profile:{...state.profile,name:'合成并发配置'}});const newer=await getState();blockedResponse()
  assert.equal((await stale).body.error.code,'VERSION_CONFLICT');assert.deepEqual(await getState(),newer)
  checks.push('concurrent profile save wins over an older Agent response; version conflict does not overwrite the newer record')
  providerMode='success';await op('generate',{mode:'model'})
  const beforeRestart=await getState();await stopHost();await startHost()
  assert.deepEqual(state.plans,beforeRestart.plans);assert.deepEqual(state.evidence,beforeRestart.evidence);assert.deepEqual(state.messages,beforeRestart.messages)
  assert.equal(learnerHash(),beforeHash);assert.deepEqual(errors,[])
  checks.push('Agent provenance, validated candidates and learning feedback survive native restart; personal database hash unchanged')
  writeFileSync(reportPath,JSON.stringify({passed:true,at:new Date().toISOString(),growthVersion:version,checks,controlledProviderRequests:wire.length,provider:'local Messages HTTP fixture',paperSource:'controlled Atom fixture',actualDshRuntime:true,realOnlineModelCalls:0,paidModelCalls:0,personalDatabaseUnchanged:true,syntheticHome:home},null,2))
  console.log('DSH Agent integration passed: '+checks.length+' native scenarios, '+wire.length+' controlled provider requests.')
}catch(error){
  const detail=String(error.stack||error).replace(/\?token=\S+/g,'?token=[redacted]').replaceAll(fakeKey,'[synthetic credential]')
  const diagnostic=output.replace(/\?token=\S+/g,'?token=[redacted]').replaceAll(fakeKey,'[synthetic credential]')
  writeFileSync(reportPath,JSON.stringify({passed:false,at:new Date().toISOString(),growthVersion:version,checks,errors,error:detail,controlledProviderRequests:wire.length,startupDiagnostic:diagnostic,syntheticHome:home},null,2));console.error(detail);process.exitCode=1
}finally{await stopHost();provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve))}
