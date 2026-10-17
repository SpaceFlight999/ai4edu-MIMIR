// Explicit live verification. Synthetic learner and literature data; actual bundled DSH and official model.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { defaultProfile } from '../growth/src/domain.mjs'

if (!process.argv.includes('--live')) throw new Error('Explicit --live required for billable official model verification.')
const root = resolve('.'), version = JSON.parse(readFileSync(join(root, 'growth/package.json'), 'utf8')).version
const allOperations = ['generate', 'review', 'import', 'feedback', 'evidence', 'research-digest']
function reportOptions(args, root) {
  const reportAt = args.indexOf('--report'), fresh = args.includes('--fresh'), retryFailed = args.includes('--retry-failed')
  if (reportAt >= 0 && (!args[reportAt + 1] || args[reportAt + 1].startsWith('--'))) throw new Error('--report requires an explicit output path.')
  if (fresh && (reportAt < 0 || retryFailed)) throw new Error('--fresh requires --report and cannot be combined with --retry-failed.')
  const reportPath = reportAt >= 0 ? resolve(args[reportAt + 1]) : join(root, 'artifacts', 'live-growth-20261010.json')
  if (existsSync(reportPath) && !retryFailed) throw new Error('The output report already exists; use --fresh --report with a new path to preserve historical evidence.')
  if (retryFailed && !existsSync(reportPath)) throw new Error('--retry-failed requires an existing report.')
  return { reportPath, fresh, retryFailed }
}
function operationOptions(args, prior = null) {
  const entriesFlags = args.filter(arg => arg === '--entries' || arg.startsWith('--entries='))
  if (entriesFlags.length > 1) throw new Error('--entries may be specified only once.')
  if (entriesFlags.length && (!args.includes('--fresh') || args.some(arg => arg === '--only' || arg.startsWith('--only=')) || args.includes('--retry-failed'))) throw new Error('--entries requires --fresh and cannot be combined with --only or --retry-failed.')
  let selected = prior ? prior.entries.filter(entry => !entry.passed).map(entry => entry.operation) : [...allOperations]
  if (entriesFlags.length) {
    const flag = entriesFlags[0], value = flag === '--entries' ? args[args.indexOf(flag) + 1] : flag.slice('--entries='.length)
    if (!value || value.startsWith('--')) throw new Error('--entries requires a comma-separated operation list.')
    selected = value.split(',').map(name => name.trim())
    if (selected.some(name => !allOperations.includes(name))) throw new Error('--entries contains an unknown or empty operation.')
    if (new Set(selected).size !== selected.length) throw new Error('--entries must not contain duplicate operations.')
  }
  const onlyAt = args.indexOf('--only')
  if (onlyAt >= 0) {
    const operation = args[onlyAt + 1]
    if (!selected.includes(operation)) throw new Error('--only must name an entry selected for this verification attempt.')
    selected = [operation]
  }
  if (!selected.length) throw new Error('No failed entry is selected. A new semantic-quality review requires --fresh --report, not a transport retry.')
  return { requiredOperations: selected, wanted: new Set(selected) }
}
const { reportPath, fresh, retryFailed } = reportOptions(process.argv, root)
const attemptId = randomUUID(), home = join(root, '.test-data', 'live-growth-' + attemptId), wirePath = join(home, 'provider-metadata.json')
const route = { provider: 'deepseek-official', model: 'deepseek-flash', engine: 'dsh-agent' }
const prior = retryFailed ? JSON.parse(readFileSync(reportPath, 'utf8')) : null
if (prior && prior.growthVersion !== version) throw new Error('A failed-entry retry must match the installed growth version.')
const { requiredOperations, wanted } = operationOptions(process.argv, prior)
const sourceVerification = ['model.mjs', 'plan-time-validation.mjs', 'plan-science-validation.mjs', 'dsh-agent.mjs', 'domain.mjs', 'robotics.mjs', 'host.mjs'].map(name => {
  const sourceSha256 = createHash('sha256').update(readFileSync(join(root, 'growth/src', name))).digest('hex')
  const installedSha256 = createHash('sha256').update(readFileSync(join(root, 'runtime/system/engine/node_modules/@mimir/growth-layer/src', name))).digest('hex')
  if (sourceSha256 !== installedSha256) throw new Error('Installed growth source is stale; install final backend changes before a live run: ' + name)
  return { file: 'growth/src/' + name, sourceSha256, installedSha256, matched: true }
})
let key = process.env.MIMIR_LIVE_API_KEY
delete process.env.MIMIR_LIVE_API_KEY
if (!key?.trim()) throw new Error('MIMIR_LIVE_API_KEY must be supplied temporarily by the caller.')
const report = { passed: false, at: new Date().toISOString(), attemptId, freshVerification: fresh, requiredOperations, requestedOperations: [...wanted], notAttemptedEntries: allOperations.filter(operation => !wanted.has(operation)).map(operation => ({ operation, status: 'not-attempted', passed: null, reason: 'Not selected for this verification attempt; any historical result remains separate.' })), growthVersion: version, installedSourcesMatchedBeforeCalls: true, sourceVerification, actualDshRuntime: true, officialEndpoint: 'https://api.deepseek.com/anthropic', requestedModel: route,
  literatureSource: 'explicitly synthetic arXiv Atom fixture; not real papers', learnerSource: 'synthetic isolated learner only', entries: prior ? prior.entries.filter(entry => entry.passed) : [],
  ...(prior ? { previousAttempts: [...(prior.previousAttempts || []), ...prior.entries.filter(entry => !entry.passed)], firstAttemptReport: prior.firstAttemptReport || reportPath, retainedSuccessfulSamplesAt: prior.at } : {}),
  limitations: ['One live sample per existing AI entry, with an extra retry only for an observed failure; does not establish all future response quality.', 'Literature source is synthetic, so this does not verify live arXiv availability or real-paper accuracy.', 'HTTP and backend verification; browser usability belongs to separate UI regression.'] }
let host, instance, origin, cookie, state, activePlanId
const delay = ms => new Promise(done => setTimeout(done, ms))
async function waitFor(check, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await check()) return; await delay(100) }
  throw Object.assign(new Error('The isolated host did not become ready within its startup limit.'), { code: 'HOST_STARTUP_TIMEOUT' })
}
const fixtureFeed = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>https://arxiv.org/abs/2609.90001v1</id><title>[Synthetic verification fixture, not a real paper] Limited robot control</title><published>2026-09-30T12:00:00Z</published><summary>This is synthetic evaluation material, not a real publication. In an ideal planar simulator, a controller was compared against one baseline on 20 fixed trajectories at the same speed and payload. Mean tracking error was 0.04 m versus 0.05 m. No hardware tests, confidence intervals, unseen tasks, or peer-review status were provided.</summary><author><name>Synthetic author</name></author></entry>
<entry><id>https://arxiv.org/abs/2609.90002v1</id><title>[Synthetic verification fixture, not a real paper] Constrained robot planning</title><published>2026-09-29T12:00:00Z</published><summary>This is synthetic evaluation material, not a real publication. A planner was evaluated in ten simulated obstacle maps under a fixed collision-checking rule. Nine planned paths passed that simulated rule. Timing, repeated trials, hardware tests, and a comparison with the controller in the other synthetic entry were not supplied.</summary><author><name>Synthetic author</name></author></entry>
</feed>`

function preloadSource() {
  // Synthetic verification only: retain response text as well as route/status/usage, with request-secret redaction before every file write. Never persist headers.
  return `import { writeFileSync } from 'node:fs';
const original = globalThis.fetch, rows = [], file = ${JSON.stringify(wirePath)};
const save = () => writeFileSync(file, JSON.stringify(rows));
function kind(body) {
  for (const message of body.messages || []) for (const block of message.content || []) {
    if (block.type !== 'text') continue;
    try { const p = JSON.parse(block.text);
      if (p.resources) return p.review ? 'review' : p.sharedTemplate ? 'import' : 'generate';
      if (p.artifactText !== undefined && p.task) return 'evidence';
      if (p.message !== undefined) return 'feedback';
      if (Array.isArray(p.items)) return 'research-digest';
    } catch {}
  }
  return 'runtime-helper';
}
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin === 'https://export.arxiv.org' && url.pathname === '/api/query') return new Response(${JSON.stringify(fixtureFeed)}, { headers: { 'content-type': 'application/atom+xml' } });
  if (url.origin !== 'https://api.deepseek.com' || !url.pathname.startsWith('/anthropic') || !url.pathname.endsWith('/messages')) return original(input, options);
  const started = Date.now(), body = JSON.parse(options.body), row = { attemptId: ${JSON.stringify(attemptId)}, sequence: rows.length + 1, startedAt: new Date(started).toISOString(), operation: kind(body), endpoint: url.origin + url.pathname, requestModel: body.model, thinking: body.thinking?.type || null };
  const requestHeaders = new Headers(options.headers), transientSecrets = [requestHeaders.get('x-api-key'), requestHeaders.get('authorization')?.replace(/^Bearer\\s+/i, '')].filter(value => value?.length >= 8);
  const redactResponseText = value => transientSecrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
  rows.push(row); save();
  let response;
  try { response = await original(input, options); row.httpStatus = response.status; }
  catch { row.error = 'PROVIDER_TRANSPORT'; row.durationMs = Date.now() - started; save(); throw new Error('Official provider transport failed.'); }
  if (new URL(response.url).origin !== 'https://api.deepseek.com') throw new Error('Unexpected official provider response origin.');
  const reader = response.clone().body.getReader();
  void (async () => {
    const decoder = new TextDecoder(); let pending = '';
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        pending += decoder.decode(item.value, { stream: true });
        const lines = pending.split('\\n'); pending = lines.pop();
        for (const line of lines) if (line.startsWith('data: ')) {
          try { const event = JSON.parse(line.slice(6));
            if (event.type === 'message_start') { row.responseModel = event.message?.model; row.inputTokens = event.message?.usage?.input_tokens; }
            if (event.type === 'message_delta') { row.outputTokens = event.usage?.output_tokens; row.stopReason = event.delta?.stop_reason; }
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') row.responseText = redactResponseText((row.responseText || '') + event.delta.text);
            if (event.type === 'message_stop') row.streamCompleted = true;
          } catch {}
        }
      }
    } catch { if (!row.streamCompleted) row.telemetryIncomplete = true; }
    finally { row.durationMs = Date.now() - started; save(); reader.releaseLock(); }
  })();
  return response;
};`
}
async function getState() {
  const response = await fetch(origin + '/api/mimir/growth/state', { headers: { cookie }, signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200, 'Isolated growth state unavailable.')
  state = (await response.json()).data
  return state
}
async function request(operation, payload) {
  const response = await fetch(origin + '/api/mimir/growth/' + operation, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, version: state.version, requestKey: randomUUID() }), signal: AbortSignal.timeout(330000) })
  const body = await response.json()
  if (response.ok) state = body.data.state
  return { response, body, result: body.data?.result }
}
async function setup(operation, payload) {
  const { response, result } = await request(operation, payload)
  assert.equal(response.status, 200, 'Synthetic setup operation failed: ' + operation)
  return result
}
async function live(operation, payload, verify, sample) {
  if (!wanted.has(operation)) return
  const before = structuredClone(state), started = Date.now(), entry = { operation, attemptId, attemptedAt: new Date(started).toISOString(), httpStatus: null, passed: false, schemaValidatedByActualService: false }
  report.entries.push(entry)
  try {
    const { response, body, result } = await request(operation, payload)
    entry.httpStatus = response.status; entry.elapsedMs = Date.now() - started
    if (!response.ok) {
      entry.error = { code: body.error?.code || 'HTTP_FAILURE', message: body.error?.message || 'The live operation failed.' }
      assert.deepEqual(await getState(), before, 'Failed live output changed isolated learner state.')
      entry.failedStateUnchanged = true
      console.log(operation + ': failed (' + entry.error.code + ')')
      return
    }
    const model = operation === 'feedback' ? state.messages.at(-1)?.model : result.model
    assert.equal(model?.provider, route.provider); assert.equal(model?.model, route.model); assert.equal(model?.engine, route.engine)
    entry.model = { provider: model.provider, model: model.model, engine: model.engine, steps: model.steps, tools: model.tools }
    entry.schemaValidatedByActualService = true
    assert.equal(state.activePlanId, activePlanId, 'A live candidate changed the active plan without confirmation.')
    entry.boundedAutomaticChecks = verify(result)
    entry.sample = sample(result)
    entry.semanticReview = { status: 'pending', passed: null, rubric: operation === 'evidence' ? ['Credit every original criterion supported by the supplied artifact; no extra general-angle or extra-example requirement.', 'Match every numerical assertion to its own inputs, units and applicable tool result.', 'Do not complete learner tasks or claim hardware validation.'] : ['Read the complete retained sample against supplied context and registered task scope.', 'Check factual claims, assumptions, source boundaries and any scheduling arithmetic.', 'Separate supported results from suggested next steps.'] }
    entry.passed = true
    console.log(operation + ': transport/schema passed, ' + Math.round(entry.elapsedMs / 1000) + 's')
  } catch (error) {
    entry.elapsedMs = Date.now() - started
    entry.error = { code: error.code || error.name || 'VERIFICATION_FAILURE', message: 'Live verification did not satisfy the expected route, schema or state boundary.' }
    console.log(operation + ': verification failed (' + entry.error.code + ')')
  }
}
const hasActions = value => /检查|核对|记录|计算|对照|验证|列出|写出|比较/.test(value)
const avoidsUnfoundedGuarantees = value => !/保证.{0,12}(获奖|录用|通过|掌握)|已自动(完成|修改|保存)|已为你(完成|修改|保存)/.test(value)
const planQuality = plan => ({ remainsCandidate: plan.status === 'draft', hasSpecificTasks: plan.tasks.every(task => task.objective.trim() && task.criteria.every(item => item.trim())), feasibleTwoWeekBudget: [1, 2].every(week => plan.tasks.filter(task => task.week === week).reduce((sum, task) => sum + task.hours, 0) <= state.profile.weeklyHours + .01), groundedNextActions: hasActions(JSON.stringify(plan.tasks)), noUnfoundedGuarantees: avoidsUnfoundedGuarantees(plan.summary + plan.rationale) })
const planSample = plan => ({ title: plan.title, summary: plan.summary, rationale: plan.rationale,
  timeBudget: { weeklyHoursUpperBound: state.profile.weeklyHours, scheduledWeek1Hours: plan.tasks.filter(task => task.week === 1).reduce((sum, task) => sum + task.hours, 0), scheduledWeek2Hours: plan.tasks.filter(task => task.week === 2).reduce((sum, task) => sum + task.hours, 0), scheduledTotalHours: plan.tasks.reduce((sum, task) => sum + task.hours, 0), singleSessionLimitMinutesFromSyntheticProfile: 20 },
  tasks: plan.tasks.map(({ area, title, objective, criteria, resourceId, courseRef, hours, week, prerequisites }) => ({ area, title, objective, criteria, resourceId, courseRef, hours, week, prerequisites })), roadmap: plan.roadmap, questions: plan.questions })
async function stop() {
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  if (host) { await waitFor(() => host.exitCode !== null, 10000).catch(() => host.kill()); await delay(150) }
}
function secretInFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && secretInFiles(path)) return true
    if (entry.isFile() && readFileSync(path).includes(Buffer.from(key))) return true
  }
  return false
}
async function removeCredentialCarriers() {
  const names = ['.credentials.yaml', '.credentials.yaml.lock', 'model.secret']
  const errors = []
  for (const name of names) {
    for (let attempt = 0; attempt <= 8; attempt++) {
      try { rmSync(join(home, name), { force: true }); break }
      catch (error) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === 8) { errors.push({ file: name, code: error.code || 'CLEANUP_FAILED' }); break }
        await delay(Math.min(20 * 2 ** attempt, 200))
      }
    }
  }
  return errors
}
try {
  mkdirSync(join(home, 'profiles/web'), { recursive: true }); mkdirSync(resolve(reportPath, '..'), { recursive: true })
  writeFileSync(join(home, 'profiles/web/cordis.patch.yml'), '- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: off\n- id: llm-deepseek\n  config:\n    baseURL: https://api.deepseek.com/anthropic\n    thinking: disabled\n    retryPolicy:\n      mode: normal\n      maxRetries: 0\n')
  const preload = join(home, 'verification-preload.mjs'); writeFileSync(preload, preloadSource())
  host = spawn(process.execPath, ['--import', pathToFileURL(preload).href, join(root, 'runtime/system/app/app.mjs'), '--data-home', home], { cwd: root, windowsHide: true, env: { ...process.env }, stdio: ['pipe', 'ignore', 'ignore'] })
  host.stdin.end(JSON.stringify({ apiKey: key }))
  await waitFor(() => { if (host.exitCode !== null) throw Object.assign(new Error('Isolated host exited before readiness.'), { code: 'HOST_STARTUP_FAILED' }); return existsSync(join(home, 'instance.json')) })
  instance = JSON.parse(readFileSync(join(home, 'instance.json'), 'utf8')); origin = new URL(instance.url).origin
  const session = await fetch(instance.url, { redirect: 'manual', signal: AbortSignal.timeout(5000) }); cookie = session.headers.getSetCookie().map(item => item.split(';')[0]).join('; ')
  await getState(); assert.equal(state.growthVersion, version); assert.equal(state.modelSelection.model, route.model)
  const profile = { ...defaultProfile(), name: '合成验收学生', weeklyHours: 2, horizonWeeks: 4, weights: { research: 0, competition: 0, gpa: 100, interest: 0 }, depths: { research: 'intro', competition: 'intro', gpa: 'intro', interest: 'intro' }, goal: '理解平面二连杆中第二关节相对角，能自己计算零角和直角特例。', baseline: '会三角函数和角度弧度换算，尚未系统学运动学。', constraints: '每次最多20分钟，无实体机械臂，仅做纸笔与理想模型核对。', purpose: '先判断是否需要补线性代数，再进入机器人课程。' }
  report.syntheticProfile = profile
  report.syntheticLiteratureFeed = fixtureFeed
  const initial = await setup('generate', { mode: 'template', profile }); const active = await setup('confirm', { planId: initial.id }); activePlanId = active.id
  await live('generate', { mode: 'model', profile }, planQuality, planSample)
  await live('review', { mode: 'model', advance: false }, planQuality, planSample)
  const exported = await fetch(origin + '/api/mimir/growth/export', { headers: { cookie }, signal: AbortSignal.timeout(5000) }); assert.equal(exported.status, 200)
  const template = (await exported.json()).data
  await live('import', { mode: 'model', template, profile }, planQuality, planSample)
  await live('feedback', { mode: 'model', message: '我会零角特例，但不理解第二段为什么用θ₁+θ₂。今晚只有20分钟，想先自己画图检查，不想直接抄整套答案。' }, () => { const reply = state.messages.at(-1)?.text || ''; return { addressesRelativeAngle: /相对|θ|第二/.test(reply), givesConcreteCheck: hasActions(reply), doesNotClaimPlanChanged: avoidsUnfoundedGuarantees(reply), hasVisibleReply: reply.trim().length > 0 } }, () => ({ reply: state.messages.at(-1)?.text }))
  const task = active.tasks[0]
  const evidenceInput = { mode: 'model', taskId: task.id, artifactText: '合成学生的纸笔记录：θ₂是第二连杆相对第一连杆的角，第二连杆全局角为θ₁+θ₂。L₁=L₂=1米，θ₁=θ₂=0°时投影相加得到(2,0)米。θ₁=0°、θ₂=90°时得到(1,1)米。三角函数计算先将度换成弧度。以上是理想平面计算，没有硬件测试。', reflection: '我能说明相对角与全局角区别，但希望用θ₁不为零的特例再检查。', confidence: 3 }
  await live('evidence', evidenceInput, result => ({ checksMatchOriginalCriteria: result.assessment.checks.every((check, index) => check.criterion === task.criteria[index]), suppliedDefinitionAndTwoSpecialCasesCredited: result.assessment.checks.slice(0, 2).every(check => check.status === 'supported'), bothSuppliedExamplesUseNumericTool: result.model.tools.filter(tool => tool.name === 'growth_robotics_check' && tool.success).length >= 2, doesNotCompleteTask: result.status === 'submitted', hasConcreteNextStep: hasActions(result.assessment.nextStep), recognizesProvidedBoundary: /理想|实物|硬件|纸笔|未.*(测|验)|仿真/.test(JSON.stringify(result.assessment)), noUnfoundedGuarantees: avoidsUnfoundedGuarantees(JSON.stringify(result.assessment)) }), result => ({ originalTask: { title: task.title, objective: task.objective, resourceId: task.resourceId, courseRef: task.courseRef, criteria: task.criteria }, suppliedArtifact: evidenceInput.artifactText, suppliedReflection: evidenceInput.reflection, assessment: result.assessment, status: result.status,
    independentlyCheckedReferenceCases: [{ length1: 1, length2: 1, angle1: 0, angle2: 0, unit: 'deg', expected: { x: 2, y: 0 } }, { length1: 1, length2: 1, angle1: 0, angle2: 90, unit: 'deg', expected: { x: 1, y: 1 } }, { length1: 1, length2: 1, angle1: 30, angle2: 90, unit: 'deg', expected: { x: (Math.sqrt(3) - 1) / 2, y: (1 + Math.sqrt(3)) / 2 }, note: 'Review oracle only; not supplied to the model or counted as learner evidence.' }] }))
  await live('research-digest', { topic: 'robot-learning', count: 5 }, result => ({ exactSyntheticSourceIds: result.items.map(item => item.id).sort().join(',') === '2609.90001v1,2609.90002v1', acknowledgesEvidenceLimit: /摘要|全文|模拟|仿真|合成/.test(JSON.stringify(result)), containsReadingQuestions: result.items.every(item => item.question.trim().length > 0), noUnfoundedGuarantees: avoidsUnfoundedGuarantees(result.overview) }), result => ({ overview: result.overview, items: result.items }))
} catch (error) {
  report.error = { code: error.code || error.name || 'VERIFICATION_SETUP_FAILURE', message: 'The isolated live verification setup or state boundary failed.' }
  process.exitCode = 1
} finally {
  await stop()
  report.credentialCleanupErrors = await removeCredentialCarriers()
  report.credentialsRemovedFromSyntheticHome = report.credentialCleanupErrors.length === 0 && ['.credentials.yaml', '.credentials.yaml.lock', 'model.secret'].every(name => !existsSync(join(home, name)))
  report.secretNotRecorded = !existsSync(home) || !secretInFiles(home)
  const freshWire = existsSync(wirePath) ? JSON.parse(readFileSync(wirePath, 'utf8')) : []
  const wire = [...(prior?.providerRequests || []), ...freshWire]
  report.providerRequests = wire
  report.realOnlineProviderRequests = wire.length
  report.allActualModelsCanonical = wire.length > 0 && wire.every(row => row.endpoint === 'https://api.deepseek.com/anthropic/v1/messages' && row.requestModel === route.model && row.responseModel === route.model)
  for (const entry of report.entries) {
    const entryWire = entry.attemptId ? wire.filter(row => row.operation === entry.operation && row.attemptId === entry.attemptId) : (prior?.providerRequests || []).filter(row => row.operation === entry.operation)
    entry.providerRequests = entryWire.length
    entry.actualResponseModels = [...new Set(entryWire.map(row => row.responseModel).filter(Boolean))]
    entry.actualOfficialTransportVerified = entry.providerRequests > 0 && entryWire.every(row => row.httpStatus === 200 && row.responseModel === route.model && row.streamCompleted === true)
    entry.passed &&= entry.actualOfficialTransportVerified
  }
  report.attempts = [...(prior?.attempts || (prior ? [{ at: prior.at, operations: prior.requestedOperations || prior.entries.map(entry => entry.operation), officialProviderRequests: prior.realOnlineProviderRequests, sourceReport: reportPath }] : [])), { attemptId, at: report.at, operations: [...wanted], officialProviderRequests: freshWire.length, backendSchemaPassed: report.entries.filter(entry => entry.attemptId === attemptId && entry.passed).length, backendSchemaRejected: report.entries.filter(entry => entry.attemptId === attemptId && !entry.passed).map(entry => entry.operation) }]
  report.remainingEntries = requiredOperations.filter(operation => !report.entries.some(entry => entry.operation === operation && entry.passed))
  const selectedEntries = report.entries.filter(entry => requiredOperations.includes(entry.operation))
  report.passed = !report.error && report.remainingEntries.length === 0 && report.credentialsRemovedFromSyntheticHome && report.secretNotRecorded
  report.passDefinition = 'Actual official model transport, backend schema/state boundaries and credential cleanup; semantic quality requires separate human review.'
  report.transportAndSchemaPassed = !report.error && report.remainingEntries.length === 0 && selectedEntries.length === requiredOperations.length && selectedEntries.every(entry => entry.passed && entry.schemaValidatedByActualService && entry.actualOfficialTransportVerified)
  report.boundedAutomaticQualityChecksPassed = selectedEntries.length === requiredOperations.length && selectedEntries.every(entry => {
    const checks = entry.boundedAutomaticChecks || entry.quality
    return checks && Object.values(checks).every(value => value === true)
  })
  report.manualQualityPassed = null
  report.manualQualityReview = { status: 'pending', passed: null, referenceRubric: 'docs/ai-growth-quality-followup-2026-10-10.md', limitation: 'Regex and schema checks do not certify mathematical, pedagogical or scheduling accuracy; inspect the complete synthetic samples. A pending review is not a semantic pass.' }
  if (JSON.stringify(report).includes(key)) throw new Error('Credential redaction check failed before report persistence.')
  if (prior) writeFileSync(reportPath + '.before-' + attemptId + '.json', JSON.stringify(prior, null, 2) + '\n', { flag: 'wx' })
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: prior ? 'w' : 'wx' })
  key = null
  console.log('Live growth transport/schema verification: ' + selectedEntries.filter(entry => entry.passed).length + '/' + requiredOperations.length + ' selected entries passed; ' + wire.length + ' official provider requests; human quality review required.')
  if (!report.passed) process.exitCode = 1
}
