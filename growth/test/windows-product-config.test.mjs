import test from 'node:test'
import assert from 'node:assert/strict'
import { writeProductConfig } from '../../runtime/system/app/environment.mjs'
import { applyProductConfigWrite } from '../overrides/app/product-config-write.mjs'
import { readFileSync } from 'node:fs'

test('generated product config retries Windows sharing violations with exact path and bytes', () => {
  const calls=[],waits=[],file='synthetic/tex/startup.ini',text='[Auto]\nConfig=Portable\n';
  const write=(...args)=>{calls.push(args);if(calls.length<=2)throw Object.assign(new Error('sharing'),{code:calls.length===1?'EBUSY':'EPERM'});return 'written'};
  assert.equal(writeProductConfig(file,text,{platform:'win32',write,wait:ms=>waits.push(ms)}),'written');
  assert.deepEqual(calls,[[file,text],[file,text],[file,text]]);assert.deepEqual(waits,[20,40]);
})

test('a persistent Windows config lock is bounded and retains the original error', () => {
  let calls=0;const waits=[],error=Object.assign(new Error('locked startup.ini'),{code:'EBUSY'});
  assert.throws(()=>writeProductConfig('synthetic/file','unchanged bytes',{platform:'win32',write:()=>{calls++;throw error},wait:ms=>waits.push(ms)}),value=>value===error);
  assert.equal(calls,9);assert.deepEqual(waits,[20,40,80,160,200,200,200,200]);assert.equal(waits.reduce((a,b)=>a+b),1100);
})

test('non-sharing failures and non-Windows writes are never retried', () => {
  for(const [platform,code] of [['win32','EACCES'],['win32','ENOSPC'],['linux','EBUSY']]) {
    let calls=0,waits=0;const error=Object.assign(new Error(code),{code});
    assert.throws(()=>writeProductConfig('synthetic/file','bytes',{platform,write:()=>{calls++;throw error},wait:()=>waits++}),value=>value===error);
    assert.equal(calls,1);assert.equal(waits,0);
  }
})

test('a baseline without the retry helper is recreated exactly and repeat installation is idempotent', () => {
  const current = readFileSync(new URL('../../runtime/system/app/environment.mjs', import.meta.url), 'utf8');
  const baseline = current.replace(/export function writeProductConfig\([\s\S]+?\n}\n\n/, '').replaceAll('writeProductConfig(', 'writeFileSync(');
  assert.equal(baseline.includes('writeProductConfig'), false);
  const installed = applyProductConfigWrite(baseline);
  assert.equal(installed, current);
  assert.equal(applyProductConfigWrite(installed), installed);
})

test('unknown generated-config write layouts fail instead of silently changing arbitrary files', () => {
  assert.throws(() => applyProductConfigWrite('export function productPaths() {}\nexport function configureProduct() { writeFileSync("unexpected", "data"); }'), /Unexpected generated-config write sites/);
  assert.throws(() => applyProductConfigWrite('export function configureProduct() {}'), /Unexpected generated-config startup baseline/);
})
