import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { boundedLearningContext } from '../src/model.mjs'
test('native paper task failures redact coded upstream errors while retaining safe local errors', async () => {
  const source=readFileSync('growth/overrides/host/unified.js','utf8')
  const helpers=source.slice(source.indexOf('const trustedModelFailures='),source.indexOf('async function awaitWithSignal('))
  const methods=source.slice(source.indexOf('  startTask(paperId, kind, operation) {'),source.indexOf('  cancel(id) {'))
  const context=vm.createContext({AbortController,AbortSignal,Date,randomUUID5:randomUUID,Error,TypeError,WeakSet})
  vm.runInContext('class PaperError extends Error {}\n'+helpers+'\nclass Tasks { constructor(){this.tasks=new Map();this.config={};}paper(){}\n'+methods+'}\nglobalThis.Tasks=Tasks;',context)
  for(const [upstream,code] of [[{code:'AUTH'},'MODEL_AUTH'],[{code:'MODEL_FAILED'},'MODEL_FAILED'],[{name:'TimeoutError'},'MODEL_TIMEOUT'],[{code:'SERVER',failure:{status:503}},'MODEL_PROVIDER_ERROR'],[{failure:{status:413}},'MODEL_CONTEXT_LIMIT']]){
    const service=new context.Tasks(),row=service.startTask('p','ask',async()=>{throw Object.assign(new Error('SYNTHETIC-SECRET'),upstream)})
    await service.tasks.get(row.id).done
    assert.equal(service.task(row.id).error.code,code)
    assert.ok(!service.task(row.id).error.message.includes('SYNTHETIC-SECRET'))
  }
})

test('native AI observer is scoped, preserves request and response identity, and distinguishes cancellation', async () => {
  const source=readFileSync('growth/client/ai-status.js','utf8').split('const nativeAiStatus =')[0]
  const context=vm.createContext({URL});vm.runInContext(source+'\nglobalThis.observe=observeNativeAiRequests;',context)
  const events=[],response={ok:true},requests=[];
  const original=async(...args)=>{requests.push(args);return response},environment={fetch:original,location:{href:'http://localhost:123/work',origin:'http://localhost:123'}}
  const dispose=context.observe(environment,event=>events.push(event));const options={method:'POST',body:'preserve-exact-body'}
  assert.equal(await environment.fetch('/api/mimir/ai/assist',options),response);assert.equal(requests[0][1],options)
  assert.deepEqual(events.map(row=>row.type),['start','end']);events.length=0
  await environment.fetch('https://example.org/api/mimir/ai/assist',options);await environment.fetch('/api/mimir/files',options);await environment.fetch('/api/mimir/ai/assist');assert.equal(events.length,0)
  dispose();assert.equal(environment.fetch,original)
  environment.fetch=async()=>({ok:false,status:503});const stop=context.observe(environment,event=>events.push(event))
  await environment.fetch(new URL('http://localhost:123/api/mimir/ai/suggest'),options)
  assert.deepEqual(events.map(row=>row.type),['start','error','end']);assert.equal(events[1].status,503);stop();events.length=0
  const cancelled=Object.assign(new Error('cancel'),{name:'AbortError'});environment.fetch=async()=>{throw cancelled}
  const finish=context.observe(environment,event=>events.push(event));await assert.rejects(environment.fetch('/api/mimir/ai/assist',options),error=>error===cancelled)
  assert.deepEqual(events.map(row=>row.type),['start','cancelled','end']);finish()
  events.length=0;let resolvePending;environment.fetch=()=>new Promise(resolve=>resolvePending=resolve)
  const unload=context.observe(environment,event=>events.push(event)),pending=environment.fetch('/api/mimir/ai/assist',options)
  unload();assert.deepEqual(events.map(row=>row.type),['start','end']);resolvePending(response);await pending;assert.equal(events.length,2)
})

test('native writer overrides change only AI deadlines and default fetch binding', () => {
  const host=readFileSync('growth/overrides/host/index.js','utf8'),client=readFileSync('growth/overrides/workbench/client.js','utf8')
  assert.equal((host.match(/AbortSignal.timeout\(3e5\)/g)||[]).length,4)
  assert.equal((client.match(/\(\(\.\.\.args\)=>globalThis.fetch\(\.\.\.args\)\)/g)||[]).length,2)
  assert.ok(!client.includes('fetch.bind(globalThis)'))
})
test('AI history uses explicitly marked excerpts without modifying the full saved learning', () => {
  const state={learningSessions:{task:{fields:{explanation:'x'.repeat(1800)},minutes:40,checkpoint:{choice:'deepen',answer:'y'.repeat(1200)}}},evidence:{}}
  const before=structuredClone(state),rows=boundedLearningContext(state,{tasks:[{id:'task'}]})
  assert.ok(rows[0].fields.explanation.length<400);assert.ok(rows[0].fields.explanation.includes('摘要'))
  assert.ok(rows[0].checkpoint.answer.length<600);assert.deepEqual(state,before)
})
