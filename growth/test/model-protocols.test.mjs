import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
const require = createRequire(new URL('../../runtime/system/engine/package.json', import.meta.url))
const load = name => import(pathToFileURL(require.resolve(name)).href)
const { PiAiAdapter } = await load('@deepseek-ai/dsh-llm-pi-ai')
const protocols = [
  ['openai-completions','openAICompletionsApi','/v1/chat/completions'],
  ['openai-responses','openAIResponsesApi','/v1/responses'],
  ['anthropic-messages','anthropicMessagesApi','/v1/messages'],
]
for (const [protocol, factory, path] of protocols) test('native custom-provider '+protocol+' request and streamed answer', async () => {
  let received
  const server = createServer(async (req,res) => {
    let raw = ''; for await (const bytes of req) raw += bytes
    received = {path:req.url,headers:req.headers,body:JSON.parse(raw)}
    res.writeHead(200,{'content-type':'text/event-stream'})
    const send = (type,payload) => res.write((type?'event: '+type+'\n':'')+'data: '+JSON.stringify(payload)+'\n\n')
    if (protocol==='openai-completions') {
      const base = {id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture-model'}
      send('',{...base,choices:[{index:0,delta:{role:'assistant',content:'Synthetic answer'},finish_reason:null}]})
      send('',{...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:3,total_tokens:15}})
      res.end('data: [DONE]\n\n')
    } else if (protocol==='anthropic-messages') {
      const message = {id:'fixture',type:'message',role:'assistant',model:'fixture-model',content:[],stop_reason:null,usage:{input_tokens:12,output_tokens:0}}
      for (const [type,payload] of [
        ['message_start',{message}],['content_block_start',{index:0,content_block:{type:'text',text:''}}],
        ['content_block_delta',{index:0,delta:{type:'text_delta',text:'Synthetic answer'}}],['content_block_stop',{index:0}],
        ['message_delta',{delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:3}}],['message_stop',{}],
      ]) send(type,{type,...payload})
      res.end()
    } else {
      let sequence = 0
      const event = (type,payload) => send(type,{type,sequence_number:sequence++,...payload})
      const content = {type:'output_text',text:'Synthetic answer',annotations:[]}, item = {id:'msg-fixture',type:'message',status:'completed',role:'assistant',content:[content]}
      const response = {id:'resp-fixture',object:'response',created_at:1,status:'in_progress',model:'fixture-model',output:[]}
      event('response.created',{response})
      event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}})
      event('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{...content,text:''}})
      event('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:content.text})
      event('response.output_item.done',{output_index:0,item})
      event('response.completed',{response:{...response,status:'completed',output:[item],usage:{input_tokens:12,output_tokens:3,total_tokens:15,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}})
      res.end()
    }
  })
  await new Promise(done=>server.listen(0,'127.0.0.1',done))
  try {
    const api = (await import(new URL('../../runtime/system/engine/node_modules/@earendil-works/pi-ai/dist/api/'+protocol+'.lazy.js',import.meta.url)))[factory]()
    const descriptor = {id:'fixture-model',name:'Fixture model',api:protocol,provider:'fixture',baseUrl:'http://127.0.0.1:'+server.address().port+(protocol==='anthropic-messages'?'':'/v1'),reasoning:true,input:['text'],contextWindow:16384,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:{supportsStore:false}}
    const profiles = new Map([['fixture',{displayName:'Fixture',configuredMaxTokens:new Map(),modelErrors:new Map(),streamIdleTimeoutMs:5000}]])
    const adapter = new PiAiAdapter({profiles:()=>profiles,resolveApiKey:async()=> 'synthetic-local-key'})
    // Fixed synthetic catalog; transport, history projection and parsing are the real installed implementations.
    adapter.snapshot = {profiles,models:{getModel:()=>descriptor,streamSimple:(...args)=>api.streamSimple(...args)}}
    const chunks = []
    for await (const chunk of adapter.stream({provider:'fixture',model:'fixture-model',reasoningEffort:'high',maxTokens:4096,signal:AbortSignal.timeout(5000),messages:[{role:'user',content:[{type:'text',text:'Synthetic question'}]}]})) chunks.push(chunk)
    assert.equal(new URL(received.path,'http://fixture').pathname,path); assert.equal(received.body.model,'fixture-model'); assert.equal(received.body.stream,true)
    assert.equal(received.headers.authorization || received.headers['x-api-key'], protocol==='anthropic-messages'?'synthetic-local-key':'Bearer synthetic-local-key')
    assert.ok(chunks.some(chunk=>chunk.type==='text-delta'&&chunk.text==='Synthetic answer'))
    assert.ok(chunks.some(chunk=>chunk.type==='finish'))
    if (protocol==='openai-completions') assert.equal(received.body.reasoning_effort,'high')
    if (protocol==='openai-responses') assert.equal(received.body.reasoning.effort,'high')
    if (protocol==='anthropic-messages') assert.equal(received.body.thinking.type,'enabled')
  } finally {server.closeAllConnections();await new Promise(done=>server.close(done))}
})
