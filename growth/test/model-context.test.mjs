import test from 'node:test';
import assert from 'node:assert/strict';
import {compactResearchRequest} from '../overrides/host/model-context.mjs';
function fixture(){
  const text='未引证的引言。\n同一引文😀\n同一引文😀\n保留页尾。';
  return {stage:'analysis',question:'p1e1 是正文中的字符串',context:[{paperId:'paper-1',title:'p1e1',pageCount:2,authorizedPages:[1,2],pages:[{page:1,text},{page:2,text:'没有引用但仍须保留的完整页。'}],evidence:[1,2].map(i=>({citationId:'paper-1::original-evidence-'+i,page:1,quote:'同一引文😀',sourceSha256:'secret-source-hash',bbox:[.1,.2,.3,.4],confidenceState:'extracted'})),coverage:{readPages:[1,2],missingPages:[],warnings:['视觉内容未核实']}}]};
}
test('compact model input preserves all full pages, exact quotes, duplicate locations and uncertainty',()=>{
  const request=fixture(),before=JSON.stringify(request),{payload}=compactResearchRequest(request);
  assert.equal(JSON.stringify(request),before);assert.deepEqual(payload.context[0].pages,request.context[0].pages);
  for(const [i,ref] of payload.context[0].evidence.entries()){assert.equal(payload.context[0].pages[0].text.slice(ref.start,ref.end),request.context[0].evidence[i].quote);assert.equal(ref.confidenceState,'extracted');}
  assert.ok(payload.context[0].evidence[1].start>payload.context[0].evidence[0].start);
  assert.equal(payload.context[0].pages[1].text,request.context[0].pages[1].text);
  assert.deepEqual(payload.context[0].coverage.warnings,['视觉内容未核实']);
  assert.doesNotMatch(JSON.stringify(payload),/secret-source-hash|bbox|original-evidence/);
});
test('aliases round trip only citation fields and preserve unknown IDs for validation',()=>{
  const request=fixture();request.analysis={claims:[{text:'p1e1 不应被改写',evidenceIds:['paper-1::original-evidence-1']}]};
  const {payload,restore}=compactResearchRequest(request);
  assert.deepEqual(payload.analysis.claims[0].evidenceIds,['p1e1']);assert.equal(payload.analysis.claims[0].text,'p1e1 不应被改写');
  const result=restore({claims:[{text:'p1e1',evidenceIds:['p1e1','invented']}],semanticAssessments:[{evidenceId:'p1e2'}]});
  assert.equal(result.claims[0].text,'p1e1');assert.deepEqual(result.claims[0].evidenceIds,['paper-1::original-evidence-1','invented']);
  assert.equal(result.semanticAssessments[0].evidenceId,'paper-1::original-evidence-2');
  assert.equal(payload.question,request.question);assert.equal(payload.context[0].title,'p1e1');
});
test('compact context rejects a quote missing from its original page instead of inventing a location',()=>{
  const request=fixture();request.context[0].evidence[0].quote='其他页面的文本';
  assert.throws(()=>compactResearchRequest(request),{code:'QUOTE_LOCATION_INVALID'});
});
