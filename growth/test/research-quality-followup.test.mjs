import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {compactResearchRequest} from '../overrides/host/model-context.mjs';
import {compactResearchOutput} from '../overrides/host/model-output.mjs';
import {comparisonPolicy,conservativeSynthesis} from '../overrides/host/model-comparison.mjs';

// Execute the shipped validators and stage/execute methods; never start a host or call a provider.
const source=readFileSync(new URL('../overrides/host/unified.js',import.meta.url),'utf8');
const validators=vm.runInNewContext(source.slice(source.indexOf('var RuntimeError ='),source.indexOf('// ../research-runtime/src/store.mjs',source.indexOf('var RuntimeError =')))+'\n({checkAnalysis,checkSynthesis,checkReview,fail,object,clone})');
const promptStart=source.indexOf('var SYSTEM2 ='),promptEnd=source.indexOf('var freeze =',promptStart);
const prompts=vm.runInNewContext(source.slice(promptStart,promptEnd)+'\n({SYSTEM2,SCHEMAS})');
const callStart=source.indexOf('  async call(stage, run, signal, payload)'),executeStart=source.indexOf('  async execute(run, signal)',callStart),executeEnd=source.indexOf('\n};\n\n// ../research-runtime/src/host.mjs',executeStart);
const environment={...validators,...prompts,compactResearchRequest,compactResearchOutput,comparisonPolicy,conservativeSynthesis,bounded2:operation=>operation(),digest:value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')};
const call=vm.runInNewContext('({'+source.slice(callStart,executeStart)+'}).call',environment);
const execute=vm.runInNewContext('({'+source.slice(executeStart,executeEnd)+'}).execute',environment);
const clone=value=>JSON.parse(JSON.stringify(value));
const statement=(text='该文自述研究一个简单测量系统。',kind='original_fact',evidenceIds=['paper-a::e1'])=>({text,kind,evidenceIds});
function snapshot(paperId='paper-a'){
  const quote='This synthetic paper studies a simple measurement system.';
  return {paperId,title:'Synthetic-live.pdf',version:3,sourceSha256:'original-sha',parserVersion:'fixture-parser',snapshotSha256:'snapshot-sha',trust:'fixture',pageCount:2,authorizedPages:[1],pages:[{page:1,text:quote+'\n'+quote}],evidence:[1,2].map(i=>({paperId,evidenceId:'e'+i,citationId:paperId+'::e'+i,page:1,quote,confidenceState:'extracted'})),coverage:{requestedPages:[1],readPages:[1],missingPages:[],warnings:['formula_and_table_structure_unverified']}};
}
function analysis(paper=snapshot()){
  return {papers:[{paperId:paper.paperId,claims:[statement(undefined,undefined,[paper.evidence[0].citationId])],methods:[],limitations:[],criticalQuestions:[],conditions:Object.fromEntries(['dataset','metric','protocol'].map(key=>[key,{value:null,evidenceIds:[]}]))}],readRequests:[]};
}
const synthesis=()=>({comparisons:[],gaps:[],draft:[statement(),statement('仅凭当前输入无法确认真实设备性能。','unknown',[])]});

test('observed row-scope, unknown-author absence and method placeholders cannot pass merely by changing their kind',()=>{
  const paper=snapshot(), value=analysis(paper);
  value.papers[0].claims=[statement('其余各行均为模板，没有新增科学事实。','model_inference',['paper-a::e1'])];
  assert.throws(()=>validators.checkAnalysis(value,[paper]),/超出本条引用范围/);
  for(const text of ['每个段落附带method evidence标签。','每条段落都附有method evidence标签。','各条引文均标记method evidence。']){
    value.papers[0].claims=[statement(text,'original_fact',['paper-a::e1'])];
    assert.throws(()=>validators.checkAnalysis(value,[paper]),/超出本条引用范围/);
  }
  value.papers[0].claims=[statement('作者未报告真实设备验证。','unknown',['paper-a::e1'])];
  assert.throws(()=>validators.checkAnalysis(value,[paper]),/unknown应说明/);
  value.papers[0].claims=[statement()];value.papers[0].methods=[statement('没有具体方法，故不列出。','model_inference',[])];
  assert.throws(()=>validators.checkAnalysis(value,[paper]),/methods仅列/);
  value.papers[0].methods=[];value.papers[0].claims=[statement('材料标题为合成论文，不能确认发表状态。','model_inference',[])];
  assert.throws(()=>validators.checkAnalysis(value,[paper]),/文件标题由sources/);
  value.papers[0].claims=[statement()];
  value.papers[0].methods=[];value.papers[0].limitations=[statement('当前引文不足以确认真实设备性能。','unknown',[])];
  assert.equal(validators.checkAnalysis(value,[paper]),value);
});
const review=(issues=[])=>({issues,semanticAssessments:[{evidenceId:'p1e1',judgment:'supports the atomic source fact',reason:'The cited passage states a simple measurement system.'}]});
function fixture(generate){
  const original=snapshot(),requests=[],events=[],saved=[];
  const model={metadata:{provider:'deepseek-official',model:'deepseek-flash',reasoningEffort:'off'},generate:async request=>{requests.push(clone({...request,signal:undefined}));return generate(request);}};
  const runtime={call,execute,active:new Map([['fixture',{model}]]),store:{event:(_run,type,data)=>events.push({type,data:clone(data??{})}),save:run=>saved.push(clone(run))},read:async()=>original,admit:paper=>clone(paper)};
  const run={runId:'fixture',snapshot:[],input:{question:'这份合成资料能否证明真实设备性能？只使用所给原文。',workflow:'synthesis-writing',papers:[{paperId:original.paperId,version:3,pages:[1],authorizedPages:[1],evidenceIds:[]}],budget:{maxOutputChars:60000}},metrics:{modelCalls:0,modelTimeMs:0,repairs:0,invalidCitationsBlocked:0}};
  return {runtime,run,requests,events,saved,original};
}

test('all four actual stage requests distinguish metadata, complete passage support and review scope',async()=>{
  for(const stage of ['analysis','synthesis','review','repair']){
    const f=fixture(()=>({}));f.run.snapshot=[f.original];
    await f.runtime.call(stage,f.run,new AbortController().signal,{analysis:analysis()});
    const request=f.requests[0];
    assert.match(request.system,/page text owns author statements/);
    assert.match(request.system,/A citation identifies only its admitted passage/);
    assert.match(request.system,/missing evidence means unknown, not proof of absence/);
    assert.match(request.system,/complete support within that statement's own citations/);
    assert.match(request.system,/A line label such as method evidence is not a described scientific method/);
    assert.match(request.system,new RegExp('Stage '+stage+':'));
    assert.equal(request.payload.sourceProvenance[0].version,3);
    assert.equal(request.payload.sourceProvenance[0].sourceSha256,'original-sha');
    assert.equal(request.payload.context[0].evidence[0].citationId,'p1e1');
    const e=request.payload.context[0].evidence[0],page=request.payload.context[0].pages[0];
    assert.equal(page.text.slice(e.start,e.end),f.original.evidence[0].quote);
    assert.deepEqual(Object.keys(request.payload.sourceProvenance[0]),['paperId','version','sourceSha256','parserVersion']);
    if(stage==='review')assert.match(request.system,/kind is already correct/);
    if(stage==='analysis')assert.match(request.system,/methods must be \[\]/);
    if(stage==='synthesis'){
      assert.match(request.system,/Coverage warnings must not be copied into draft or gaps under any kind/);
      assert.match(request.system,/current citations are insufficient to confirm/);
      assert.match(request.system,/not a model claim that the material supports only one conclusion/);
    }
    if(stage==='repair')assert.match(request.system,/Do not delete a genuine uncertainty to obtain zero issues/);
  }
});

test('explicit system coverage cannot masquerade as an original fact, but true quoted negatives remain valid',()=>{
  const paper=snapshot(),value=analysis(paper);
  for(const text of ['覆盖报告提示仅第1页可读。','给定原文范围内未找到真实设备性能。','coverage.warnings says formulas are unverified.']){
    value.papers[0].claims=[statement(text)];
    assert.throws(()=>validators.checkAnalysis(value,[paper]),error=>error.code==='MODEL_OUTPUT_INVALID'&&/系统元信息/.test(error.message));
  }
  for(const kind of ['unknown','model_inference']){
    value.papers[0].claims=[statement('本次材料未提供足以确认设备性能的支持。',kind,[])];
    assert.equal(validators.checkAnalysis(value,[paper]),value);
  }
  for(const [quote,text] of [
    ['The authors report no real-device experiments.','作者明确报告未做真实设备实验。'],
    ['Accuracy was 95.0% under the ideal model.','理想模型条件下的准确率为95%。'],
    ['覆盖报告指出仅第1页可读。','覆盖报告指出仅第1页可读。']
  ]){
    paper.evidence[0].quote=quote;value.papers[0].claims=[statement(text)];
    assert.equal(validators.checkAnalysis(value,[paper]),value);
  }
});

test('exact same-source repetitions are rejected without merging distinct conditions or source scopes',()=>{
  const paper=snapshot(),value=analysis(paper),draft=synthesis();
  value.papers[0].methods=[statement(undefined,undefined,['paper-a::e2'])];
  assert.throws(()=>validators.checkAnalysis(value,[paper]),error=>error.code==='MODEL_OUTPUT_INVALID'&&/repeats/.test(error.message));
  value.papers[0].methods=[statement('作者报告的是理想模型中的测量系统。')];
  assert.equal(validators.checkAnalysis(value,[paper]),value);
  draft.draft.push(statement(undefined,undefined,['paper-a::e2']));
  assert.throws(()=>validators.checkSynthesis(draft,value,[paper]),error=>error.code==='MODEL_OUTPUT_INVALID'&&/repeats/.test(error.message));
  draft.draft.at(-1).text='该文自述研究另一种硬件条件下的测量系统。';
  assert.equal(validators.checkSynthesis(draft,value,[paper]),draft);
  const other=snapshot('paper-b'),otherAnalysis=analysis(other);value.papers.push(otherAnalysis.papers[0]);
  assert.equal(validators.checkAnalysis(value,[paper,other]),value);
});

test('the actual execute path repairs metadata before saving a draft and preserves source and user approval boundary',async()=>{
  const f=fixture(({stage,payload})=>{
    if(stage==='analysis')return analysis();
    if(stage==='synthesis')return {...synthesis(),draft:[statement('仅第1页可读，该文研究简单测量系统。','original_fact',['p1e1'])]};
    if(stage==='repair'){
      assert.equal(payload.issues[0].code,'MODEL_OUTPUT_INVALID');
      assert.match(payload.issues[0].message,/系统元信息/);
      return {analysis:payload.analysis,synthesis:{...synthesis(),draft:[statement(undefined,undefined,['p1e1']),statement('仅凭当前输入无法确认真实设备性能。','unknown',[])]}};
    }
    return review();
  });
  await f.runtime.execute(f.run,new AbortController().signal);
  assert.equal(f.run.status,'succeeded');assert.equal(f.run.result.kind,'draft');
  assert.deepEqual(f.requests.map(request=>request.stage),['analysis','synthesis','repair','review']);
  assert.equal(f.run.metrics.repairs,1);assert.ok(f.run.metrics.modelCalls<=6);
  assert.equal(f.run.result.evidenceManifest[0].paperVersion,3);
  assert.equal(f.run.result.evidenceManifest[0].quote,f.original.evidence[0].quote);
  assert.equal(f.run.result.evidenceManifest[0].citationId,'paper-a::e1');
  assert.equal(f.run.result.checks.semanticSupport,'model_assessment_not_proof');
  assert.equal(f.run.result.synthesis.draft[1].kind,'unknown');
  assert.equal(f.original.version,3);assert.equal(f.original.sourceSha256,'original-sha');
  assert.ok(f.saved.filter(run=>run.result).every(run=>run.result.kind==='draft'));
});

test('review issues reach repair as structured objects and unresolved issues remain visible after the bounded repair',async()=>{
  const issue={code:'unsupported_clause',message:'synthesis.draft[0] has an unsupported hardware clause.',evidenceIds:['p1e1']};
  const f=fixture(({stage,payload})=>{
    if(stage==='analysis')return analysis();
    if(stage==='synthesis')return {...synthesis(),draft:[statement(undefined,undefined,['p1e1'])]};
    if(stage==='review')return review([issue]);
    assert.deepEqual(clone(payload.issues),[issue]);
    return {analysis:payload.analysis,synthesis:payload.synthesis};
  });
  await f.runtime.execute(f.run,new AbortController().signal);
  assert.deepEqual(f.requests.map(request=>request.stage),['analysis','synthesis','review','repair','review']);
  assert.equal(f.run.metrics.repairs,1);
  assert.equal(f.run.result.review.issues[0].code,'unsupported_clause');
  assert.equal(f.run.result.review.issues[0].evidenceIds[0],'paper-a::e1');
  assert.equal(f.events.at(-1).data.unresolvedReviewIssues,1);
});

test('a repair that still promotes metadata to an original fact cannot save a final draft',async()=>{
  const bad={...synthesis(),draft:[statement('仅第1页可读，该文研究简单测量系统。','original_fact',['p1e1'])]};
  const f=fixture(({stage,payload})=>stage==='analysis'?analysis():stage==='synthesis'?bad:{analysis:payload.analysis,synthesis:bad});
  await assert.rejects(f.runtime.execute(f.run,new AbortController().signal),error=>error.code==='MODEL_OUTPUT_INVALID');
  assert.equal(f.run.metrics.repairs,1);assert.equal(f.run.result,undefined);
  assert.ok(f.saved.every(run=>run.result===undefined));
});

test('an invalid initial output envelope enters the existing single repair budget before any result is saved',async()=>{
  const f=fixture(({stage})=>stage==='analysis'?'an encoded envelope':stage==='repair'?{analysis:analysis(),synthesis:null}:stage==='synthesis'?synthesis():review());
  await f.runtime.execute(f.run,new AbortController().signal);
  assert.deepEqual(f.requests.map(request=>request.stage),['analysis','repair','synthesis','review']);
  assert.equal(f.run.metrics.repairs,1);assert.equal(f.run.status,'succeeded');
  assert.ok(f.requests.every(request=>request.system.includes('root keys are exactly')));
});

test('malformed review gets one bounded format correction without discarding real issues or changing the draft',async()=>{
  let reviews=0;const issue={code:'needs_manual_check',message:'Check the precise source condition.',evidenceIds:['p1e1']};
  const f=fixture(({stage})=>{
    if(stage==='analysis')return analysis();if(stage==='synthesis')return synthesis();
    if(stage==='repair')return{analysis:analysis(),synthesis:synthesis()};
    reviews++;return reviews===1?{...review([issue]),unexpectedField:true}:review([issue]);
  });
  await f.runtime.execute(f.run,new AbortController().signal);
  assert.equal(f.run.metrics.reviewSchemaRepairs,1);assert.ok(f.run.metrics.modelCalls<=6);
  assert.equal(f.run.result.review.issues[0].code,issue.code);assert.equal(f.run.result.synthesis.draft[0].text,synthesis().draft[0].text);
  const invalid=fixture(({stage})=>stage==='analysis'?analysis():stage==='synthesis'?synthesis():{...review(),unexpectedField:true});
  await assert.rejects(invalid.runtime.execute(invalid.run,new AbortController().signal));
  assert.equal(invalid.run.metrics.reviewSchemaRepairs,1);assert.equal(invalid.run.result,undefined);
});
