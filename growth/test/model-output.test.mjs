import test from 'node:test';
import assert from 'node:assert/strict';
import {compactResearchOutput,compactResearchResult,conciseResearchChoice} from '../overrides/host/model-output.mjs';

test('repeated output shrinks without truncating unique qualifications or citations',()=>{
  const statement={text:'仅在指定数据集上成立。'.repeat(80),kind:'model_inference',evidenceIds:['p1e1','p1e1']};
  const different={...statement,text:'尚未验证其他数据集。',evidenceIds:['p2e1']};
  const input={papers:[{claims:[...Array(100).fill(statement),different]}],readRequests:[]};
  const original=JSON.stringify(input),result=compactResearchOutput('analysis',input);
  assert.ok(original.length>60000);assert.ok(JSON.stringify(result).length<original.length/20);
  assert.deepEqual(result.papers[0].claims,[{...statement,evidenceIds:['p1e1']},different]);
  assert.equal(JSON.stringify(input),original);
});
test('output reduction leaves invalid structural duplicates and unknown citations detectable',()=>{
  const paper={paperId:'a',claims:[{text:'x',evidenceIds:['unknown']}],readRequests:[{pages:[1,1]}]};
  const input={papers:[paper,paper],comparisons:[{paperIds:['a','a'],evidenceIds:['unknown']}],readRequests:[{pages:[1,1]}]};
  assert.deepEqual(compactResearchOutput('analysis',input),input);
});
test('source pages and evidence are never changed by the result reducer',()=>{
  const input={pages:[{text:'x'},{text:'x'}],evidenceIds:['e1','e1']};
  assert.equal(compactResearchOutput('source',input),input);
});
test('brief result returns referenced evidence and preserves the complete export source',()=>{
  const manifest=Array.from({length:2000},(_,i)=>({citationId:'e'+i,quote:'完整原文'.repeat(30)}));
  const result={analysis:{papers:[{conditions:{dataset:{evidenceIds:['e2']}}}]},synthesis:{draft:[{evidenceIds:['e8']}]},review:{semanticAssessments:[{evidenceId:'e9'}]},evidenceManifest:manifest};
  const brief=compactResearchResult(result);
  assert.deepEqual(brief.evidenceManifest.map(e=>e.citationId),['e2','e8','e9']);
  assert.ok(JSON.stringify(brief).length<JSON.stringify(result).length/100);
  assert.equal(result.evidenceManifest.length,2000);assert.equal(brief.synthesis,result.synthesis);
  assert.equal(compactResearchResult(null),null);
});
test('concise output preserves explicit and model-default reasoning without downgrading it',()=>{
  const choice={provider:'fixture',model:'fixture',reasoningEffort:'high'},info={reasoning:{efforts:[{id:'off'},{id:'low'},{id:'high'}]}};
  assert.deepEqual(conciseResearchChoice(choice,info),choice);
  assert.equal(choice.reasoningEffort,'high');
  assert.deepEqual(conciseResearchChoice({...choice,reasoningEffort:'off'},info),{...choice,reasoningEffort:'off'});
  assert.deepEqual(conciseResearchChoice(choice),choice);
  assert.equal(conciseResearchChoice(choice,{reasoning:{efforts:[{id:'medium'}]}}).reasoningEffort,'high');
  assert.deepEqual(conciseResearchChoice({provider:'fixture',model:'fixture'},info),{provider:'fixture',model:'fixture'});
});
