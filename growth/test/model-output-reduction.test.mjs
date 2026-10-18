import test from 'node:test'
import assert from 'node:assert/strict'
import { checkedModelOutputStream, outputReductionInstruction } from '../overrides/app/model-output-reduction.mjs'

class LlmError extends Error { constructor(message, code) { super(message); this.code = code } }
const native = { LlmError, createUserMessage: input => ({...input,role:'user'}) }
const options = { messages: [{role:'user',content:[{type:'text',text:'原问题与逐字证据保持不变。'}]}] }
const collect = async source => {const chunks=[];for await(const chunk of source)chunks.push(chunk);return chunks}
async function* response(text, kind='stop') {yield {type:'text-delta',text};yield {type:'finish',reason:{kind}}}

for (const [purpose, size] of [['mimir-workbench-edit',40000],['mimir-workbench-assist',160000],[undefined,100000]]) {
  test(`${purpose??'paper/chat'} regenerates on its character budget even with a normal finish`, async()=>{
    let calls=0
    const result=await collect(checkedModelOutputStream({...options,purpose},()=>response('x'.repeat(size+1)),async request=>{
      calls++;assert.equal(request.messages[0],options.messages[0]);assert.match(request.messages.at(-1).content[0].text,/maxProseChars=3000/)
      return response('完整、保留条件的简短结论。')
    },native))
    assert.equal(calls,1);assert.equal(result[0].text,'完整、保留条件的简短结论。')
  })
}

test('growth calls keep their stricter output budget', async()=>{
  let calls=0
  const result=await collect(checkedModelOutputStream({...options,messages:[{...options.messages[0],source:{kind:'mimir-growth'}}]},()=>response('x'.repeat(60001)),async()=>{calls++;return response('{"result":"完整"}')},native))
  assert.equal(calls,1);assert.equal(result[0].text,'{"result":"完整"}')
})

test('discarded partial tool calls never execute or appear in the completed response', async()=>{
  async function* partial(){yield {type:'tool-call-start',id:'discarded'};yield {type:'tool-call-delta',arguments:'{"incomplete":'};yield {type:'finish',reason:{kind:'max-tokens'}}}
  const result=await collect(checkedModelOutputStream(options,partial,async()=>response('仅完整回复。'),native))
  assert.deepEqual(result,[{type:'text-delta',text:'仅完整回复。'},{type:'finish',reason:{kind:'stop'}}])
})

test('complete native tool streams keep their identities without regeneration', async()=>{
  const chunks=[{type:'tool-call-start',id:'valid'},{type:'tool-call-end',id:'valid'},{type:'finish',reason:{kind:'tool-calls'}}]
  async function* source(){yield* chunks}
  const result=await collect(checkedModelOutputStream(options,source,()=>{throw Error('unexpected retry')},native))
  assert.ok(result.every((row,i)=>row===chunks[i]))
})

test('authentication, network and invalid JSON do not trigger output-limit regeneration', async()=>{
  for(const code of ['AUTH','RATE_LIMIT','STREAM_CLOSED','MODEL_NETWORK']) {
    let calls=0
    async function* source(){throw new LlmError('fixture',code)}
    await assert.rejects(collect(checkedModelOutputStream(options,source,()=>{calls++},native)),error=>error.code===code)
    assert.equal(calls,0)
  }
  assert.equal((await collect(checkedModelOutputStream(options,()=>response('{invalid'),()=>{throw Error('unexpected retry')},native)))[0].text,'{invalid')
})

test('cancellation while a stream stalls interrupts the owned attempt without retries', async()=>{
  const controller=new AbortController();let attempts=0,closed=0
  const source=()=>({[Symbol.asyncIterator]:()=>({next:()=>new Promise(()=>{}),return:()=>{closed++;return Promise.resolve({done:true})}})})
  const pending=collect(checkedModelOutputStream({...options,signal:controller.signal},source,()=>{attempts++},native))
  setTimeout(()=>controller.abort(new Error('cancelled fixture')),10)
  await assert.rejects(pending,/cancelled fixture/);await new Promise(done=>setImmediate(done))
  assert.equal(attempts,0);assert.equal(closed,1)
})

test('all reduction levels strictly decrease prose targets and keep mandatory source and schema rules',()=>{
  const targets=Array.from({length:6},(_,i)=>outputReductionInstruction(i+1))
  const sizes=targets.map(text=>Number(text.match(/maxProseChars=(\d+)/)[1]))
  assert.ok(sizes.every((size,i)=>i===0||size<sizes[i-1]))
  assert.ok(targets.every(text=>/全部必填字段、逐项核对、指定主题/.test(text)&&/不能截断句子、代码、公式或 JSON/.test(text)))
})

test('caller cancellation and deadline are reused across attempts without adding a shorter timeout', async t=>{
  t.mock.method(AbortSignal,'timeout',()=>{throw new Error('unexpected shorter deadline')})
  const controller=new AbortController()
  const result=await collect(checkedModelOutputStream({...options,signal:controller.signal},()=>response('discarded','max-tokens'),async request=>{
    assert.equal(request.signal,controller.signal);return response('完整结果')
  },native))
  assert.equal(result[0].text,'完整结果')
})

test('calls without a signal keep native timing rather than adding an unpropagated deadline', async t=>{
  t.mock.method(AbortSignal,'timeout',()=>{throw new Error('unexpected unpropagated deadline')})
  const result=await collect(checkedModelOutputStream(options,()=>response('完整结果'),()=>{throw Error('unexpected retry')},native))
  assert.equal(result[0].text,'完整结果')
})
