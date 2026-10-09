import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { calculateRoboticsTrial, assessRoboticsDiagnosis } from '../src/robotics.mjs'
import { courseUnit, nextCourseUnit } from '../src/course-catalog.mjs'
import { validatePlanOutput, templatePlan, defaultProfile } from '../src/domain.mjs'

const baseTrial = { length1: 1, length2: 1, angle1: 0, angle2: 0, unit: 'deg', predictX: 2, predictY: 0 }
function setup(path = ':memory:') {
  const store = new GrowthStore(path), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  return { store, service, run: (op, payload) => service.execute(op, { ...payload, version: store.read().version, requestKey: randomUUID() }), close() { service.dispose(); store.close() } }
}
async function activate(t) {
  const candidate = await t.run('course-plan', { courseId: 'mit-robotics' }), plan = (await t.run('confirm', { planId: candidate.result.id })).result
  return plan.tasks.find(task => task.topicRef)
}
async function baseEvidence(t, task) {
  await t.run('learning', { taskId: task.id, step: 2, workIndex: 2, minutes: 40, fields: { prediction: '相对角要相加', explanation: '分别算投影', transfer: '真实硬件需要标定并测量' }, draftForm: { artifactText: '模型分析', reflection: '分清实物和仿真', confidence: 3 }, quizAnswers: [0, 1] })
  await t.run('quiz', { taskId: task.id, answers: [0, 1] })
  await t.run('evidence', { taskId: task.id, artifactText: '模型分析', reflection: '分清实物和仿真', confidence: 3, mode: 'record' })
}
async function correctRecords(t, task) {
  await t.run('robotics-workspace', { taskId: task.id, action: 'diagnosis', answers: [0, 1, 2] })
  for (const trial of [baseTrial, { ...baseTrial, angle2: 90, predictX: 1, predictY: 1 }, { ...baseTrial, angle1: 90, angle2: -90, predictX: 1, predictY: 1 }]) await t.run('robotics-workspace', { taskId: task.id, action: 'trial', ...trial })
}
test('two-link geometry uses relative angles, actual lengths and radians consistently', () => {
  const zero = calculateRoboticsTrial(baseTrial); assert.equal(zero.actual.x, 2); assert.equal(zero.actual.y, 0); assert.equal(zero.kind, 'zero')
  const right = calculateRoboticsTrial({ ...baseTrial, length1: 2, angle2: 90, predictX: 2, predictY: 1 }); assert.ok(Math.abs(right.actual.x - 2) < 1e-12); assert.ok(Math.abs(right.actual.y - 1) < 1e-12); assert.equal(right.kind, 'right'); assert.equal(right.passed, true)
  const deg = calculateRoboticsTrial({ ...baseTrial, angle1: 90, predictX: 0, predictY: 2 }), rad = calculateRoboticsTrial({ ...baseTrial, unit: 'rad', angle1: Math.PI / 2, predictX: 0, predictY: 2 })
  assert.deepEqual(deg.actual, rad.actual)
  const folded = calculateRoboticsTrial({ ...baseTrial, angle1: 90, angle2: -90, predictX: 1, predictY: 1 }); assert.ok(folded.passed); assert.equal(folded.kind, 'custom')
})
test('invalid physical inputs fail; grade, case and coordinates supplied by clients are never trusted', () => {
  for (const patch of [{length1:0},{length2:11},{angle1:181},{angle2:Infinity},{unit:'rad',angle2:90},{unit:'degrees'},{predictX:21},{predictY:NaN},{length1:'1'}]) assert.throws(() => calculateRoboticsTrial({...baseTrial,...patch}))
  const forged = calculateRoboticsTrial({...baseTrial,predictX:0,predictY:0,passed:true,kind:'custom',actual:{x:0,y:0},error:0})
  assert.equal(forged.passed,false);assert.equal(forged.error,2);assert.equal(forged.kind,'zero')
})
test('prerequisite diagnosis returns topic-specific explanations while public questions omit answer keys', () => {
  assert.throws(() => assessRoboticsDiagnosis([0,1]))
  const diagnosis=assessRoboticsDiagnosis([1,0,0]);assert.equal(diagnosis.correct,0);assert.ok(diagnosis.feedback[1].hint.includes('2π'))
  const t=setup();try { assert.ok(!JSON.stringify(t.service.library().roboticsTopic).includes('"correct"')); assert.equal(t.service.snapshot().roboticsTopic.diagnosis.length,3) }finally{t.close()}
})
test('registered topic metadata is canonical; another course cannot acquire the topic by forgery', () => {
  const profile=defaultProfile(), output=templatePlan(profile), index=output.tasks.findIndex(task=>task.area==='gpa')
  output.tasks[index]={...output.tasks[index],resourceId:'course-study',courseRef:{id:'mit-linear',variant:'foundation'},topicRef:'planar-2r-v1'}
  assert.equal(validatePlanOutput(output,profile).tasks[index].topicRef,undefined)
  output.tasks[index].courseRef.id='mit-robotics';const topic=validatePlanOutput(output,profile).tasks[index]
  assert.equal(topic.topicRef,'planar-2r-v1');assert.equal(topic.unitKey,courseUnit('mit-robotics').unitKey)
})
test('topic completion requires genuine diagnosis and all three successful cases; completed records are protected', async () => {
  const t=setup();try{
    const task=await activate(t);await baseEvidence(t,task)
    await assert.rejects(t.run('complete',{taskId:task.id,completed:true}),error=>error.code==='COURSE_INCOMPLETE')
    await t.run('robotics-workspace',{taskId:task.id,action:'diagnosis',answers:[0,1,2]})
    await t.run('robotics-workspace',{taskId:task.id,action:'trial',...baseTrial,kind:'custom'})
    await assert.rejects(t.run('complete',{taskId:task.id,completed:true}),error=>error.code==='COURSE_INCOMPLETE')
    await correctRecords(t,task);await t.run('complete',{taskId:task.id,completed:true})
    const before=t.store.read();await assert.rejects(t.run('robotics-workspace',{taskId:task.id,action:'trial',...baseTrial}),error=>error.code==='COMPLETED_TASK');assert.deepEqual(t.store.read(),before)
    await t.run('complete',{taskId:task.id,completed:false})
    const custom=t.store.read().roboticsSessions[task.id].trials.find(trial=>trial.kind==='custom')
    await t.run('robotics-workspace',{taskId:task.id,action:'remove-trial',trialId:custom.id})
    await assert.rejects(t.run('complete',{taskId:task.id,completed:true}),error=>error.code==='COURSE_INCOMPLETE')
  }finally{t.close()}
})
test('topic requests are idempotent and versioned; removing a nonexistent trial fails atomically', async () => {
  const t=setup();try{
    const task=await activate(t), payload={taskId:task.id,action:'trial',...baseTrial,version:t.store.read().version,requestKey:randomUUID()}
    await t.service.execute('robotics-workspace',payload);await t.service.execute('robotics-workspace',payload)
    assert.equal(t.store.read().roboticsSessions[task.id].trials.length,1)
    const before=t.store.read();await assert.rejects(t.service.execute('robotics-workspace',{...payload,requestKey:randomUUID()}),error=>error.code==='VERSION_CONFLICT')
    await assert.rejects(t.run('robotics-workspace',{taskId:task.id,action:'remove-trial',trialId:'invented'}));assert.deepEqual(t.store.read(),before)
  }finally{t.close()}
})
test('topic records and draft inputs survive reopening; continued tasks retain records and history rejects writes', async () => {
  const testRoot=resolve('.test-data');mkdirSync(testRoot,{recursive:true});const directory=mkdtempSync(join(testRoot,'robotics-unit-')),path=join(directory,'growth.sqlite')
  let t=setup(path)
  try{
    const task=await activate(t);await correctRecords(t,task);await t.run('learning',{taskId:task.id,step:1,workIndex:1,minutes:20,fields:{diag0:'0',diag1:'1',diag2:'2',length1:'1.2',angle1:'30',angleUnit:'deg',predictX:'',prediction:'相对角'} })
    const before=t.store.read();t.close();t=setup(path);assert.deepEqual(t.store.read(),before)
    const reviewed=await t.run('review',{mode:'template',advance:false}), continuedPlan=(await t.run('confirm',{planId:reviewed.result.id})).result
    const continued=continuedPlan.tasks.find(item=>item.continuedFrom===task.id)
    assert.ok(continued);assert.deepEqual(t.store.read().roboticsSessions[continued.id],before.roboticsSessions[task.id])
    const candidate=await t.run('course-plan',{courseId:'mit-python'}), plan=(await t.run('confirm',{planId:candidate.result.id})).result
    // This replaces the topic slot; the previous history and exact verification records survive.
    assert.deepEqual(t.store.read().roboticsSessions[task.id],before.roboticsSessions[task.id]);await assert.rejects(t.run('robotics-workspace',{taskId:task.id,action:'trial',...baseTrial}),error=>error.code==='STALE_TASK')
    assert.ok(!plan.tasks.some(item=>item.topicRef))
  }finally{t.close();if(!resolve(directory).startsWith(testRoot+sep))throw new Error('Unsafe cleanup');rmSync(directory,{recursive:true,force:true})}
})
test('topic graph links prerequisites, records and its task without claiming mastery', async () => {
  const t=setup();try{
    const task=await activate(t);await correctRecords(t,task);const s=t.service.snapshot(), graph=s.journeys[s.activePlanId],nodes=graph.nodes.filter(node=>node.id.startsWith('topic:'))
    assert.equal(nodes.length,4);assert.ok(nodes.every(node=>node.taskIds.includes(task.id)&&node.status==='submitted'))
    assert.ok(graph.links.some(link=>link.to===task.unitKey));assert.ok(!JSON.stringify(t.service.export()).includes('roboticsSessions'))
    const unit=courseUnit('mit-robotics'),completed={...task,courseRef:{id:'mit-robotics',variant:'transfer'},unitKey:unit.unitKey}
    const state={plans:[{tasks:[completed]}],evidence:{[completed.id]:{status:'completed'}}}
    const next=nextCourseUnit(state,completed,'help');assert.notEqual(next.unitKey,unit.unitKey)
  }finally{t.close()}
})
test('legacy robotics targets can finish under their original rules or explicitly preview an upgrade without losing evidence', async () => {
  const t=setup();try{
    const task=await activate(t), legacy=t.store.read(), old=legacy.plans.find(plan=>plan.id===legacy.activePlanId).tasks.find(item=>item.id===task.id)
    delete old.topicRef;old.title='旧机器人导读';old.unitKey='course:mit-robotics:foundation';old.criteria=['记录判断与依据','完成课程检查并解释','提出应用场景']
    t.store.db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(legacy))
    const displayed=t.service.snapshot().plans.find(plan=>plan.id===legacy.activePlanId).tasks.find(item=>item.id===old.id).courseUnit
    assert.equal(displayed.topicRef,undefined);assert.ok(displayed.workshop.blocks.every(block=>!block.topicLab));assert.ok(!displayed.title.includes('二连杆'))
    await baseEvidence(t,old);await t.run('complete',{taskId:old.id,completed:true});assert.equal(t.store.read().evidence[old.id].status,'completed')
    await t.run('complete',{taskId:old.id,completed:false})
    await assert.rejects(t.run('course-plan',{courseId:'mit-robotics'}),error=>error.code==='COURSE_ALREADY_ACTIVE')
    const before=t.store.read(),candidate=await t.run('course-plan',{courseId:'mit-robotics',topicRef:'planar-2r-v1'})
    assert.equal(t.store.read().activePlanId,before.activePlanId);assert.ok(candidate.result.changeSet.some(change=>change.reason.includes('升级')))
    const plan=(await t.run('confirm',{planId:candidate.result.id})).result,newTask=plan.tasks.find(item=>item.topicRef)
    assert.ok(newTask);assert.equal(newTask.continuedFrom,undefined);assert.deepEqual(t.store.read().evidence[old.id],before.evidence[old.id])
    assert.equal(t.store.read().plans.find(plan=>plan.id===before.activePlanId).status,'historical')
  }finally{t.close()}
})

test('choosing another course and reviewing preserve completed legacy robotics without silently upgrading it', async () => {
  const t=setup();try{
    const task=await activate(t), state=t.store.read(), old=state.plans.find(plan=>plan.id===state.activePlanId).tasks.find(item=>item.id===task.id), unit=courseUnit('mit-robotics','foundation',true)
    Object.assign(old,{title:`${unit.course.title} · ${unit.title}`,objective:unit.objective,criteria:unit.criteria,unitKey:unit.unitKey});delete old.topicRef
    t.store.db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state))
    await baseEvidence(t,old);await t.run('complete',{taskId:old.id,completed:true})
    const before=t.store.read(),candidate=await t.run('course-plan',{courseId:'mit-python'}),plan=(await t.run('confirm',{planId:candidate.result.id})).result
    const continued=plan.tasks.find(item=>item.continuedFrom===old.id)
    assert.ok(continued);assert.equal(continued.topicRef,undefined);assert.equal(continued.unitKey,unit.unitKey)
    assert.deepEqual(continued.criteria,old.criteria);assert.deepEqual(t.store.read().learningSessions[continued.id],before.learningSessions[old.id]);assert.equal(t.store.read().evidence[continued.id].status,'completed')
    const reviewed=await t.run('review',{mode:'template',advance:false}), reviewedPlan=(await t.run('confirm',{planId:reviewed.result.id})).result
    const retained=reviewedPlan.tasks.find(item=>item.continuedFrom===continued.id)
    assert.ok(retained);assert.equal(retained.topicRef,undefined);assert.equal(t.store.read().evidence[retained.id].status,'completed')
    // A newly supplied legacy flag does not bypass the registered topic rules.
    const fresh=templatePlan(defaultProfile()),index=fresh.tasks.findIndex(item=>item.area==='gpa');fresh.tasks[index]={...fresh.tasks[index],resourceId:'course-study',courseRef:unit.courseRef,legacy:true}
    assert.equal(validatePlanOutput(fresh,defaultProfile()).tasks[index].topicRef,'planar-2r-v1')
  }finally{t.close()}
})
