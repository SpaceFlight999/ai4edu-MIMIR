import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {conciseResearchChoice} from '../overrides/host/model-output.mjs';
// Exercise the actual bundled transport functions without starting a second host.
function transport(shortTimeout=false){
  const source=readFileSync(new URL('../overrides/host/unified.js',import.meta.url),'utf8');
  const start=source.indexOf('const trustedModelFailures='),end=source.indexOf('\n}\n',source.indexOf('async function callModel('))+3;
  assert.ok(start>=0&&end>start);
  return vm.runInNewContext(source.slice(start,end)+'\n({callModel,safeModelFailure,isTrusted:error=>trustedModelFailures.has(error)})',{
    randomUUID,conciseResearchChoice,AbortSignal:shortTimeout?{any:AbortSignal.any.bind(AbortSignal),timeout:()=>AbortSignal.timeout(5)}:AbortSignal,
  });
}
test('provider failures retain safe categories and never expose untrusted diagnostic text',()=>{
  const api=transport();
  for(const [input,code] of [[{status:401},'MODEL_AUTH'],[{status:503},'MODEL_PROVIDER_ERROR'],[{code:'CONTEXT_WINDOW_EXCEEDED'},'MODEL_CONTEXT_LIMIT'],[{code:'UNSUPPORTED_REASONING_EFFORT'},'MODEL_REQUEST_INVALID'],...['MODEL_POLICY','MODEL_ENDPOINT_POLICY','MODEL_CONFIGURATION'].map(code=>[{code,status:400},code])]){
    const error=api.safeModelFailure({...input,message:'private upstream diagnostic sk-secret'});
    assert.equal(error.code,code);assert.equal(api.isTrusted(error),true);assert.doesNotMatch(error.message,/sk-secret|private upstream/);
  }
});
test('native writer and model settings map policy errors to fixed safe user messages',async()=>{
  const source=readFileSync(new URL('../overrides/host/index.js',import.meta.url),'utf8');
  const extract=name=>{const start=source.indexOf('function '+name+'(');assert.ok(start>=0);return source.slice(start,source.indexOf('\n}\n',start)+3)};
  const api=vm.runInNewContext([extract('modelPolicyMessage'),extract('modelFailureMessage'),extract('aiModelErrorResponse')].join('\n')+'\n({modelFailureMessage,aiModelErrorResponse})',{Response,ModelSelectionError:class extends TypeError{}});
  const expected={MODEL_POLICY:'当前模型配置被拒绝，请核对所选提供商、模型及其配置。',MODEL_ENDPOINT_POLICY:'当前提供商地址配置无效，请核对该提供商的连接设置。',MODEL_CONFIGURATION:'模型配置无效，请核对所选提供商、思考强度及请求限制。'};
  for(const [code,message]of Object.entries(expected)){
    const failure={code,status:400,message:'private endpoint https://unsafe.example sk-secret userKey',cause:new Error('raw environment'),stack:'private stack'};
    assert.equal(api.modelFailureMessage({failure}),message);
    assert.equal(transport().safeModelFailure(failure).message,message);
    const response=api.aiModelErrorResponse(failure,'fixture-request'),body=await response.json();
    assert.equal(response.status,400);assert.deepEqual(body,{ok:false,error:{code,message,retryable:false},requestId:'fixture-request'});
    assert.doesNotMatch(JSON.stringify(body),/unsafe|sk-secret|userKey|environment|stack/);
  }
});
test('a thinking response that exhausts output tokens produces a specific trusted failure',async()=>{
  const api=transport(),llm={prepareCall:async options=>({config:options,stream:async function*(){yield{type:'finish',reason:{kind:'max-tokens'}};}})};
  await assert.rejects(api.callModel(llm,{provider:'fixture',model:'fixture'},'{}',undefined,'JSON only'),error=>error.code==='MODEL_OUTPUT_LIMIT'&&api.isTrusted(error));
});
test('the per-call timeout is classified instead of becoming an opaque adapter error',async()=>{
  const api=transport(true),llm={prepareCall:()=>new Promise(()=>{})};
  await Promise.all([assert.rejects(api.callModel(llm,{provider:'fixture',model:'fixture'},'{}',undefined,'JSON only'),error=>error.code==='MODEL_TIMEOUT'&&api.isTrusted(error)),new Promise(done=>setTimeout(done,25))]);
});
test('concise research transport avoids the high-reasoning output exhaustion fixture',async()=>{
  const api=transport(),choice={provider:'fixture',model:'fixture',reasoningEffort:'high'};let selected;
  const llm={resolveModelInfo:async()=>({reasoning:{efforts:[{id:'low'},{id:'high'}]}}),prepareCall:async options=>({config:options,stream:async function*(){
    if(options.reasoningEffort==='high'){yield{type:'finish',reason:{kind:'max-tokens'}};return;}
    yield{type:'text-delta',text:'{"draft":[]}'};yield{type:'finish',reason:{kind:'stop'}};
  }})};
  const result=await api.callModel(llm,choice,'{}',undefined,'JSON only',{concise:true,maxTokens:16384,onConfig:options=>selected=options});
  assert.equal(JSON.stringify(result),'{"draft":[]}');assert.equal(selected.reasoningEffort,'low');assert.equal(selected.maxTokens,16384);assert.equal(choice.reasoningEffort,'high');
});
