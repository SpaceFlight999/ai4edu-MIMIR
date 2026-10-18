import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { applyDeepSeekCompatibility } from '../overrides/app/deepseek-compatibility.mjs'
import { modelCatalog, modelInfo, modelSelection, saveModelSettings } from '../src/model-settings.mjs'

const require = createRequire(new URL('../../runtime/system/engine/package.json', import.meta.url))
const native = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm-deepseek')).href)
function fixture() {
  let selection = { provider: 'ds', model: 'deepseek-flash', reasoningEffort: 'high' }
  const writes = []
  const models = [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash-1017', inputModalities: ['text','image'] }, { id: 'plain', name: 'Gateway Model', inputModalities: ['text'] }]
  const ctx = {
    llm: {
      listProviders: () => [{ id: 'ds', name: 'Configured DeepSeek Gateway' }], listModels: async () => models,
      resolveModelInfo: async (provider, id) => ({ ...models.find(item => item.id === id), provider, context: { contextWindow: 1048576 }, defaultMaxTokens: 393216,
        ...(id === 'plain' ? {} : { reasoning: { efforts: ['off','low','high','max'].map(id => ({ id, name: id })), defaultEffort: 'high' } }),
        apiKey: 'NEVER-EXPOSE', connection: { apiKey: 'NEVER-EXPOSE' } }),
      resolveCallConfig: async config => ({ ...config, ...(config.model === 'deepseek-flash' && !config.reasoningEffort ? { reasoningEffort: 'high' } : {}) }),
    },
    agentDefaultModel: { currentSelection: () => ({ ...selection }), saveSelection: async value => { selection = { ...value }; writes.push(value) } },
  }
  return { ctx, writes }
}
test('1017 is display metadata; capabilities and saved efforts survive without exposing auth', async () => {
  const { ctx, writes } = fixture()
  const catalog = await modelCatalog(ctx)
  assert.equal(catalog.selection.name, 'DeepSeek-V4.1-Flash')
  assert.equal(catalog.selection.version, '1017')
  assert.equal(catalog.selection.contextWindow, 1048576)
  assert.equal(catalog.selection.maxOutputTokens, 393216)
  assert.equal(catalog.selection.reasoningEffort, 'high')
  assert.doesNotMatch(JSON.stringify(catalog), /NEVER-EXPOSE|connection|apiKey/)
  for (const reasoningEffort of ['off','low','high','max']) {
    await saveModelSettings(ctx, { provider: 'ds', model: 'deepseek-flash', reasoningEffort })
    assert.equal(writes.at(-1).model, 'deepseek-flash')
    assert.equal(writes.at(-1).reasoningEffort, reasoningEffort)
  }
  await saveModelSettings(ctx, { provider: 'ds', model: 'deepseek-flash', reasoningEffort: null })
  assert.equal(writes.at(-1).reasoningEffort, 'high')
  await saveModelSettings(ctx, { provider: 'ds', model: 'plain' })
  assert.equal(writes.at(-1).reasoningEffort, undefined)
  assert.equal((await modelSelection(ctx)).version, undefined)
})
test('invalid efforts, forged models and hidden fields reject before model or credential writes', async () => {
  const { ctx, writes } = fixture()
  for (const input of [{ model: 'deepseek-flash', reasoningEffort: 'xhigh' }, { model: 'plain', reasoningEffort: 'high' }, { model: 'deepseek-flash-1017' }, { model: 'deepseek-flash', apiKeyEnv: 'OTHER_KEY' }, { model: 'deepseek-flash', reasoningEffort: '' }]) {
    await assert.rejects(saveModelSettings(ctx, { provider: 'ds', ...input }))
  }
  await assert.rejects(modelInfo(ctx, { provider: 'ds', model: 'deepseek-flash', secret: 'x' }))
  assert.equal(writes.length, 0)
})
test('failed provider directories remain isolated and duplicate model IDs are collapsed', async () => {
  const { ctx } = fixture(), list = ctx.llm.listModels
  ctx.llm.listProviders = () => [{id:'broken'}, {id:'ds'}]
  ctx.llm.listModels = async provider => { if (provider === 'broken') throw new Error('SECRET'); const models = await list(); return [...models, models[0]] }
  const catalog = await modelCatalog(ctx)
  assert.equal(catalog.providers[0].unavailable, true)
  assert.equal(catalog.providers[1].models.length, 2)
  assert.equal(catalog.selection.version, '1017')
})
test('bundled DeepSeek compatibility patch is repeatable and leaves explicit custom catalogs intact', () => {
  const path = require.resolve('@deepseek-ai/dsh-llm-deepseek'), source = readFileSync(path, 'utf8')
  const patched = applyDeepSeekCompatibility(source)
  assert.equal(applyDeepSeekCompatibility(patched), patched)
  assert.match(patched, /DeepSeek-V4\.1-Flash-1017/)
  assert.throws(() => applyDeepSeekCompatibility('unexpected baseline'), /Unexpected DeepSeek catalog/)
  const custom = native.resolveAdapterOptions({ baseURL: 'https://gateway.example/anthropic', models: [{ id:'private-model', name:'Private model', contextWindow: 12345, maxTokens: 456, inputModalities:['text'] }] })
  assert.equal(custom.models[0].id, 'private-model')
  assert.equal(custom.models[0].contextWindow, 12345)
  assert.equal(custom.baseURL, 'https://gateway.example/anthropic')
  const budget = native.resolveAdapterOptions({ maxTokens: 4096 })
  const adapter = new native.DeepSeekAdapter({ options:()=>budget, resolveFiles:()=>({}) })
  return adapter.resolveModel('deepseek-official','deepseek-flash').then(info=>assert.equal(info.defaultMaxTokens,4096))
})
test('real DeepSeek transport serializes every effort, reasoning/tool replay and token budgets', async () => {
  const requests = []
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const bytes of req) raw += bytes
    requests.push({ path:req.url, auth:req.headers['x-api-key'], body:JSON.parse(raw) })
    res.writeHead(200, { 'content-type':'text/event-stream' })
    const send = (type, payload) => res.write('event: '+type+'\ndata: '+JSON.stringify({type,...payload})+'\n\n')
    send('message_start', { message:{id:'fixture',role:'assistant',model:'deepseek-flash',content:[],usage:{input_tokens:12,output_tokens:0}} })
    send('content_block_start', { index:0, content_block:{type:'text',text:''} })
    send('content_block_delta', { index:0, delta:{type:'text_delta',text:'Synthetic answer'} })
    send('content_block_stop', { index:0 })
    send('message_delta', { delta:{stop_reason:'end_turn'}, usage:{output_tokens:3} })
    send('message_stop', {}); res.end()
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  try {
    const options = native.resolveAdapterOptions({baseURL:'http://127.0.0.1:'+server.address().port+'/anthropic'})
    const adapter = new native.DeepSeekAdapter({ options:()=>options, resolveAuth:async()=>({headers:{'x-api-key':'synthetic-local-key'}}), resolveUserId:()=> 'synthetic-user', resolveFiles:()=>({}), prepareExtensions:async()=>({fields:{},accept:async()=>{}}) })
    const info = await adapter.resolveModel('deepseek-official','deepseek-flash')
    assert.equal(info.name,'DeepSeek-V4.1-Flash-1017'); assert.equal(info.context.contextWindow,1048576)
    assert.equal(info.defaultMaxTokens,393216); assert.deepEqual(info.inputModalities,['text','image'])
    assert.deepEqual(info.reasoning.efforts.map(item=>item.id),['off','low','high','max'])
    for (const reasoningEffort of ['off','low','high','max']) {
      const chunks = []
      for await (const chunk of adapter.stream({ provider:'deepseek-official', model:'deepseek-flash', reasoningEffort, maxTokens:8192, signal:AbortSignal.timeout(5000),
        messages:[{role:'user',content:[{type:'text',text:'synthetic question'}]}, {role:'assistant',source:{kind:'model',provider:'deepseek-official',model:'deepseek-flash'},content:[{type:'reasoning',text:'synthetic thought'}, {type:'tool-call',id:'tool-1',name:'check',arguments:'{"value":1}'}]}, {role:'tool',toolCallId:'tool-1',content:[{type:'text',text:'1'}]}], tools:[{name:'check',description:'Synthetic check',parameters:{type:'object',properties:{}}}] })) chunks.push(chunk)
      const request = requests.at(-1)
      assert.equal(request.path,'/anthropic/v1/messages'); assert.equal(request.auth,'synthetic-local-key')
      assert.equal(request.body.model,'deepseek-flash'); assert.equal(request.body.max_tokens,8192)
      assert.equal(request.body.thinking.type,reasoningEffort==='off'?'disabled':'enabled')
      assert.equal(request.body.output_config?.effort,reasoningEffort==='off'?undefined:reasoningEffort)
      assert.ok(request.body.messages[1].content.some(block=>block.type==='thinking'&&block.thinking==='synthetic thought'))
      assert.ok(request.body.messages[2].content.some(block=>block.type==='tool_result'&&block.tool_use_id==='tool-1'))
      assert.ok(chunks.some(chunk=>chunk.type==='text-delta'))
    }
  } finally { server.closeAllConnections(); await new Promise(done=>server.close(done)) }
})
