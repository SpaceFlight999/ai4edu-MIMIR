import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeRunOptions, nativeEntries } from '../../scripts/live-native-options.mjs';
import { hasAutomaticExecutionClaim, readJsonComplete } from '../../scripts/live-native-evidence.mjs';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
const source=readFileSync(new URL('../../scripts/verify-live-native.mjs',import.meta.url),'utf8');
const requiredEntries=['suggest-paragraph','suggest-latex','assist-word','assist-markdown','assist-pdf','assist-figure','assist-run','assist-research','paper-guide','paper-question','research-synthesis-writing','research-chat'];
test('chat-only resume cannot invoke any other model entry',async()=>{
  const report={entries:[]},start=source.indexOf('async function sample('),end=source.indexOf('\nconst canonical',start);
  const sample=vm.runInNewContext(source.slice(start,end)+'\nsample',{wanted:name=>name==='research-chat',previous:null,report,key:'synthetic',console:{log(){}},sanitize:value=>value,existsSync:()=>false,telemetry:'fixture',writeFileSync(){},reportPath:'fixture'});let calls=0;
  for(const entry of requiredEntries)await sample(entry,async()=>{calls++;return{text:'本机模拟'}},()=>({valid:true}));
  assert.equal(calls,1);assert.equal(report.entries.length,1);assert.equal(report.entries[0].entry,'research-chat');
});
test('fresh selected runs retain complete responses and can intentionally repeat a previously passed entry',async()=>{
  const report={entries:[],sourceFixtures:{'assist-word':{body:'Synthetic ideal model'}}},start=source.indexOf('async function sample('),end=source.indexOf('\nconst canonical',start);
  const sample=vm.runInNewContext(source.slice(start,end)+'\nsample',{wanted:name=>name==='assist-word',previous:null,report,key:'synthetic',console:{log(){}},sanitize:value=>value,existsSync:()=>false,telemetry:'fixture',writeFileSync(){},reportPath:'fixture'});
  let calls=0;const response={summary:'Synthetic',notes:'x'.repeat(5000),patch:{body:'An ideal model.'}};
  await sample('assist-word',async()=>{calls++;return response},()=>({valid:true}));
  assert.equal(calls,1);assert.equal(report.entries[0].actualResponse.notes.length,5000);assert.equal(report.entries[0].sourceFixture.body,'Synthetic ideal model');
});
function optionsFixture(run){
  const root=mkdtempSync(join(tmpdir(),'mimir-live-options-'));mkdirSync(join(root,'artifacts'));
  try{return run(root)}finally{rmSync(root,{recursive:true,force:true})}
}
test('all twelve entries are selected for a new default report, independently of legacy reports',()=>optionsFixture(root=>{
  writeFileSync(join(root,'artifacts','live-native-20261010.json'),JSON.stringify({entries:nativeEntries.map(entry=>({entry,passed:true}))}));
  const options=nativeRunOptions(['--live'],root,'fixture-run');assert.equal(options.resumePath,null);assert.equal(options.selectedEntries.length,12);assert.equal(options.reportPath,join(root,'artifacts','live-native-fixture-run.json'));
}));
test('explicit entries produce a fresh exact subset and reject ambiguous or unsupported lists',()=>optionsFixture(root=>{
  const options=nativeRunOptions(['--live','--entries=assist-word,assist-markdown','--report=artifacts/new.json'],root,'fixture-run');
  assert.deepEqual(options.requiredEntries,['assist-word','assist-markdown']);assert.equal(options.resumePath,null);
  for(const args of [['--entries=assist-word,assist-word'],['--entries=unknown'],['--entries='],['--entries=assist-word','--remaining'],['--entries=research-synthesis-writing']])assert.throws(()=>nativeRunOptions(args,root,'fixture-run'));
}));
test('reports cannot overwrite history, escape artifacts or resume absent history',()=>optionsFixture(root=>{
  const original='historical synthetic evidence';writeFileSync(join(root,'artifacts','history.json'),original);
  for(const report of ['artifacts/history.json','../outside.json','growth/overwrite.json','artifacts/../outside.json','artifacts/report.txt'])assert.throws(()=>nativeRunOptions(['--report='+report],root,'fixture-run'));
  assert.throws(()=>nativeRunOptions(['--resume=artifacts/missing.json'],root,'fixture-run'));assert.equal(readFileSync(join(root,'artifacts','history.json'),'utf8'),original);
}));
test('resume and chat-only preserve the original report and still require all twelve successes',()=>optionsFixture(root=>{
  writeFileSync(join(root,'artifacts','history.json'),'{}');const options=nativeRunOptions(['--resume=artifacts/history.json','--chat-only','--report=artifacts/resumed.json'],root,'fixture-run');
  assert.equal(options.chatOnly,true);assert.equal(options.requiredEntries.length,12);assert.equal(options.resumePath,join(root,'artifacts','history.json'));assert.notEqual(options.resumePath,options.reportPath);
}));
test('actual telemetry observer preserves native response identity and complete streamed JSON including repair issues',async()=>{
  const normalized=source.replaceAll('\r\n','\n'),start=normalized.indexOf('writeFileSync(preload, String.raw`')+'writeFileSync(preload, '.length,end=normalized.indexOf('`)\n  host = spawn',start)+1;
  assert.ok(start>0&&end>start);
  const preload=vm.runInNewContext(normalized.slice(start,end),{telemetry:'synthetic-wire.json',root:'synthetic-root',pathToFileURL,join}).replace(/^\s*import .*?;\n/,'');
  const result={draft:[{text:'Synthetic ideal simulation. '+ 'x'.repeat(3000)}],issues:[{code:'SYNTHETIC_SCOPE',text:'No real-device validation is supplied.'}]};
  const events=[{type:'message_start',message:{model:'deepseek-flash',usage:{input_tokens:27}}},{type:'content_block_start',content_block:{type:'text',text:''}},{type:'content_block_delta',delta:{type:'text_delta',text:JSON.stringify(result)}},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:31}}];
  const nativeResponse=new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join(''));
  let saved,finish;const observed=new Promise(resolve=>finish=resolve),context=vm.createContext({URL,Request,TextDecoder,fetch:async()=>nativeResponse,writeFileSync:(_path,text)=>{saved=JSON.parse(text);if(saved[0]?.responseJson)finish()}});
  vm.runInContext(preload,context);
  assert.equal(await context.fetch('https://api.deepseek.com/anthropic/v1/messages',{body:JSON.stringify({model:'deepseek-flash',messages:[{role:'user',content:'Synthetic text'}]})}),nativeResponse);
  await observed;assert.equal(saved.length,1);assert.deepEqual(saved[0].responseJson,result);assert.equal(saved[0].responseText,JSON.stringify(result));assert.equal(saved[0].responseModel,'deepseek-flash');assert.equal(saved[0].inputTokens,27);assert.equal(saved[0].outputTokens,31);
});
test('execution checks distinguish explicit negation from affirmative execution and mixed clauses',()=>{
  for(const text of ['仅为检索字符串建议，非已执行结果。','并非已运行的结果。','不代表“已执行”。','I did not run this code.','仍只写被讨论，未改写为已执行、已验证或已建模。'])assert.equal(hasAutomaticExecutionClaim(text),false,text);
  for(const text of ['已执行检索并保存文件。','本轮已自动运行代码。','I ran this code.','非已执行结果；但本轮已运行代码。','未改写为已执行；另外本轮已运行代码。'])assert.equal(hasAutomaticExecutionClaim(text),true,text);
});
test('bounded evidence reads survive an independent writer truncating the file and retain every final row',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'mimir-live-evidence-')),file=join(directory,'wire.json');writeFileSync(file,'[]');
  const worker=new Worker("const {parentPort,workerData}=require('node:worker_threads');const{writeFileSync}=require('node:fs');writeFileSync(workerData.file,'');parentPort.postMessage('partial');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,80);writeFileSync(workerData.file,JSON.stringify(Array.from({length:50},(_,generation)=>({generation,padding:'x'.repeat(2000)}))));parentPort.postMessage('done')",{eval:true,workerData:{file}});
  const partial=new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject)});
  try {
    assert.equal(await partial,'partial');const value=readJsonComplete(file);assert.equal(value.length,50);assert.equal(value.at(-1).generation,49);assert.ok(value.every(row=>row.padding.length===2000));
    writeFileSync(file,'');assert.throws(()=>readJsonComplete(file,{attempts:2,retryMs:1}),SyntaxError);
  } finally { await worker.terminate();rmSync(directory,{recursive:true,force:true}) }
});
function collect(report,freshWire){
  const start=source.indexOf('  let freshWire=[]'),end=source.indexOf('  // Remove only persisted secret carriers',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(source.slice(start,end),{report,previous:{wire:[{requestModel:'deepseek-flash',responseModel:'deepseek-flash',status:200}]},telemetry:'fixture-current',existsSync:()=>true,readJsonComplete:()=>freshWire,requiredEntries});
  return report;
}
test('outer browser failure still preserves every new official-call metadata row',()=>{
  const current=[{requestModel:'deepseek-flash',responseModel:'deepseek-flash',status:200},{requestModel:'deepseek-flash',responseModel:'deepseek-flash',status:200}];
  const report=collect({entries:[],failure:{code:'FIXTURE_BROWSER_ERROR'}},current);
  assert.equal(report.wire.length,3);assert.equal(report.passed,false);assert.equal(report.allActualModelsCanonical,true);
});
test('a chat-only success cannot report overall success while synthesis remains missing',()=>{
  const entries=requiredEntries.filter(entry=>entry!=='research-synthesis-writing').map(entry=>({entry,passed:true}));
  const report=collect({entries,manuscriptUnchanged:true},[]);
  assert.equal(JSON.stringify(report.remainingEntries),'["research-synthesis-writing"]');assert.equal(report.passed,false);
});
