import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
const home = resolve('.test-data/integration'), instanceFile = join(home, 'instance.json')
async function state(instance) {
  const session = await fetch(instance.url, { redirect: 'manual' })
  const cookie = session.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const response = await fetch(new URL('/api/mimir/growth/state', instance.url), { headers: { cookie } })
  assert.equal(response.status, 200)
  return (await response.json()).data
}
const beforeInstance = JSON.parse(readFileSync(instanceFile)), before = await state(beforeInstance)
assert.ok(before.activePlanId)
const exit = await fetch(`http://127.0.0.1:${beforeInstance.controlPort}/exit`, { method: 'POST', headers: { 'X-Mimir-Control': beforeInstance.controlToken } })
assert.equal(exit.status, 200)
for (let attempt = 0; attempt < 200 && existsSync(instanceFile); attempt++) await new Promise(resolve => setTimeout(resolve, 100))
assert.equal(existsSync(instanceFile), false, 'Synthetic instance did not stop')
spawn(resolve('runtime/Mimir.exe'), ['--headless', '--data-home', home], { windowsHide: true, stdio: 'ignore', detached: true }).unref()
let afterInstance, after
for (let attempt = 0; attempt < 600; attempt++) {
  if (existsSync(instanceFile)) {
    try { afterInstance = JSON.parse(readFileSync(instanceFile)); after = await state(afterInstance); break } catch {}
  }
  await new Promise(resolve => setTimeout(resolve, 200))
}
assert.ok(after, 'Native headless launcher did not start within 120 seconds')
for (const key of ['version', 'activePlanId', 'profile', 'plans', 'evidence', 'feedback', 'messages', 'forum', 'sharedPlans', 'starredPlanIds', 'journeyFocus', 'journeyChecklist', 'journeyObstacles', 'learningSessions', 'knowledgeSelfReport', 'coursePractice', 'competitionWorkspaces', 'researchDigests']) assert.deepEqual(after[key], before[key], 'Restart changed ' + key)
assert.notEqual(afterInstance.pid, beforeInstance.pid)
writeFileSync('artifacts/restart-check.json', JSON.stringify({ passed: true, launcher: 'runtime/Mimir.exe --headless', checks: ['native launcher starts existing data home', 'new service process', 'version, profile, active plan, history and all evidence retained', 'feedback and local discussion retained', 'journey focus, personal checklist and obstacles retained'], guiValidated: false, paidModelCalls: 0 }, null, 2))
console.log('Restart passed: native headless launcher; all learning records retained.')
