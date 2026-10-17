import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'

const source = readFileSync(new URL('../overrides/host/index.js', import.meta.url), 'utf8')
const start = source.indexOf('var MODULE_FIELDS ='), end = source.indexOf('// src/latex-annotations.js', start)
assert.ok(start > 0 && end > start)
function runtime(outputs) {
  const requests = [], tools = { files: { get: async () => { throw new Error('unexpected file access') } }, inspect: async () => { throw new Error('unexpected inspection') } }
  const functions = vm.runInNewContext(source.slice(start, end) + '\n({assistWithDsh,validateModuleResult,validateModuleInput})', {
    object: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)), structuredClone, AbortSignal,
    validateWritingStyle: style => style ?? 'preserve', writingQualityPrompt: () => '保留已给事实与来源，不虚构来源。', randomUUID4: randomUUID,
    prepareAiCall: async () => ({config:{},stream:async function* (request) { requests.push(request); yield {type:'text-delta',text:outputs.shift()}; yield {type:'finish',reason:{kind:'end_turn'}} }}),
    abortableChunks: stream => stream, modelFailureMessage: () => '安全模型错误',
  })
  const context = { agentDefaultModel: { currentSelection: () => ({provider:'deepseek-official',model:'deepseek-flash'}) } }
  return { ...functions, requests, tools, context }
}

test('Word initial and JSON-repair calls retain ideal qualifiers, actual-patch instructions and exact synthetic source', async () => {
  const value = {summary:'改善表达，保留理想化条件。',patch:{body:'An ideal simulation was discussed. No hardware tests were performed.'},notes:'仅调整句首表达；保持被动语态和实物测试缺口。'}
  const env = runtime(['{"summary":', JSON.stringify(value)]), before = 'One ideal simulation was discussed. No hardware tests were performed.'
  const input = {module:'word',instruction:'Improve clarity. Preserve every limitation.',context:{fields:{body:before}}}
  const original = structuredClone(input), result = await env.assistWithDsh(env.context, input, env.tools)
  assert.equal(result.correctionAttempts,1);assert.equal(env.requests.length,2);assert.deepEqual(input,original)
  for(const request of env.requests) {
    assert.match(request.system,/保留原文的理想化（ideal）/);assert.match(request.system,/不能自行删除限定/)
    assert.match(request.system,/summary和notes只描述patch实际建议的改动/);assert.match(request.system,/正文仍为被动语态时不能声称已改为主动/)
    assert.equal(JSON.parse(request.messages[0].content[0].text).context.fields.body,before)
  }
  assert.match(JSON.parse(env.requests[1].messages[1].content[0].text).instruction,/遵守原始请求、全部系统规则及选区边界/)
  assert.equal(result.patch.body,value.patch.body)
})

test('AI cannot replace outside a Markdown selection, even with valid JSON and accurate notes', async () => {
  const body = 'Prefix\nAn ideal simulation.\nSuffix', selected = 'An ideal simulation.', start = body.indexOf(selected)
  const env = runtime([JSON.stringify({summary:'局部建议',patch:{body:'Changed prefix\nAn ideal simulation.\nSuffix'},notes:'仅调整选区。'})])
  const input = {module:'markdown',instruction:'只调整选区',context:{fields:{name:'Synthetic',body},selection:{start,end:start+selected.length,text:selected}}}
  await assert.rejects(env.assistWithDsh(env.context,input,env.tools),/超出选区/);assert.equal(env.requests.length,1)
})

test('Word pending revision targets remain rejected before any proposed tracked edit can be returned', async () => {
  const env = runtime([]), request = {module:'word',context:{fields:{findText:'An ideal simulation.',replaceText:'An idealized simulation.',tracked:true}}}
  const evidence = [{kind:'docx',paragraphs:[{text:'An ideal simulation.',hasPendingRevisions:true}],tables:[],revisionTargets:['An ideal simulation.'],hasPendingRevisions:true}]
  await assert.rejects(env.validateModuleResult({summary:'建议',patch:{replaceText:'An idealized simulation.'},notes:'保留理想化条件。'},request,{files:env.tools.files,evidence}),/未接受的Word修订/)
})

test('Word-only injected fields cannot pass validation or cause a JSON repair retry', async () => {
  const env = runtime([JSON.stringify({summary:'建议',patch:{sourceId:'another-source',body:'An ideal simulation.'},notes:'仅建议。'})])
  await assert.rejects(env.assistWithDsh(env.context,{module:'word',instruction:'润色',context:{fields:{body:'An ideal simulation.'}}},env.tools),/板块外字段/)
  assert.equal(env.requests.length,1)
})
test('unchanged Word and Markdown patches become accurate no-change summaries without mutating the model response', async () => {
  for(const module of ['word','markdown']) {
    const env=runtime([]),fields={body:'An ideal simulation was discussed. No hardware tests were performed.'};
    const value={summary:'删除了填充表达。',patch:{...fields},notes:'原文未改；保留理想化限定和被动语态。'},original=structuredClone(value);
    const result=await env.validateModuleResult(value,{module,context:{fields}},{files:env.tools.files});
    assert.equal(Object.keys(result.patch).length,0);assert.equal(result.summary,'本次未建议修改，当前内容保持不变。');assert.equal(result.notes,value.notes);assert.deepEqual(value,original)
  }
})
test('real writing changes and empty research plans retain their actual model summaries', async () => {
  const env=runtime([]),changed={summary:'仅调整句首。',patch:{body:'An ideal simulation was discussed.'},notes:'未改为主动语态。'};
  assert.equal(await env.validateModuleResult(changed,{module:'word',context:{fields:{body:'One ideal simulation was discussed.'}}},{files:env.tools.files}),changed)
  const research={summary:'尚无结果，提出检索计划。',patch:{},notes:'非已执行结果。'};
  assert.equal(await env.validateModuleResult(research,{module:'research',context:{fields:{query:'synthetic',sources:['arxiv'],limit:'3'}}},{files:env.tools.files}),research)
})

test('the actual invented We edit is rejected before a writing candidate is returned, without retry or mutation', async () => {
  const before='An ideal simulation was discussed. No hardware tests were performed.';
  const value={summary:'改主动语态。',patch:{body:'We discussed an ideal simulation. We performed no hardware tests.'},notes:'请作者确认We。'};
  for(const module of ['word','markdown']) {
    const input={module,instruction:'Improve clarity in English, preserving all facts.',context:{fields:{body:before}}},original=structuredClone(input),env=runtime([JSON.stringify(value)]);
    await assert.rejects(env.assistWithDsh(env.context,input,env.tools),/原文未提供的第一人称执行者/);
    assert.equal(env.requests.length,1);assert.deepEqual(input,original);
  }
})

test('known first-person sources and explicit positive identity instructions remain editable', async () => {
  const value={summary:'仅改善表达。',patch:{body:'We discussed an ideal simulation. We performed no hardware tests.'},notes:'保持已给身份与限定。'};
  for(const [body,instruction] of [['We discussed one ideal simulation. No hardware tests were performed.','Polish.'],['我们讨论了一个理想仿真，未开展硬件测试。','Translate into English.'],['An ideal simulation was discussed. No hardware tests were performed.','Use We as the explicitly identified authors.'],['An ideal simulation was discussed. No hardware tests were performed.','用第一人称，我们是本文作者。'],['An ideal simulation was discussed. No hardware tests were performed.','Do not change the facts. Use We as the explicitly identified authors.']]) {
    const env=runtime([JSON.stringify(value)]),result=await env.assistWithDsh(env.context,{module:'word',instruction,context:{fields:{body}}},env.tools);
    assert.equal(result.patch.body,value.patch.body);assert.equal(env.requests.length,1);
  }
})

test('a negated identity instruction does not authorize We; advisory We is outside the factual-action guard', async () => {
  const env=runtime([]),body='An ideal simulation was discussed.';
  const value={summary:'建议',patch:{body:'We discussed an ideal simulation.'},notes:''};
  for(const instruction of ['Do not use We.','不要用第一人称。',"Don't ever use We.",'Do not ever use We.','Avoid using We.','Never change to first person.','Using We is not allowed.','Using first-person is forbidden.','使用第一人称是不允许的。','避免使用第一人称。']) await assert.rejects(env.validateModuleResult(value,{module:'word',instruction,context:{fields:{body}}},{files:env.tools.files}),/原文未提供的第一人称执行者/);
  const advisory={summary:'下一步建议',patch:{body:'We should check the assumptions.'},notes:'建议，不声称已执行。'};
  assert.equal(await env.validateModuleResult(advisory,{module:'word',instruction:'Draft a checking suggestion.',context:{fields:{body}}},{files:env.tools.files}),advisory);
})

test('provided Chinese singular identity translates to I, while changing singular and plural actors requires an explicit instruction', async () => {
  const env=runtime([]),singular={summary:'翻译',patch:{body:'I measured twice.'},notes:'保留我与两次测量。'},plural={summary:'润色',patch:{body:'We measured twice.'},notes:'保留事实。'};
  assert.equal(await env.validateModuleResult(singular,{module:'word',instruction:'Translate into English.',context:{fields:{body:'我进行了两次测量。'}}},{files:env.tools.files}),singular);
  await assert.rejects(env.validateModuleResult(plural,{module:'word',instruction:'Preserve every fact.',context:{fields:{body:'I measured twice.'}}},{files:env.tools.files}),/原文未提供的第一人称执行者/);
  await assert.rejects(env.validateModuleResult(singular,{module:'word',instruction:'Preserve every fact.',context:{fields:{body:'We measured twice.'}}},{files:env.tools.files}),/原文未提供的第一人称执行者/);
  assert.equal(await env.validateModuleResult(plural,{module:'word',instruction:'Use We as the explicitly identified authors.',context:{fields:{body:'I measured twice.'}}},{files:env.tools.files}),plural);
})
