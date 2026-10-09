import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {comparisonPolicy,conservativeSynthesis} from '../overrides/host/model-comparison.mjs';
import {chineseError} from '../overrides/paper/viewer/session.mjs';
const source=readFileSync(new URL('../overrides/host/unified.js',import.meta.url),'utf8');
const validators=vm.runInNewContext(source.slice(source.indexOf('var RuntimeError ='),source.indexOf('function checkReview('))+'\n({checkAnalysis,checkSynthesis})');
function fixture(){
  const snapshot=['a','b'].map(paperId=>({paperId,title:paperId,evidence:[{paperId,citationId:paperId+'::e'}]}));
  const analysis={papers:snapshot.map(p=>({paperId:p.paperId,claims:[{text:'单篇结果仅在其报告条件下成立。',kind:'author_conclusion',evidenceIds:[p.paperId+'::e']}],methods:[],limitations:[],criticalQuestions:[],conditions:Object.fromEntries(['dataset','metric','protocol'].map(key=>[key,{value:'same-'+key,evidenceIds:[p.paperId+'::e']}]))})),readRequests:[]};
  const synthesis={comparisons:[{paperIds:['a','b'],comparable:true,reason:'same conditions',conclusion:'UNSAFE_RANKING',evidenceIds:['a::e','b::e']}],gaps:[{text:'UNSAFE_RANKING',kind:'model_inference',evidenceIds:[]}],draft:[{text:'UNSAFE_RANKING',kind:'model_inference',evidenceIds:['a::e','b::e']}]};
  return {snapshot,analysis,synthesis};
}
test('verified identical conditions still permit comparison without changing output',()=>{
  const {snapshot,analysis,synthesis}=fixture();assert.equal(validators.checkAnalysis(analysis,snapshot),analysis);assert.equal(validators.checkSynthesis(synthesis,analysis,snapshot),synthesis);
});
test('different and unknown conditions produce conservative cited prose, never just flip a flag',()=>{
  for(const value of [null,'different-dataset']){
    const {snapshot,analysis,synthesis}=fixture();analysis.papers[1].conditions.dataset.value=value;
    const original=JSON.stringify(synthesis);let failure;
    try{validators.checkSynthesis(synthesis,analysis,snapshot);}catch(error){failure=error;}
    assert.equal(failure.code,'INCOMPARABLE_RANKING');assert.equal(JSON.stringify(failure.comparisonIndexes),'[0]');
    const limited=conservativeSynthesis(synthesis,analysis,snapshot,failure.comparisonIndexes);
    assert.equal(validators.checkSynthesis(limited.synthesis,analysis,snapshot),limited.synthesis);
    assert.equal(limited.synthesis.comparisons[0].comparable,false);assert.equal(limited.issues[0].code,'INCOMPARABLE_RANKING');
    assert.match(limited.synthesis.draft.at(-1).text,/不能.*排名/);assert.doesNotMatch(JSON.stringify(limited),/UNSAFE_RANKING/);
    for(const paper of analysis.papers)assert.ok(limited.synthesis.draft.some(row=>row.text===paper.claims[0].text&&row.kind==='author_conclusion'&&row.evidenceIds[0]===paper.paperId+'::e'));
    assert.equal(JSON.stringify(synthesis),original);
  }
});
test('unsafe first comparison cannot hide an invalid reference in a later row or draft',()=>{
  const {snapshot,analysis,synthesis}=fixture();analysis.papers[1].conditions.dataset.value=null;
  synthesis.comparisons.push({...synthesis.comparisons[0],evidenceIds:['a::e','invented']});
  assert.throws(()=>validators.checkSynthesis(synthesis,analysis,snapshot),error=>error.code==='INVALID_CITATION');
  synthesis.comparisons.pop();synthesis.draft[0].evidenceIds=['invented'];
  assert.throws(()=>validators.checkSynthesis(synthesis,analysis,snapshot),error=>error.code==='INVALID_CITATION');
});
test('unsafe comparison cannot hide unselected papers or a malformed later row',()=>{
  const {snapshot,analysis,synthesis}=fixture();analysis.papers[1].conditions.dataset.value=null;
  synthesis.comparisons.push({...synthesis.comparisons[0],paperIds:['a','outside']});
  assert.throws(()=>validators.checkSynthesis(synthesis,analysis,snapshot),error=>error.code==='SCOPE_DENIED');
  synthesis.comparisons[1]={...synthesis.comparisons[0],reason:''};
  assert.throws(()=>validators.checkSynthesis(synthesis,analysis,snapshot),error=>error.code==='INVALID_ARGUMENT');
});
test('conservative draft preserves a maximum-length source statement without truncation',()=>{
  const {snapshot,analysis,synthesis}=fixture();analysis.papers[0].claims[0].text='原'.repeat(12000);analysis.papers[1].conditions.metric.value=null;
  const limited=conservativeSynthesis(synthesis,analysis,snapshot,[0]);
  validators.checkSynthesis(limited.synthesis,analysis,snapshot);assert.ok(limited.synthesis.draft.some(row=>row.text===analysis.papers[0].claims[0].text));
});
test('comparison policy handles malformed analysis awaiting repair without failing the transport',()=>{
  assert.deepEqual(comparisonPolicy({papers:[null,{}]}).papers.map(p=>p.conditions),[{dataset:null,metric:null,protocol:null},{dataset:null,metric:null,protocol:null}]);
  const {analysis}=fixture(),original=JSON.stringify(analysis);assert.equal(comparisonPolicy(analysis).papers[0].conditions.metric,'same-metric');assert.equal(JSON.stringify(analysis),original);
});
test('comparison failures explain validation rather than blaming model settings or network',()=>{
  assert.match(chineseError({code:'INCOMPARABLE_RANKING'}),/数据集.*校验/);
  for(const code of ['INCOMPARABLE_RANKING','SCOPE_DENIED','INVALID_ARGUMENT','INTERRUPTED'])assert.doesNotMatch(chineseError({code}),/检查模型设置|连接后|网络/);
});
