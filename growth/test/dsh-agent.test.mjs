import test from 'node:test'
import assert from 'node:assert/strict'
import { agentFixture } from './agent-fixture.mjs'
import { growthAgentTools, runGrowthAgent, growthFailure } from '../src/dsh-agent.mjs'
import { defaultProfile } from '../src/domain.mjs'
const selection = { provider: 'test', model: 'test', reasoningEffort: 'high' }
const context = { agentDefaultModel: { currentSelection: () => selection } }
const chunks = text => [{ type: 'text-delta', text }, { type: 'finish', reason: { kind: 'stop' } }]

test('agent owns a scoped coach prompt and tools, records routing and disposes after committed completion', async () => {
  const t=agentFixture(context,{frames:chunks('最终建议')}), result=await runGrowthAgent(t.context,'成长教练',{profile:defaultProfile()})
  assert.equal(result.text,'最终建议');assert.equal(result.model.engine,'dsh-agent');assert.equal(result.model.provider,'test');assert.equal(result.model.steps,1)
  assert.equal(t.stats.sections[0].complete,true);assert.equal(t.stats.sections[0].interpolate,false);assert.deepEqual(t.stats.restrictions,[{allow:[]}]);assert.equal(t.stats.disposed,1)
  assert.ok(t.stats.guards[0]({name:'pwsh'}));assert.equal(t.stats.guards[0]({name:'growth_course_unit'}),undefined)
  assert.deepEqual(selection,{provider:'test',model:'test',reasoningEffort:'high'})
  assert.equal(t.stats.runtimeContextSuppressed,true);assert.deepEqual(t.stats.messages[0].source,{kind:'mimir-growth'})
})
test('missing Agent runtime cannot silently bypass to a direct model call', async () => {
  let called=false
  await assert.rejects(runGrowthAgent({...context,llm:{prepareCall(){called=true}}},'教练',{}),error=>error.code==='MODEL_UNAVAILABLE')
  assert.equal(called,false)
})
test('read-only tools use supplied context, omit quiz keys and never create learning records', async () => {
  const payload={marker:'current-context'},tools=growthAgentTools(payload),exec={signal:new AbortController().signal}
  payload.marker='changed'
  assert.deepEqual(await tools[0].execute({},exec),{marker:'current-context'})
  const unit=await tools[1].execute({courseId:'mit-robotics',variant:'foundation'},exec)
  assert.equal(unit.topicRef,'planar-2r-v1');assert.ok(!unit.questions.some(question=>'correct' in question));assert.ok(!JSON.stringify(unit).includes('"correct"'))
  await assert.rejects(tools[1].execute({courseId:'invented',variant:'foundation'},exec))
  const calculation=await tools[2].execute({length1:1,length2:1,angle1:0,angle2:90,unit:'deg',predictX:1,predictY:1,passed:false},exec)
  assert.equal(calculation.passed,true);assert.equal(calculation.savedToLearning,false);assert.equal(calculation.recordType,'agent-calculation-only')
})
test('course tool resolves only a supplied custom study definition and never exposes diagnosis answers', async () => {
  const choice = { id: 'custom-current', label: '深入学习主题', title: '我的验证主题', detail: '合成主题', source: 'https://example.org/topic' }
  const tools = growthAgentTools({ customChoices: [choice] }), exec = { signal: new AbortController().signal }
  const unit = await tools[1].execute({ courseId: choice.id, variant: 'foundation' }, exec)
  assert.equal(unit.course.url, choice.source)
  assert.ok(unit.studyTopic.custom)
  assert.ok(!JSON.stringify(unit).includes('"correct"'))
  await assert.rejects(tools[1].execute({ courseId: 'custom-unprovided', variant: 'foundation' }, exec), error => error.code === 'INVALID_ARGUMENT')
  await assert.rejects(tools[1].execute({ courseId: choice.id, variant: 'invented' }, exec), error => error.code === 'INVALID_ARGUMENT')
})
test('numeric learning tool rejects the observed relative-angle answer without altering supplied evidence', async () => {
  const payload = { task: { resourceId: 'robot-kinematics', criteria: ['正确解出两个特例'] }, artifactText: '合成纸笔记录' }
  const before = structuredClone(payload), tools = growthAgentTools(payload), exec = { signal: new AbortController().signal }
  const input = { length1: 1, length2: 1, angle1: 30, angle2: 90, unit: 'deg', predictX: Math.sqrt(3) / 2, predictY: 1.5 }
  const supplied = structuredClone(input), result = await tools[2].execute(input, exec)
  assert.equal(result.passed, false)
  assert.ok(Math.abs(result.actual.x - (Math.sqrt(3) - 1) / 2) < 1e-12)
  assert.ok(Math.abs(result.actual.y - (1 + Math.sqrt(3)) / 2) < 1e-12)
  assert.equal(result.savedToLearning, false)
  assert.deepEqual(input, supplied)
  assert.deepEqual(payload, before)
  await assert.rejects(tools[1].execute({ courseId: payload.task.resourceId, variant: 'foundation' }, exec), error => error.code === 'INVALID_ARGUMENT')
  assert.deepEqual(await tools[0].execute({}, exec), before)
})
test('incomplete output and exceeded step budget fail rather than returning partial advice', async () => {
  for(const fixture of [{frames:[{type:'text-delta',text:'partial'},{type:'finish',reason:{kind:'length'}}]},{frames:chunks('answer'),steps:5}]){
    const t=agentFixture(context,fixture);await assert.rejects(runGrowthAgent(t.context,'教练',{}),error=>error.code===(fixture.steps ? 'MODEL_UNAVAILABLE' : 'MODEL_OUTPUT_LIMIT'));assert.equal(t.stats.disposed,1)
  }
})
test('cancelling a stalled Agent drains and disposes its owned handle', async () => {
  const t=agentFixture({...context,llm:{prepareCall:async()=>new Promise(()=>{})}}),controller=new AbortController()
  const pending=runGrowthAgent(t.context,'教练',{},controller.signal)
  setTimeout(()=>controller.abort(),10)
  await assert.rejects(pending,error=>error.code==='CANCELLED');assert.equal(t.stats.cancelled,1);assert.equal(t.stats.disposed,1)
})
test('provider authentication and quota failures are safe and specific; output size is bounded', async () => {
  for(const code of ['AUTH','MISSING_CREDENTIAL','INVALID_CREDENTIAL','RATE_LIMIT','QUOTA']){
    const t=agentFixture({...context,llm:{prepareCall:async()=>{throw Object.assign(new Error('SECRET-DO-NOT-EXPOSE'),{code})}}})
    await assert.rejects(runGrowthAgent(t.context,'教练',{}),error=>error.code===(['RATE_LIMIT','QUOTA'].includes(code)?'MODEL_RATE_LIMIT':'MODEL_AUTH')&&!error.message.includes('SECRET-DO-NOT-EXPOSE')&&error.message.includes(['RATE_LIMIT','QUOTA'].includes(code)?'限流':'凭据'));assert.equal(t.stats.disposed,1)
  }
  const t=agentFixture(context,{frames:chunks('x'.repeat(60001))});await assert.rejects(runGrowthAgent(t.context,'教练',{}),error=>error.code==='INVALID_MODEL_OUTPUT');assert.equal(t.stats.disposed,1)
})
test('provider failures retain useful categories without leaking upstream text', () => {
  for (const [input, code] of [[{status:401},'MODEL_AUTH'],[{status:429},'MODEL_RATE_LIMIT'],[{status:503},'MODEL_PROVIDER_ERROR'],[{failure:{status:503}},'MODEL_PROVIDER_ERROR'],[{failure:{status:413}},'MODEL_CONTEXT_LIMIT'],[{name:'TimeoutError'},'MODEL_TIMEOUT'],[{code:'ECONNRESET'},'MODEL_NETWORK'],[{code:'CONTEXT_WINDOW_EXCEEDED'},'MODEL_CONTEXT_LIMIT'],[{code:'STREAM_CLOSED'},'MODEL_RESPONSE_INCOMPLETE'],[{code:'INVALID_REQUEST'},'MODEL_REQUEST_INVALID']]) {
    const error = growthFailure({...input,message:'SECRET-DETAIL'});assert.equal(error.code,code);assert.ok(!error.message.includes('SECRET'))
  }
})

test('model policy failures are safe at selection and Agent request boundaries', async () => {
  const messages = {
    MODEL_POLICY: '当前模型配置被拒绝，请核对所选提供商、模型及其配置。',
    MODEL_ENDPOINT_POLICY: '当前提供商地址配置无效，请核对该提供商的连接设置。',
    MODEL_CONFIGURATION: '模型配置无效，请核对所选提供商、思考强度及请求限制。',
  }
  for (const [code, message] of Object.entries(messages)) {
    const raw = Object.assign(new Error('SECRET-ENDPOINT-ENV-USERKEY'), { code, status: 400, cause: new Error('SECRET-CAUSE') })
    const safe = error => error.code === code && error.status === 422 && error.message === message && !('cause' in error)
    assert.ok(safe(growthFailure(raw)))
    const f = agentFixture({ ...context, llm: { prepareCall: async () => { throw raw } } })
    await assert.rejects(runGrowthAgent(f.context, '教练', {}), safe)
    assert.equal(f.stats.disposed, 1)
    await assert.rejects(runGrowthAgent({ ...context, agentDefaultModel: { currentSelection() { throw raw } } }, '教练', {}), safe)
  }
})
test('the processing deadline is distinct from user cancellation and drains the Agent', async t => {
  const deadline=new AbortController()
  t.mock.method(AbortSignal,'timeout',()=>deadline.signal)
  const f=agentFixture({...context,llm:{prepareCall:async()=>new Promise(()=>{})}})
  const pending=runGrowthAgent(f.context,'教练',{})
  setTimeout(()=>deadline.abort(new DOMException('deadline','TimeoutError')),10)
  await assert.rejects(pending,error=>error.code==='MODEL_TIMEOUT'&&error.status===504)
  assert.equal(f.stats.cancelled,1);assert.equal(f.stats.disposed,1)
})
test('oversized input is rejected before a model request or tool snapshot is created', async () => {
  const f=agentFixture(context,{frames:chunks('建议')})
  await assert.rejects(runGrowthAgent(f.context,'教练',{text:'x'.repeat(200001)}),error=>error.code==='MODEL_CONTEXT_LIMIT')
  assert.equal(f.stats.messages.length,0);assert.equal(f.stats.disposed,0)
})
test('disposal failures cannot leak upstream details or mask the original failure', async () => {
  const disposeError = new Error('SECRET-DISPOSAL-DETAIL')
  const success = agentFixture(context,{frames:chunks('建议'),disposeError})
  await assert.rejects(runGrowthAgent(success.context,'教练',{}),error=>error.code==='MODEL_UNAVAILABLE'&&error.message.includes('资源释放')&&!error.message.includes('SECRET'))
  const failure = agentFixture(context,{frames:chunks('x'.repeat(60001)),disposeError})
  await assert.rejects(runGrowthAgent(failure.context,'教练',{}),error=>error.code==='INVALID_MODEL_OUTPUT'&&!error.message.includes('SECRET'))
})
