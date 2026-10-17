import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePlanTaskTime } from '../src/plan-time-validation.mjs'
const profile={constraints:'单次最多20分钟'}
const task={hours:1.5,title:'核对相对角',objective:'纸笔推导',criteria:['核对计算']}
test('observed ninety-minute four-to-five-session objective is rejected wherever it appears',()=>{
  for(const field of ['title','objective','criteria']){
    const row={...task,[field]:field==='criteria'?['90分钟分4—5段，单次最多20分钟']: '90分钟分4—5段，单次最多20分钟'}
    assert.throws(()=>validatePlanTaskTime(row,profile),error=>error.code==='INVALID_MODEL_OUTPUT'&&/至少需要5次/.test(error.message))
  }
})
test('feasible schedules and bounded procedural steps remain valid',()=>{
  for(const objective of ['90分钟分5段，单次最多20分钟','90分钟分5—6段，单次最多20分钟','先用20分钟核对第一个算例，剩余时间整理','至少分4段，按单次上限继续分段'])assert.doesNotThrow(()=>validatePlanTaskTime({...task,objective},profile))
})
test('explicit objective and criterion products match hours and the configured limit',()=>{
  assert.throws(()=>validatePlanTaskTime({...task,objective:'分两次20分钟'},profile),/明确分次分钟合计/)
  assert.throws(()=>validatePlanTaskTime({...task,criteria:['分3次30分钟']},profile),/超过单次上限/)
  assert.throws(()=>validatePlanTaskTime({...task,objective:'单次最多30分钟'},profile),/超过学生约束/)
  assert.doesNotThrow(()=>validatePlanTaskTime({...task,objective:'分5次18分钟'},profile))
})
