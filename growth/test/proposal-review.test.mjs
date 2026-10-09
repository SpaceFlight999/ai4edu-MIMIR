import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../client/proposal-review.js',import.meta.url),'utf8');
const view=runInNewContext(source+';({order:mimirProposalOrder,parts:mimirProposalParts,time:mimirProposalTime,intro:MIMIR_DOCUMENT_INTRO})');
test('proposal received timestamps survive the host-to-UI conversion',()=>{
  const bundle=readFileSync(new URL('../overrides/workbench/client.js',import.meta.url),'utf8');
  const start=bundle.indexOf('function dI('),end=bundle.indexOf('var a2=',start);
  const map=runInNewContext(bundle.slice(start,end)+';dI',{Phe:()=>true});
  const row={changeSetId:'p',operations:[{before:'old',after:'new'}],createdAt:'2026-10-09T02:30:45Z',reason:'review'};
  assert.equal(map(row).createdAt,row.createdAt);assert.equal(map(row).reason,'review');
  assert.equal(view.time(row.createdAt),new Date(row.createdAt).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}));
  assert.equal(view.time(undefined),'时间未记录');
});
test('pending proposals sort newest first without altering input, equal times preserve latest insertion first',()=>{
  const rows=[{id:'old',status:'proposed',createdAt:'2026-10-09T01:00:00Z'},{id:'new',status:'proposed',createdAt:'2026-10-09T02:00:00Z'},{id:'tie',status:'proposed',createdAt:'2026-10-09T02:00:00Z'},{id:'done',status:'applied',createdAt:'2026-10-09T03:00:00Z'}];
  assert.equal(Array.from(view.order(rows),r=>r.id).join(','),'tie,new,old');assert.equal(rows[0].id,'old');
});
test('appended research hides unchanged prefixes while actual replacements retain their old text',()=>{
  const row={before:view.intro,after:view.intro+'\n\nGenerated research'};
  assert.equal(view.parts(row).before,'');assert.equal(view.parts(row).after,'Generated research');
  assert.equal(view.parts({before:'User manuscript',after:'User manuscript\n\nNew notes'}).after,'New notes');
  assert.equal(view.parts({before:'Actual old argument',after:'Revised argument'}).before,'Actual old argument');
  assert.equal(row.after,view.intro+'\n\nGenerated research');
});
