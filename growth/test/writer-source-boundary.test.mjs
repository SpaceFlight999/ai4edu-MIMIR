import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, basename } from 'node:path';
import vm from 'node:vm';

function annotations() {
  const source = readFileSync(new URL('../overrides/host/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('var LatexAnnotations = class'), end = source.indexOf('// src/tool-service.js', start);
  const saved = new Map();
  const Annotations = vm.runInNewContext(source.slice(start, end) + '\nLatexAnnotations', {
    randomUUID5: randomUUID, join2: join, mkdir: async () => {},
    readdir: async () => [...saved.keys()].map(path => basename(path)),
    readFile2: async path => saved.get(path), writeFile2: async (path, value) => saved.set(path, value),
  });
  const files = { get: async id => ({ id, name: 'paper.tex' }) };
  return { service: new Annotations('synthetic-notes', files), saved };
}

test('different imported TeX sources with the same name retain separate line annotations', async () => {
  const { service } = annotations();
  const first = await service.add({ sourceId: 'source-a', startLine: 1, endLine: 1, quote: 'first', text: '第一份文件的批注' });
  const second = await service.add({ sourceId: 'source-b', startLine: 2, endLine: 2, quote: 'second', text: '第二份文件的批注' });
  assert.deepEqual(Array.from(await service.list('source-a'), note => note.id), [first.id]);
  assert.deepEqual(Array.from(await service.list('source-b'), note => note.id), [second.id]);
});

test('legacy TeX annotations without a source identity remain readable without being rewritten', async () => {
  const { service, saved } = annotations();
  const path = join('synthetic-notes', `${randomUUID()}.json`), legacy = { fileName: 'paper.tex', text: '旧批注', createdAt: '2026-10-01T00:00:00Z' };
  const original = JSON.stringify(legacy); saved.set(path, original);
  assert.equal((await service.list('source-a'))[0].text, legacy.text);
  assert.equal(saved.get(path), original);
});
test('writer prompts preserve scientific qualifiers and explain only actual proposed patches',()=>{
  const source=readFileSync(new URL('../overrides/host/index.js',import.meta.url),'utf8'),start=source.indexOf('function moduleSystemPrompt('),end=source.indexOf('\n}\n',start)+3;
  const prompt=vm.runInNewContext(source.slice(start,end)+'\nmoduleSystemPrompt("word",{})',{MODULE_FIELDS:{word:['body']},RULES:{word:''},writingQualityPrompt:()=>''});
  assert.match(prompt,/保留原文的理想化（ideal）、仿真、实物实验、适用范围、条件与否定/);
  assert.match(prompt,/术语未定义时可在notes提出澄清问题，不能自行删除限定/);
  assert.match(prompt,/summary和notes只描述patch实际建议的改动/);
  assert.match(prompt,/正文仍为被动语态时不能声称已改为主动/);
});
