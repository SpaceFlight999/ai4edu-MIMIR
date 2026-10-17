import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {apply as applyPersona} from '../../runtime/system/engine/node_modules/@deepseek-ai/dsh-persona/lib/index.js'

const writer = readFileSync(new URL('../overrides/host/index.js', import.meta.url), 'utf8')
function promptFunctions() {
  const start = writer.indexOf('var WRITING_STYLES ='), end = writer.indexOf('// src/model-failure.js', start)
  const editing = vm.runInNewContext(writer.slice(start, end) + '\n({editingSystemPrompt,writingQualityPrompt})')
  const moduleStart = writer.indexOf('var MODULE_FIELDS ='), moduleEnd = writer.indexOf('// src/module-assistance.js', moduleStart)
  return vm.runInNewContext(writer.slice(moduleStart, moduleEnd) + '\n({moduleSystemPrompt,editingSystemPrompt})', editing)
}

test('both editable writing entry types preserve evidence qualifiers without adding annotations', () => {
  const {editingSystemPrompt} = promptFunctions()
  for (const kind of ['paragraph', 'latex']) {
    const system = editingSystemPrompt(kind, 'preserve')
    assert.match(system, /语言润色不能提高结论强度/)
    assert.match(system, /保留原文动作、执行者、时态与数量/)
    assert.match(system, /含义不确定时保留原句/)
    assert.match(system, /引用编号或DOI存在不等于支持当前论断/)
    assert.match(system, /不声称已联网核验未提供的来源/)
    assert.match(system, /只返回选区的完整替换内容/)
  }
})

test('research assistance preserves publication uncertainty and existing JSON field contract', () => {
  const system = promptFunctions().moduleSystemPrompt('research', 'preserve')
  assert.match(system, /不把arXiv分配的DOI当作期刊发表或同行评审证明/)
  assert.match(system, /不把全部条目一概称未评审/)
  assert.match(system, /patch仅允许字段：query, sources, limit/)
})

test('figure assistance permits bounded descriptive arithmetic while refusing validation claims from fit alone', () => {
  const system = promptFunctions().moduleSystemPrompt('figure', 'preserve')
  assert.match(system, /按明确方法计算该样本的变化/)
  assert.match(system, /少量共线点或高R²不能证明总体关系、因果或预测可靠性/)
  assert.match(system, /未知单位与误差不得补造/)
  assert.match(system, /patch仅允许字段：mode, name, kind, style, x, y, group, xLabel, yLabel, diagramSpec/)
})

test('paper synthesis carries semantic source and version boundaries to the actual stage request', async () => {
  const source = readFileSync(new URL('../overrides/host/unified.js', import.meta.url), 'utf8')
  const systemStart = source.indexOf('var SYSTEM2 ='), systemEnd = source.indexOf('var STATEMENT =', systemStart)
  const SYSTEM2 = vm.runInNewContext(source.slice(systemStart, systemEnd) + '\nSYSTEM2')
  const start = source.indexOf('  async call(stage, run, signal, payload)'), end = source.indexOf('  async execute(run, signal)', start)
  const call = vm.runInNewContext('({' + source.slice(start, end) + '}).call', {SYSTEM2, SCHEMAS:{synthesis:'schema'}, compactResearchRequest:request=>({payload:request,restore:value=>value}), compactResearchOutput:(_stage,value)=>value, clone:structuredClone, comparisonPolicy:()=>({}), bounded2:operation=>operation(), fail:(code,message)=>Object.assign(new Error(message),{code})})
  let request
  const model = {generate:async value=>{request=value;return{comparisons:[],gaps:[],draft:[]}}}
  const run = {runId:'synthetic',snapshot:[{paperId:'paper-a'}],input:{question:'核对限定',workflow:'synthesis-writing',budget:{maxOutputChars:1000}},metrics:{modelCalls:0,modelTimeMs:0}}
  await call.call({active:new Map([['synthetic',{model}]]),store:{event(){},save(){}}}, 'synthesis', run, new AbortController().signal)
  assert.match(request.system, /metric, units, conditions, sign and negation/)
  assert.match(request.system, /matching number or topic alone is insufficient/)
  assert.match(request.system, /Preserve provided source identities and versions/)
  assert.match(request.system, /must have comparisons: \[\]/)
})

test('research repair supplies both complete nested contracts rather than undefined schema aliases', () => {
  const source = readFileSync(new URL('../overrides/host/unified.js', import.meta.url), 'utf8')
  const start = source.indexOf('var SYSTEM2 ='), end = source.indexOf('var freeze =', start)
  const {SCHEMAS, SYSTEM2} = vm.runInNewContext(source.slice(start, end) + '\n({SCHEMAS,SYSTEM2})')
  assert.ok(SCHEMAS.repair.includes(SCHEMAS.analysis))
  assert.ok(SCHEMAS.repair.includes(SCHEMAS.synthesis))
  assert.doesNotMatch(SCHEMAS.repair, /analysis_schema|synthesis_schema/)
  assert.match(SYSTEM2, /escape embedded quotes, backslashes and line breaks/)
})

test('native research preset delivers source and unit rules through the actual scoped persona API', async () => {
  const source = readFileSync(new URL('../overrides/host/unified.js', import.meta.url), 'utf8')
  const start = source.indexOf('var RESEARCH_PRESET ='), end = source.indexOf('// src/unified-entry.js', start)
  const {applyResearchPreset} = vm.runInNewContext(source.slice(start, end) + '\n({applyResearchPreset})', {process})
  let definition
  await applyResearchPreset({agentPresets:{register:async value=>{definition=value;return()=>{}}},effect(){}})
  const persona = definition.plugins.find(plugin=>plugin.name==='@deepseek-ai/dsh-persona'), sections=[]
  applyPersona({effect:operation=>operation(),systemPrompt:{section:value=>sections.push(value),getSectionOrder:()=>0}}, persona.config)
  const prefix = sections[0]
  assert.match(prefix.text, /遵守用户明确的语言、字数与范围/)
  assert.match(prefix.text, /度或弧度均可用/)
  assert.match(prefix.text, /不能凭空添加无重力、无摩擦等动力学前提/)
  assert.match(prefix.text, /不以杆质量、无质量、重力或摩擦条件作为坐标成立前提/)
  assert.match(prefix.text, /只有问题实际涉及动力学时才按已给条件讨论质量等变量/)
  assert.match(prefix.text, /不能将已给单位称作假设/)
  assert.match(prefix.text, /文字、标点、数字、公式与空白计数，留约20%余量/)
  assert.match(prefix.text, /简单坐标题优先2至3句/)
  assert.match(prefix.text, /不上传个人资料或未授权正文/)
  assert.match(prefix.text, /仅引用实际提供或工具成功读取的来源/)
  assert.equal(prefix.complete, undefined)
  assert.equal(definition.plugins.length, 10)
  assert.ok(definition.plugins.some(plugin=>plugin.id==='tool-web'))
})
