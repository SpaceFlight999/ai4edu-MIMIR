import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

function reader(responses = [], captured = []) {
  const source = readFileSync(new URL('../overrides/host/unified.js', import.meta.url), 'utf8');
  const start = source.indexOf('var SYSTEM ='), end = source.indexOf('function makeResearchTools(', start);
  const provenanceHelper = source.slice(source.indexOf('function researchMetadataReason('), source.indexOf('function distinctResearchStatements('));
  let calls = 0;
  const api = vm.runInNewContext(provenanceHelper + source.slice(start, end) + '\n({validateClaims, analyze})', {
    PaperError: class PaperError extends Error { constructor(code, message) { super(message); this.code = code; } },
    randomUUID4: randomUUID,
    awaitWithSignal: operation => operation(),
    callModel: async (...args) => { captured.push({prompt:args[2],system:args[4]}); return responses[calls++]; },
  });
  return api;
}
const evidence = [{ evidenceId: 'source-1', page: 1, quote: '实验报告中的准确率为195%，此数据需要人工进一步核验。' }];
const claim = (overrides = {}) => ({ topic: '实验', kind: '作者主张', text: '准确率为195%。', evidence: [{ evidenceId: 'source-1', quote: evidence[0].quote }], ...overrides });
const check = (overrides = {}) => ({ id: 'claim-0', supported: true, missingDetails: [], reason: '逐字引文支持当前陈述。', ...overrides });
function analyze(responses) {
  return reader(responses).analyze({ llm: {}, choice: { provider: 'fixture', model: 'fixture' }, evidence,
    paper: { paperId: 'paper-1', sourceSha256: 'fixture', version: 1, parserVersion: 'fixture' }, signal: new AbortController().signal });
}

test('paper numeric support compares whole values rather than matching a substring', () => {
  const api = reader();
  assert.equal(api.validateClaims([claim({ text: '准确率为95%。' })], evidence)[0].support, '原文未找到');
  assert.equal(api.validateClaims([claim()], evidence)[0].support, '待核实');
  for (const [reported, asserted] of [['-3', '3'], ['1e-3', '3']]) {
    const rows = [{ ...evidence[0], quote: `当前实验报告的测量值为${reported}，结果仅适用于此条件。` }];
    const row = claim({ text: `测量值为${asserted}。`, evidence: [{ evidenceId: 'source-1', quote: rows[0].quote }] });
    assert.equal(api.validateClaims([row], rows)[0].support, '原文未找到');
  }
});

test('malformed claims, declared citations and unknown categories are rejected before saving', () => {
  const api = reader();
  for (const row of [null, claim({ kind: '已证明的事实' }), claim({ evidence: [null] }),
    claim({ evidence: [{ evidenceId: 'unselected', quote: evidence[0].quote }] }),
    claim({ evidence: [{ evidenceId: 'source-1', quote: '这句话不在任何所选原文中。' }] }), claim({ evidence: 'not-an-array' })]) {
    assert.throws(() => api.validateClaims([row], evidence), error => error.code === 'MODEL_OUTPUT_INVALID');
  }
});

test('guide distinguishes a bounded missing-detail explanation from an unsupported author absence claim', () => {
  const api=reader(), rows=[{evidenceId:'source-1',page:1,quote:'This paper studies a simple measurement system.'}];
  const item=text=>claim({kind:'系统解释',text,evidence:[{evidenceId:'source-1',quote:rows[0].quote}]});
  assert.doesNotThrow(()=>api.validateClaims([item('本次材料未提供结果、数值或真实设备条件，当前引文不足以确认。')],rows));
  assert.throws(()=>api.validateClaims([item('作者未报告真实设备验证。')],rows),error=>error.code==='MODEL_OUTPUT_INVALID');
  assert.throws(()=>api.validateClaims([item('若干行均标注method evidence。')],rows),error=>error.code==='MODEL_OUTPUT_INVALID');
});

test('guide performs one complete repair before reviewing and never silently accepts a second invalid claim', async()=>{
  const bad=claim({kind:'系统解释',text:'作者未报告真实设备验证。'}),good=claim();
  const captured=[],api=reader([{claims:[bad]},{claims:[good]},{checks:[check()]}],captured);
  const result=await api.analyze({llm:{},choice:{provider:'fixture',model:'fixture'},evidence,paper:{paperId:'p',version:1,sourceSha256:'s',parserVersion:'fixture'},signal:new AbortController().signal});
  assert.equal(result.claims[0].text,good.text);assert.equal(captured.length,3);
  await assert.rejects(analyze([{claims:[bad]},{claims:[bad]}]),error=>error.code==='MODEL_OUTPUT_INVALID');
});

test('semantic review requires one valid check for each claim and rejects duplicate approvals', async () => {
  await assert.rejects(analyze([null]), error => error.code === 'MODEL_OUTPUT_INVALID');
  for (const checks of [[check({ supported: false, reason: '没有支持。' }), check()], [], [check({ id: 'unknown' })],
    [check({ supported: 'true' })], [check({ missingDetails: [null] })], [check({ reason: '' })]]) {
    await assert.rejects(analyze([{ claims: [claim()] }, { checks }]), error => error.code === 'MODEL_OUTPUT_INVALID');
  }
});

test('valid semantic review preserves uncertainty and cannot promote external knowledge to a paper fact', async () => {
  const supported = await analyze([{ claims: [claim()] }, { checks: [check()] }]);
  assert.equal(supported.claims[0].support, '模型复核支持');
  const missing = await analyze([{ claims: [claim()] }, { checks: [check({ supported: false, missingDetails: ['实验条件缺失。'] })] }]);
  assert.equal(missing.claims[0].support, '待核实');
  const external = await analyze([{ claims: [claim({ kind: '外部知识', text: '这是一条待核实的背景说明。', evidence: [] })] }, { checks: [check()] }]);
  assert.equal(external.claims[0].support, '原文未找到');
});

test('body citations cannot promote processing metadata even when the model reviewer approves it', async () => {
  const row = claim({text:'本次材料未提供真实设备性能，覆盖报告提示仅第1页可读。'});
  const result = await analyze([{claims:[row]},{checks:[check()]}]);
  assert.equal(result.claims[0].support,'原文未找到');
  assert.match(result.claims[0].reviewReason,/系统元信息/);
  const quotes = [{evidenceId:'source-1',quote:'覆盖报告指出仅第1页可读。这是作者对旧资料处理范围的明确说明。'}];
  const valid = reader().validateClaims([{...row,text:'覆盖报告指出仅第1页可读。',evidence:[{evidenceId:'source-1',quote:quotes[0].quote}]}],quotes)[0];
  assert.equal(valid.support,'待核实');
});

test('a completed review replaces the default pending explanation while preserving actual source failures',async()=>{
  const reason='核查动作属于研究建议，无原文来源，仍需另行验证。';
  const result=await analyze([{claims:[claim({kind:'研究建议',text:'请核验真实设备上的验证条件。',evidence:[]})]},{checks:[check({supported:false,missingDetails:['建议不是作者结论。'],reason})]}]);
  assert.equal(result.claims[0].support,'原文未找到');
  assert.equal(result.claims[0].reviewReason,reason);
  const numeric=await analyze([{claims:[claim({text:'准确率为95%。'})]},{checks:[check({reason:'模型错误地认可了不同数值。'})]}]);
  assert.equal(numeric.claims[0].support,'原文未找到');
  assert.match(numeric.claims[0].reviewReason,/数值未见于/);
});
test('guide and independent review receive explicit JSON contracts for all four accepted kinds',async()=>{
  const kinds=['作者主张','系统解释','外部知识','研究建议'],captured=[];
  const claims=kinds.map(kind=>claim({kind,text:kind==='外部知识'||kind==='研究建议'?'请核验此项背景与复现条件。':'准确率为195%。',evidence:kind==='外部知识'||kind==='研究建议'?[]:claim().evidence}));
  const result=await reader([{claims},{checks:kinds.map((_,i)=>check({id:'claim-'+i}))}],captured).analyze({llm:{},choice:{provider:'fixture',model:'fixture'},evidence,paper:{paperId:'fixture',sourceSha256:'fixture',version:1,parserVersion:'fixture'},signal:new AbortController().signal});
  assert.equal(captured.length,2);
  const guideExample=JSON.parse(captured[0].system.match(/形状为 (\{[^\n]+?\})。topic/)[1]);
  assert.deepEqual(Object.keys(guideExample),['claims']);assert.deepEqual(Object.keys(guideExample.claims[0]),['topic','kind','text','evidence']);
  for(const kind of kinds)assert.ok(captured[0].system.includes('“'+kind+'”'));
  assert.match(captured[0].system,/最多8项是上限，不必凑满/);assert.match(captured[0].system,/不能填造数字/);
  assert.match(captured[0].system,/通常用2至4条不同论点/);
  assert.match(captured[0].system,/复杂论文或较宽问题可按实际内容增加/);
  assert.match(captured[0].system,/只有两条引文时至多描述这两条/);
  assert.match(captured[0].system,/不要输出无关行号或页数/);
  assert.match(captured[1].system,/语义复核请求则仅返回/);
  assert.equal(result.claims[2].support,'原文未找到');assert.equal(result.claims[3].support,'原文未找到');
});
