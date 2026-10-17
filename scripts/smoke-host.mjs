import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const instance = JSON.parse(readFileSync('.test-data/integration/instance.json', 'utf8'))
const base = new URL(instance.url).origin
const authenticated = await fetch(instance.url, { redirect: 'manual' })
const cookie = authenticated.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
assert.ok(cookie, 'Login did not establish a browser session')
async function get(path, authenticated = true) {
  const response = await fetch(base + path, { headers: authenticated ? { cookie } : {} })
  const raw = await response.text()
  let body; try { body = JSON.parse(raw) } catch { body = { text: raw.slice(0, 80) } }
  return { status: response.status, body }
}
let state = (await get('/api/mimir/growth/state')).body.data
assert.equal(typeof state.version, 'number')
async function post(operation, payload) {
  const response = await fetch(base + '/api/mimir/growth/' + operation, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, version: state.version, requestKey: randomUUID() }) })
  const body = await response.json()
  assert.equal(response.status, 200, `${operation}: ${body.error?.message}`)
  assert.equal(body.ok, true); state = body.data.state
  return body.data.result
}
assert.equal((await get('/api/mimir/growth/state', false)).status, 401)
const blocked = await fetch(base + '/api/mimir/growth/profile', { method: 'POST', headers: { cookie, origin: 'https://example.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ profile: state.profile, version: state.version, requestKey: randomUUID() }) })
assert.equal(blocked.status, 403)
const original = await get('/api/mimir/document'); assert.equal(original.status, 200)
const priorActive = state.activePlanId
const draft = await post('generate', { mode: 'template', profile: state.profile }); assert.equal(state.activePlanId, priorActive)
const plan = await post('confirm', { planId: draft.id })
const task = plan.tasks.find((task) => task.area === 'gpa')
const quiz = await post('quiz', { taskId: task.id, answers: [1, 0] }); assert.equal(quiz.correct, 2)
await post('evidence', { taskId: task.id, artifactText: '第一段的全局角为θ1，第二段为θ1+θ2，坐标是两个投影之和。两个特例分别为(2,0)与(1,1)。', reflection: '以前把第二关节角当成全局角，现在理解了相对角。', confidence: 4, mode: 'record' })
await post('complete', { taskId: task.id, completed: true })
await post('feedback', { message: '更喜欢控制方向，下阶段希望加强课程迁移和产线状态机。', mode: 'record' })
const reviewed = await post('review', { mode: 'template', advance: true }); await post('confirm', { planId: reviewed.id })
assert.equal(state.evidence[task.id].status, 'completed')
const exported = await get('/api/mimir/growth/export'); assert.equal(exported.body.data.format, 'mimir-growth-template'); assert.ok(!JSON.stringify(exported.body.data).includes('以前把第二'))
await post('forum-reply', { postId: 'sorting', message: '先区分可恢复故障与需要人工确认的安全异常。' })
const validation = await fetch(base + '/api/mimir/growth/validate-share', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ template: { ...exported.body.data, privateNotes: 'PRIVATE-NOTES' } }) })
assert.equal(validation.status, 200); assert.ok(!JSON.stringify(await validation.json()).includes('PRIVATE-NOTES'))
const invalid = await fetch(base + '/api/mimir/growth/validate-share', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ template: { format: 'mimir-growth-template', schemaVersion: 1, title: {} } }) })
assert.equal(invalid.status, 400)
await post('star', { planId: 'robot-control', starred: true })
assert.equal(state.sharingCatalog.find(plan => plan.id === 'robot-control').starred, true)
await post('star', { planId: 'robot-control', starred: false })
const savedShare = await post('save-share', { template: exported.body.data })
assert.ok(state.sharingCatalog.some(plan => plan.id === savedShare.id))
mkdirSync('artifacts', { recursive: true })
writeFileSync('artifacts/host-smoke.json', JSON.stringify({ passed: true, checks: ['authenticated state', 'unauthenticated rejection', 'cross-origin rejection', 'existing document service', 'draft confirmation', 'robotics exercise', 'evidence submission', 'completion', 'feedback', 'stage review', 'history retention', 'safe export', 'local forum reply', 'import whitelist validation', 'invalid import rejection', 'Star and unstar', 'shared plan library'], version: state.version, paidModelCalls: 0 }, null, 2))
writeFileSync('artifacts/smoke-reference.json', JSON.stringify({ activePlanId: state.activePlanId, evidenceTaskId: task.id, version: state.version }))
console.log('Host smoke passed: 17 scenarios; no paid model calls.')
