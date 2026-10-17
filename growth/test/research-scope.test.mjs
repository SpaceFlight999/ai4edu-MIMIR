import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function stageCall(captured){
  const source=readFileSync(new URL('../overrides/host/unified.js',import.meta.url),'utf8'),start=source.indexOf('  async call(stage, run, signal, payload)'),end=source.indexOf('  async execute(run, signal)',start);
  assert.ok(start>=0&&end>start);
  const call=vm.runInNewContext('({'+source.slice(start,end)+'}).call',{SYSTEM2:'Research contract',SCHEMAS:{synthesis:'existing schema',repair:'existing repair schema'},compactResearchRequest:request=>({payload:request,restore:value=>value}),compactResearchOutput:(_stage,value)=>value,clone:structuredClone,comparisonPolicy:()=>({}),bounded2:operation=>operation(),fail:(code,message)=>Object.assign(new Error(message),{code})});
  const model={metadata:{provider:'fixture'},generate:async request=>{captured.push(request);return{comparisons:[],gaps:[],draft:[]}}};
  return {call,active:new Map([['fixture',{model}]]),store:{event(){},save(){}}};
}
function run(paperIds){return{runId:'fixture',snapshot:paperIds.map(paperId=>({paperId})),input:{question:'仅根据选中材料写作',workflow:'synthesis-writing',budget:{maxOutputChars:1000}},metrics:{modelCalls:0,modelTimeMs:0}}}
test('single-paper synthesis and repair derive an explicit empty-comparison scope without weakening schemas',async()=>{
  for(const stage of['synthesis','repair']){
    const captured=[],runtime=stageCall(captured);
    await runtime.call(stage,run(['paper-a']),new AbortController().signal,{analysis:{papers:[{paperId:'paper-a'}]}});
    const request=captured[0];assert.match(request.system,/must have comparisons: \[\]/);assert.match(request.system,/including synthesis inside a repair response/);assert.match(request.system,/Do not invent another paperId or split one paper/);
    assert.deepEqual(Array.from(request.payload.context,p=>p.paperId),['paper-a']);assert.equal(request.payload.schema,stage==='synthesis'?'existing schema':'existing repair schema');
  }
});
test('derived scope counts distinct sources and keeps genuine multiple-paper comparisons available',async()=>{
  for(const [ids,single]of[[['paper-a','paper-a'],true],[['paper-a','paper-b'],false]]){
    const captured=[],runtime=stageCall(captured);await runtime.call('synthesis',run(ids),new AbortController().signal);
    assert.equal(captured[0].system.includes('must have comparisons: []'),single);
    if(!single)assert.match(captured[0].system,/only distinct paperIds from this selected scope/);
  }
});
