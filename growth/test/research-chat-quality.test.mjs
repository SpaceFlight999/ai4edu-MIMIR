import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {checkedResearchChatStream,researchChatConstraint,researchChatIssues} from '../overrides/app/research-chat-quality.mjs'
const require=createRequire(new URL('../../runtime/system/engine/package.json',import.meta.url))
const native=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href)
const question='已知二连杆均为1米、角均为0度，末端(2,0)米。请用中文最多120字解释参考系、限制与一个核查步骤。不要调用工具。'
const options=Object.freeze({provider:'deepseek-official',model:'deepseek-flash',messages:[native.createSystemMessage('你是 Mimir 科研助手。'),native.createUserMessage({content:[{type:'text',text:question}],source:{kind:'test'}})]})
async function* response(text){yield{type:'text-delta',text};yield{type:'finish',reason:{kind:'stop'}}}
const collect=async source=>{const rows=[];for await(const row of source)rows.push(row);return rows}
test('complete Unicode reply count includes punctuation, formula, spaces and supplementary characters',()=>{
  assert.equal(researchChatConstraint(options).limit,120)
  assert.equal(researchChatConstraint({...options,messages:[...options.messages,native.createUserMessage({content:[{type:'text',text:'Current runtime state'}],source:{kind:'runtime-context'}})]}).limit,120)
  assert.equal(researchChatConstraint({...options,messages:[native.createDeveloperMessage({content:[{type:'text',text:'你是 Mimir 科研助手。'}]}),options.messages[1]]}).limit,120)
  assert.equal(researchChatIssues('😀'.repeat(120),{...researchChatConstraint(options),onlyGivenCoordinates:false}).length,0)
  assert.match(researchChatIssues('😀'.repeat(120)+' ',researchChatConstraint(options))[0],/121个Unicode/)
  assert.equal(researchChatConstraint({...options,messages:[native.createUserMessage({content:[{type:'text',text:question}],source:{kind:'test'}})]}),null)
})
test('observed new unverified coordinates are blocked while given coordinates and input-only suggestions remain valid',()=>{
  const constraint=researchChatConstraint(options)
  assert.match(researchChatIssues('相对角90°/90°时末端(0,2)米。',constraint)[0],/新增/)
  assert.equal(researchChatIssues('θ₁相对基座+x轴，θ₂相对第一杆。零位末端(2,0)米。可先预测90°/90°的末端，再用投影相加核对。',constraint).length,0)
  assert.match(researchChatIssues('两角都按x轴起算。零位(2,0)，先核查投影。',constraint)[0],/θ₂相对第一杆/)
})
test('a bounded full regeneration emits only the corrected complete reply and preserves native message identities',async()=>{
  let repairs=0;const before=JSON.stringify(options),valid='θ₁相对+x轴，θ₂相对第一杆；零位末端(2,0)米。纸笔结果不代表实物验证。先画两杆，再核对投影相加。'
  const rows=await collect(checkedResearchChatStream(options,()=>response('长'.repeat(159)),async request=>{
    repairs++;assert.equal(request.messages.length,4);assert.equal(request.messages[0],options.messages[0]);assert.equal(request.messages[1],options.messages[1]);assert.equal(request.messages[2].role,'assistant');assert.match(request.messages[3].content[0].text,/上限是120字/);assert.match(request.messages[3].content[0].text,/目标最多78字/);assert.ok(request.signal);return response(valid)
  },native))
  assert.equal(repairs,1);assert.equal(rows[0].text,valid);assert.equal(rows.at(-1).reason.kind,'stop');assert.equal(JSON.stringify(options),before)
})
test('a second invalid answer fails before any invalid text is emitted and no third call is possible',async()=>{
  let repairs=0,emitted=[]
  await assert.rejects(async()=>{for await(const row of checkedResearchChatStream(options,()=>response('长'.repeat(159)),async()=>{repairs++;return response('长'.repeat(159))},native))emitted.push(row)},error=>error.code==='RESEARCH_REPLY_INVALID')
  assert.equal(repairs,1);assert.deepEqual(emitted,[])
})
test('tool and unsuccessful native streams retain their original events and do not trigger content regeneration',async()=>{
  let repairs=0
  async function* tool(){yield{type:'tool-call-start',id:'fixture'};yield{type:'finish',reason:{kind:'tool-calls'}}}
  const rows=await collect(checkedResearchChatStream(options,tool,()=>{repairs++;throw Error('unexpected')},native))
  assert.equal(rows[0].type,'tool-call-start');assert.equal(repairs,0)
})
