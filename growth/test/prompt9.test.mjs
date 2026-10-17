import {normalizeWorkbenchImport} from '../overrides/host/workbench-import-format.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {compactResearchRequest} from '../overrides/host/model-context.mjs';
import {compactResearchOutput} from '../overrides/host/model-output.mjs';
import {comparisonPolicy} from '../overrides/host/model-comparison.mjs';
import {jumpToSection} from '../overrides/paper/viewer/reader-ui.mjs';

const source=readFileSync(new URL('../overrides/host/unified.js',import.meta.url),'utf8');
const validatorStart=source.indexOf('var RuntimeError =');
const validators=vm.runInNewContext(source.slice(validatorStart,source.indexOf('// ../research-runtime/src/store.mjs',validatorStart))+'\n({fail,clone})');
const prompts=vm.runInNewContext(source.slice(source.indexOf('var SYSTEM2 ='),source.indexOf('var freeze ='))+'\n({SYSTEM2,SCHEMAS})');
const call=vm.runInNewContext('({'+source.slice(source.indexOf('  async call(stage, run, signal, payload)'),source.indexOf('  async execute(run, signal)'))+'}).call',{...validators,...prompts,compactResearchRequest,compactResearchOutput,comparisonPolicy,bounded2:operation=>operation()});
const clone=value=>JSON.parse(JSON.stringify(value));
test('result navigation opens its target disclosure as well as folded ancestors',()=>{
  const previous=globalThis.matchMedia;globalThis.matchMedia=()=>({matches:true});let scrolled=false,focused=false;
  try{
    const parent={tagName:'DETAILS',open:false,parentElement:null};
    const target={tagName:'DETAILS',open:false,parentElement:parent,scrollIntoView:()=>{scrolled=true;},focus:()=>{focused=true;}};
    jumpToSection(target);assert.equal(target.open,true);assert.equal(parent.open,true);assert.ok(scrolled&&focused);
  }finally{if(previous===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=previous;}
});
const snapshot={paperId:'paper-a',title:'Synthetic.pdf',version:1,sourceSha256:'sha',parserVersion:'v1',snapshotSha256:'snapshot',trust:'fixture',pageCount:1,pages:[{page:1,text:'A synthetic paper studies a simple measurement system.'}],evidence:[{paperId:'paper-a',evidenceId:'e1',citationId:'paper-a::e1',page:1,quote:'A synthetic paper studies a simple measurement system.'}],coverage:{readPages:[1],missingPages:[],warnings:[]}};
function fixture(generate,maxOutputChars=60000){
  const requests=[],events=[];
  const model={generate:async request=>{requests.push(clone({...request,signal:undefined}));return generate(request);},metadata:{provider:'fixture',model:'fixture'}};
  return {requests,events,runtime:{call,active:new Map([['run',{model}]]),store:{event:(_,type,data)=>events.push({type,data}),save(){}}},run:{runId:'run',snapshot:[clone(snapshot)],input:{question:'解释原文的研究对象',workflow:'synthesis-writing',budget:{maxOutputChars}},metrics:{modelCalls:0,modelTimeMs:0,repairs:0}}};
}
const limited=()=>Object.assign(new Error('output exhausted'),{code:'MODEL_OUTPUT_LIMIT'});

test('oversized research output recursively reduces its response target and preserves the complete original evidence',async()=>{
  const f=fixture(request=>{if(!request.payload.outputConstraints||request.payload.outputConstraints.level<3)throw limited();return {comparisons:[],gaps:[],draft:[{text:'研究一个测量系统。',kind:'original_fact',evidenceIds:['p1e1']}]};});
  const before=clone(f.run.snapshot);
  const result=await f.runtime.call('synthesis',f.run,new AbortController().signal);
  assert.equal(result.draft[0].evidenceIds[0],'paper-a::e1');
  assert.equal(f.requests.length,4);assert.equal(f.run.metrics.outputRetries,3);
  const constraints=f.requests.slice(1).map(row=>row.payload.outputConstraints);
  assert.ok(constraints.every((row,i)=>i===0||row.maxStatementChars<constraints[i-1].maxStatementChars));
  assert.ok(f.requests.slice(1).every(row=>row.system.includes('Regenerate the entire JSON object')));
  assert.deepEqual(f.run.snapshot,before);
  assert.equal(f.events.filter(event=>event.type==='output_reduction').length,3);
  // Transport retries do not consume the later semantic validation call budget.
  await f.runtime.call('synthesis',f.run,new AbortController().signal);
});

test('recursive reduction also handles a complete object over the explicit character budget',async()=>{
  const f=fixture(request=>({comparisons:[],gaps:[],draft:[{text:request.payload.outputConstraints?'简短结论':'长'.repeat(1000),kind:'model_inference',evidenceIds:[]}]}),300);
  const result=await f.runtime.call('synthesis',f.run,new AbortController().signal);
  assert.equal(result.draft[0].text,'简短结论');assert.equal(f.run.metrics.outputRetries,1);
});

test('reduction respects cancellation, never retries credentials failures and terminates at its minimum target',async()=>{
  const controller=new AbortController();
  const cancelled=fixture(request=>{if(request.payload.outputConstraints)controller.abort(new Error('cancelled by user'));throw limited();});
  await assert.rejects(cancelled.runtime.call('synthesis',cancelled.run,controller.signal),/cancelled by user/);
  assert.equal(cancelled.requests.length,2);
  const auth=fixture(()=>{throw Object.assign(new Error('auth'),{code:'MODEL_AUTH'});});
  await assert.rejects(auth.runtime.call('synthesis',auth.run,new AbortController().signal),error=>error.code==='MODEL_AUTH');
  assert.equal(auth.requests.length,1);
  const persistent=fixture(()=>{throw limited();});
  await assert.rejects(persistent.runtime.call('synthesis',persistent.run,new AbortController().signal),error=>error.code==='MODEL_OUTPUT_LIMIT');
  assert.equal(persistent.requests.length,7);
});

const writer=readFileSync(new URL('../overrides/host/index.js',import.meta.url),'utf8');
const start=writer.indexOf('  appendEvidenceNote('),end=writer.indexOf('  record(context2,',start);
const methods=vm.runInNewContext('({'+writer.slice(start,end).replace('\n  proposeResearchDraft(', ',\n  proposeResearchDraft(')+'})',{normalizeWorkbenchImport,sha:value=>createHash('sha256').update(value).digest('hex'),DocumentError:class extends Error{constructor(code,message){super(message);this.code=code;}},invalid:message=>{throw new Error(message);}});

test('research workbench proposal contains clean prose while retaining structured evidence for review and ownership checks',()=>{
  let proposal;
  const context={projectId:'project'},document={documentId:'doc',content:{type:'doc',content:[{type:'paragraph',attrs:{blockId:'block'},content:[{type:'text',text:'已有正文'}]}]}};
  const service={...methods,evidence:()=>[{quote:'SOURCE QUOTE MUST STAY OUT OF PROSE',title:'source',page:1,sha256:'sha',evidence_id:'core-e1'}],db:{prepare:()=>({get:()=>({evidence_id:'core-e1'})})},load:()=>document,transaction:fn=>fn(),previous:()=>null,remember(){},timestamp:()=> 'TIMESTAMP MUST STAY OUT',propose:(_,value)=>{proposal=value;return {changeSetId:'change',documentId:'doc'};}};
  const evidence={citationId:'paper-a::e1',paperId:'paper-a',paperVersion:1,sourceSha256:'sha',parserVersion:'v1',evidenceId:'e1',page:1,quote:'located quote',trust:'host'};
  const research={paper:()=>({paperId:'paper-a',version:1,sourceSha256:'sha',parserVersion:'v1'}),evidence:()=>[{evidenceId:'e1',quote:'located quote',page:1}]};
  const input={projectId:'project',runId:'run-technical-id',documentId:'doc',expectedVersion:1,generatedAt:'TIMESTAMP',evidenceManifest:[evidence],draft:{kind:'draft',synthesis:{draft:[{text:'\\u6d4b\\u91cf系统\uFFFD保留适用条件。',kind:'original_fact',evidenceIds:['paper-a::e1']},{text:'尚无法确认外推性能。',kind:'unknown',evidenceIds:[]}],comparisons:[],gaps:[]},analysis:{papers:[]},review:{issues:[{code:'RAW_CODE',message:'review metadata'}]},coverage:[{paperId:'raw-paper-id',warnings:['parser metadata']}],limitations:['system limit']}};
  service.proposeResearchDraft(context,input,research);
  assert.ok(proposal.after.includes('测量系统保留适用条件。'));
  assert.ok(proposal.after.includes('待核实：尚无法确认外推性能。'));
  assert.doesNotMatch(proposal.after,/TIMESTAMP|SOURCE QUOTE|run-technical-id|覆盖范围|RAW_CODE|core-e1|研究笔记|\\u[0-9a-f]{4}|\uFFFD/i);
  assert.deepEqual(Array.from(proposal.evidenceIds),['core-e1']);
  evidence.trust='fixture';assert.throws(()=>service.proposeResearchDraft(context,input,research),error=>error.code==='SCOPE_DENIED');
});
