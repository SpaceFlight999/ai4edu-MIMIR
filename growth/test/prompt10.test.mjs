import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizeWorkbenchImport} from '../overrides/host/workbench-import-format.mjs';

const hash='022f551cef2a5b1f54f26a651fc8fa2832e85ed0a12069f102db953981948eb3';
const evidence='5be5783e-7717-49f5-8660-5c2e5813efa7';
const quote='per, we aim to answer: Can visual sim-to-real enable useful';
const source='来源：VIRAL_ Visual Sim-to-Real at Scale for Humanoid Loco-Manipulation.pdf · PDF 第 2 页';

test('Program A removes the exact timestamp and technical source tail from prompt 10',()=>{
  const input=`生成时间：2026-10-16T13:09:43.776Z\n\n原文引文：${quote}\n${source} · SHA-256 ${hash} · 证据 ${evidence}`;
  assert.equal(normalizeWorkbenchImport(input),`原文引文：${quote}\n${source}`);
});

for(const date of ['2026-10-16T13:09:43.776Z','2026-10-16T21:09:43+08:00','2026/10/16 21:09:43','2026-10-16']){
  test(`Program A removes generated time ${date} without losing the next paragraph`,()=>{
    assert.equal(normalizeWorkbenchImport(`生成时间：${date}\n\n应在相同条件下比较误差。`),'应在相同条件下比较误差。');
  });
}

test('inline metadata preserves the readable source, page and conclusion without stray separators',()=>{
  const input=`生成时间：2026-10-16T13:09:43.776Z · ${source} · SHA-256:${hash} · 证据编号:${evidence}\n\n结论仅适用于已验证条件。`;
  assert.equal(normalizeWorkbenchImport(input),`${source}\n\n结论仅适用于已验证条件。`);
});

test('standalone technical metadata is removed while normal SHA-256 prose and identifiers remain',()=>{
  const prose=`算法采用 SHA-256 计算摘要，数值本身属于实验对象。\n样本编号 ${evidence}。\n· 保留这个正常的列表项。`;
  assert.equal(normalizeWorkbenchImport(`SHA-256 ${hash} · 证据 ${evidence}\n\n${prose}`),prose);
  assert.equal(normalizeWorkbenchImport('生成时间：由采样系统决定。'),'生成时间：由采样系统决定。');
});

test('source quotations and fenced code keep their literal text and blank lines',()=>{
  const actualQuote=`原文引文：以下文字是原文。\n生成时间：2026-10-16T13:09:43.776Z\n\n\nSHA-256 ${hash}`;
  const code='```text\n生成时间：2026-10-16T13:09:43.776Z\n\n\n'+source+' · SHA-256 '+hash+'\n```';
  assert.equal(normalizeWorkbenchImport(`${actualQuote}\n${source} · 证据 ${evidence}`),`${actualQuote}\n${source}`);
  assert.equal(normalizeWorkbenchImport(code),code);
});

test('timestamp followed by narrative remains a complete scientific sentence',()=>{
  const sentence='生成时间：2026-10-16T13:09:43.776Z 是数据集的实验起点，应据此计算延迟。';
  assert.equal(normalizeWorkbenchImport(sentence),sentence);
  assert.equal(normalizeWorkbenchImport(sentence.replace(' 是','；该时间是')),sentence.replace(' 是','；该时间是'));
});

test('Markdown indented code retains metadata examples and leading indentation',()=>{
  for(const indent of ['    ','\t']) {
    const code=`${indent}生成时间：2026-10-16T13:09:43.776Z\n\n${indent}${source} · SHA-256 ${hash}\n${indent}保留为缩进代码示例`;
    assert.equal(normalizeWorkbenchImport(`\n${code}\n`),code);
    assert.equal(normalizeWorkbenchImport(normalizeWorkbenchImport(code)),code);
  }
});

test('Program A is deterministic and idempotent across repeated imports',()=>{
  const input=`草稿生成时间：2026/10/16 21:09:43\r\n\r\n\r\n正文保持限定条件。  \r\n${source} · SHA-256 ${hash} · 证据 ${evidence}`;
  const once=normalizeWorkbenchImport(input);
  assert.equal(once,`正文保持限定条件。\n${source}`);
  assert.equal(normalizeWorkbenchImport(once),once);
  assert.throws(()=>normalizeWorkbenchImport(null),TypeError);
});

// Execute the shipped common import method rather than a reimplementation.
const writer=readFileSync(new URL('../overrides/host/index.js',import.meta.url),'utf8');
const start=writer.indexOf('  appendEvidenceNote('),end=writer.indexOf('  proposeResearchDraft(',start);
const append=vm.runInNewContext('({'+writer.slice(start,end)+'}).appendEvidenceNote',{
  normalizeWorkbenchImport,invalid:message=>{throw new Error(message);}
});

for(const kind of ['导读','提问','证据地图','复现准备清单','原文证据','研究草稿']){
  test(`${kind}: the common server boundary formats the imported text and preserves document and evidence state`,()=>{
    const existing=`已有正文及历史元数据保持不变。\n生成时间：2025-01-01T00:00:00Z\n${source} · SHA-256 ${hash}`;
    const document={documentId:'doc',version:4,content:{type:'doc',content:[{type:'paragraph',attrs:{blockId:'block'},content:[{type:'text',text:existing}]}]}};
    const before=structuredClone(document),rows=[{quote,title:'Synthetic.pdf',page:2,sha256:hash,evidence_id:evidence}];
    let proposal;
    const service={evidence:()=>rows,propose:(_,input)=>{proposal=input;return input;}};
    append.call(service,{projectId:'project'},document,{text:kind==='原文证据'?undefined:`生成时间：2026-10-16T13:09:43.776Z\n${kind}：比较预测与观察，结论仅限本次条件。\n${source} · SHA-256 ${hash} · 证据 ${evidence}`,expectedVersion:4,requestId:'request',idempotencyKey:'key'},[evidence],5000,kind==='研究草稿');
    assert.equal(proposal.before,existing);assert.ok(proposal.after.startsWith(existing+'\n\n'));
    const imported=proposal.after.slice(existing.length);
    assert.doesNotMatch(imported,/生成时间|SHA-256|5be5783e-7717/);
    assert.ok(imported.includes('PDF 第 2 页'));
    if(kind!=='研究草稿')assert.ok(imported.includes(`原文引文：${quote}`));
    assert.equal(proposal.baseVersion,4);assert.deepEqual(Array.from(proposal.evidenceIds),[evidence]);
    assert.equal(proposal.requestId,'request');assert.equal(proposal.idempotencyKey,'key');
    assert.deepEqual(document,before);assert.equal(rows[0].sha256,hash);
  });
}

test('a cleaned empty research fragment cannot produce an empty proposal',()=>{
  const document={documentId:'doc',content:{type:'paragraph',attrs:{blockId:'block'},content:[]}};
  let saved=false;
  assert.throws(()=>append.call({evidence:()=>[],propose:()=>{saved=true;}},{},document,{text:'生成时间：2026-10-16T13:09:43.776Z'},[],5000,true),/没有可导入/);
  assert.equal(saved,false);
});
