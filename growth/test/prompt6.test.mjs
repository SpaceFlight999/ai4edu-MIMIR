import test from 'node:test';
import assert from 'node:assert/strict';
import {PaperTabs,chronological,guideReady,expiredFailure,chineseError,RESEARCH_TIMEOUT_MS,FAILED_RUN_RETENTION_MS} from '../overrides/paper/viewer/session.mjs';
import {NoteDrafts} from '../overrides/paper/viewer/drafts.mjs';
import {paintHighlights,paintQuestionSelection} from '../overrides/paper/viewer/highlights.mjs';
function storage(){const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};}
test('closing paper tabs preserves saved closed state, reopening and project isolation',()=>{
  const local=storage(),tabs=new PaperTabs(local,'p'),rows=[{paperId:'a'},{paperId:'b'}];
  assert.deepEqual(tabs.reconcile(rows),['a','b']);assert.equal(tabs.close('b'),'a');
  assert.deepEqual(new PaperTabs(local,'p').reconcile(rows),['a']);tabs.close('a');assert.deepEqual(new PaperTabs(local,'p').reconcile(rows),[]);
  tabs.open('b');tabs.open('b');assert.deepEqual(tabs.ids,['b']);assert.deepEqual(new PaperTabs(local,'other').reconcile(rows),['a','b']);
});
test('generated results keep original creation order and annotation drafts can be permanently deleted',()=>{
  const rows=[{createdAt:'2026-10-08T02:00:00Z'},{createdAt:'2026-10-08T01:00:00Z'}];assert.equal(chronological(rows)[0],rows[1]);assert.equal(rows[0].createdAt,'2026-10-08T02:00:00Z');
  const local=storage(),drafts=new NoteDrafts(local,'p');const first=drafts.save('a',{text:'before',edit:{paperId:'a'}}),second=drafts.save('a',{text:'after',edit:{paperId:'a'}});assert.equal(second.createdAt,first.createdAt);
  drafts.remove('a');assert.deepEqual(new NoteDrafts(local,'p').list('a'),[]);
});
test('research requires current parsed guide and cleans only expired failures',()=>{
  const paper={sourceSha256:'sha',parserVersion:'v1'};assert.equal(guideReady({paper,analysis:[{...paper}]}),true);assert.equal(guideReady({paper,analysis:[{...paper,parserVersion:'v0'}]}),false);
  const now=Date.now(),createdAt=new Date(now-FAILED_RUN_RETENTION_MS-1).toISOString();for(const status of ['failed','timed_out','interrupted'])assert.equal(expiredFailure({status,createdAt},now),true);
  for(const status of ['succeeded','running','cancelled'])assert.equal(expiredFailure({status,createdAt},now),false);
  assert.equal(expiredFailure({status:'failed',createdAt:new Date(now).toISOString()},now),false);assert.equal(RESEARCH_TIMEOUT_MS,900000);
});
test('failure cleanup starts one hour after completion and never expires successful writing',()=>{
  const now=Date.parse('2026-10-08T12:00:00Z'),createdAt=new Date(now-30*24*3600000).toISOString();
  assert.equal(FAILED_RUN_RETENTION_MS,3600000);
  for(const status of ['failed','timed_out','interrupted']){
    assert.equal(expiredFailure({status,createdAt,finishedAt:new Date(now-3599999).toISOString()},now),false);
    assert.equal(expiredFailure({status,createdAt,finishedAt:new Date(now-3600000).toISOString()},now),true);
  }
  for(const status of ['succeeded','running','cancelled'])assert.equal(expiredFailure({status,createdAt,finishedAt:createdAt},now),false);
});
test('model errors are concise Chinese and do not expose provider details or credentials',()=>{
  for(const row of [{code:'MODEL_AUTH'},{code:'TIMEOUT'},{code:'MODEL_OUTPUT_INVALID'},{message:'Upstream failure sk-super-secret https://server.invalid/private'},{message:'查询失败 https://server.invalid/private sk-secret'}]){const text=chineseError(row);assert.match(text,/[\u3400-\u9fff]/);assert.ok(text.length<=140);assert.doesNotMatch(text,/sk-|https?:|Upstream/);}
});
test('missing source evidence is distinguished from malformed output and failed citation checks',()=>{
  assert.match(chineseError({code:'INSUFFICIENT_EVIDENCE'}),/PDF 解析/);
  assert.doesNotMatch(chineseError({code:'INSUFFICIENT_EVIDENCE'}),/模型结果/);
  assert.match(chineseError({code:'MODEL_OUTPUT_INVALID'}),/格式/);
  assert.match(chineseError({code:'INVALID_CITATION'}),/证据校验/);
  assert.match(chineseError({code:'MODEL_CONTEXT_LIMIT'}),/上下文容量/);
  assert.match(chineseError({code:'MODEL_OUTPUT_LIMIT'}),/输出/);
});
test('annotation markers use only their start point and navigate; stale anchors are hidden',()=>{
  let selected=null;const marks=[];const layer={replaceChildren:()=>marks.splice(0),append:mark=>marks.push(mark),ownerDocument:{createElement:tag=>({tag,style:{setProperty(){}},dataset:{},setAttribute(){},addEventListener(name,fn){this.click=fn;}})}};
  const paper={sourceSha256:'sha',parserVersion:'v1'},note={...paper,id:'n',kind:'annotation',page:1,bbox:[.2,.3,.4,.5],createdAt:'2026-10-08T01:00:00Z'};
  paintHighlights(layer,[note,{...note,id:'old',parserVersion:'v0'}],1,paper,id=>selected=id);
  assert.equal(marks.length,1);assert.equal(marks[0].tag,'button');assert.equal(marks[0].style.left,'20%');assert.equal(marks[0].style.width,undefined);assert.equal(marks[0].textContent,'1');marks[0].click();assert.equal(selected,'n');
});
test('pending question paints exact line fragments and clears only when sent or viewed elsewhere',()=>{
  const marks=[],layer={replaceChildren:()=>marks.splice(0),append:n=>marks.push(n),ownerDocument:{createElement:()=>({style:{}})}};
  const anchor={paperId:'a',page:2,quote:'two lines',pending:true,bbox:[.1,.2,.8,.4],rects:[[.1,.2,.8,.25],[.1,.3,.4,.35]]},before=JSON.stringify(anchor);
  paintQuestionSelection(layer,anchor,'a',2);assert.equal(layer.hidden,false);assert.equal(marks.length,2);assert.ok(Math.abs(parseFloat(marks[1].style.width)-30)<1e-8);
  paintQuestionSelection(layer,anchor,'a',3);assert.equal(layer.hidden,true);assert.equal(JSON.stringify(anchor),before);
  paintQuestionSelection(layer,anchor,'a',2);assert.equal(marks.length,2);
  paintQuestionSelection(layer,{...anchor,pending:false},'a',2);assert.equal(layer.hidden,true);assert.equal(marks.length,0);
});
