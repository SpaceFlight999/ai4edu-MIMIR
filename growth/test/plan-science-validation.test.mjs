import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePlanAngleConsistency} from '../src/plan-science-validation.mjs'
test('observed identical global angles described as different are rejected without replacing the original exercise',()=>{
  for(const pair of [['90','90'],['0','360'],['-90','270']]){
    const task={criteria:[`第二杆全局角不同：前者为${pair[0]}°，后者为${pair[1]}°。`]},before=structuredClone(task)
    assert.throws(()=>validatePlanAngleConsistency(task),error=>error.code==='INVALID_MODEL_OUTPUT'&&/相同/.test(error.message));assert.deepEqual(task,before)
  }
  assert.doesNotThrow(()=>validatePlanAngleConsistency({criteria:['第二杆全局角不同：前者为90°，后者为180°。']}))
  assert.doesNotThrow(()=>validatePlanAngleConsistency({criteria:['第二杆全局角均为90°，末端位置因第一杆不同而不同。']}))
})
