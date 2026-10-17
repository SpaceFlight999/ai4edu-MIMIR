import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import vm from 'node:vm'

const source = readFileSync(new URL('../../scripts/verify-live-growth.mjs', import.meta.url), 'utf8')
const start = source.indexOf('function reportOptions('), end = source.indexOf('\nconst { reportPath, fresh, retryFailed }', start)
function options(args, existing = new Set()) {
  const reportOptions = vm.runInNewContext(source.slice(start, end) + '\nreportOptions', { resolve, join, existsSync: path => existing.has(path) })
  return reportOptions(args, resolve('.'))
}
const operations = ['generate', 'review', 'import', 'feedback', 'evidence', 'research-digest']
function selection(args, prior = null) {
  const start = source.indexOf('function operationOptions('), end = source.indexOf('\nconst { reportPath, fresh, retryFailed }', start)
  const operationOptions = vm.runInNewContext(source.slice(start, end) + '\noperationOptions', { allOperations: operations })
  return operationOptions(args, prior)
}

test('fresh growth review requires a new named report and preserves earlier evidence', () => {
  const path = resolve('artifacts/live-growth-new.json'), original = new Set([path])
  assert.throws(() => options(['--fresh']), /requires --report/)
  assert.throws(() => options(['--fresh', '--report', path], original), /already exists/)
  assert.throws(() => options(['--report', path], original), /already exists/)
  assert.equal(original.size, 1)
  const selected = options(['--fresh', '--report', path])
  assert.equal(selected.reportPath, path)
  assert.equal(selected.fresh, true)
  assert.equal(selected.retryFailed, false)
})

test('growth report selection rejects absent arguments and contradictory retry modes before calls', () => {
  assert.throws(() => options(['--report']), /requires an explicit output path/)
  assert.throws(() => options(['--report', '--only', 'evidence']), /requires an explicit output path/)
  assert.throws(() => options(['--fresh', '--retry-failed', '--report', 'new.json']), /cannot be combined/)
  assert.throws(() => options(['--retry-failed', '--report', 'absent.json']), /requires an existing report/)
})

test('fresh explicit entries select only the named operations with both argument styles', () => {
  for (const args of [['--fresh', '--entries', 'generate,review,import,evidence'], ['--fresh', '--entries=generate,review,import,evidence']]) {
    const result = selection(args)
    assert.deepEqual([...result.requiredOperations], ['generate', 'review', 'import', 'evidence'])
    assert.deepEqual([...result.wanted], ['generate', 'review', 'import', 'evidence'])
  }
  assert.deepEqual([...selection([]).requiredOperations], operations)
  assert.deepEqual([...selection(['--fresh', '--only', 'evidence']).requiredOperations], ['evidence'])
})

test('entry selection rejects empty, unknown, duplicate and conflicting flags before any live call', () => {
  for (const args of [
    ['--fresh', '--entries'], ['--fresh', '--entries', '--report'], ['--fresh', '--entries='],
    ['--fresh', '--entries=generate,'], ['--fresh', '--entries=unknown'], ['--fresh', '--entries=generate,generate'],
    ['--fresh', '--entries=generate', '--entries=review'], ['--entries=evidence'],
    ['--fresh', '--entries=evidence', '--only', 'evidence'], ['--fresh', '--entries=evidence', '--only=evidence'],
    ['--fresh', '--entries=evidence', '--retry-failed'],
  ]) assert.throws(() => selection(args), /--entries/)
  assert.throws(() => selection(['--only', 'unknown']), /--only/)
})

test('unselected entries return before model request, and only selected entries create attempts', async () => {
  const start = source.indexOf('async function live('), end = source.indexOf('\nconst hasActions =', start)
  const requested = [], report = { entries: [] }, wanted = new Set(['generate', 'review', 'import', 'evidence'])
  const route = { provider: 'deepseek-official', model: 'deepseek-flash', engine: 'dsh-agent' }
  const live = vm.runInNewContext(source.slice(start, end) + '\nlive', { report, wanted, state: { activePlanId: 'active' }, activePlanId: 'active', attemptId: 'synthetic', route, assert, structuredClone, console: { log() {} }, request: async operation => {
    requested.push(operation)
    return { response: { ok: true, status: 200 }, result: { model: { ...route, steps: 1, tools: [] } } }
  } })
  for (const operation of operations) await live(operation, { mode: 'model' }, () => ({ syntheticBoundary: true }), () => ({ syntheticSample: true }))
  assert.deepEqual(requested, [...wanted])
  assert.deepEqual(report.entries.map(entry => entry.operation), [...wanted])
  assert.equal(report.entries.length, 4)
})

test('subset report and printed denominator use four selected entries; unselected historical passes are excluded', () => {
  const start = source.indexOf('  const freshWire ='), end = source.lastIndexOf('\n}')
  const selected = ['generate', 'review', 'import', 'evidence'], route = { model: 'deepseek-flash' }
  const metadata = (operation, attemptId) => ({ operation, attemptId, endpoint: 'https://api.deepseek.com/anthropic/v1/messages', requestModel: route.model, responseModel: route.model, httpStatus: 200, streamCompleted: true })
  const report = { entries: [...selected.map(operation => ({ operation, attemptId: 'current', passed: true, schemaValidatedByActualService: true, boundedAutomaticChecks: { schema: true } })), { operation: 'feedback', attemptId: 'old', passed: true, schemaValidatedByActualService: true }], credentialsRemovedFromSyntheticHome: true, secretNotRecorded: true,
    requiredOperations: selected, requestedOperations: selected, notAttemptedEntries: operations.filter(name => !selected.includes(name)).map(operation => ({ operation, status: 'not-attempted', passed: null })) }
  const prior = { at: 'earlier', entries: [], realOnlineProviderRequests: 1, providerRequests: [metadata('feedback', 'old')] }, saved = [], logs = [], process = {}
  vm.runInNewContext(source.slice(start, end), { report, prior, wirePath: 'synthetic-wire', existsSync: () => true, readFileSync: () => JSON.stringify(selected.map(operation => metadata(operation, 'current'))), route, attemptId: 'current', wanted: new Set(selected), requiredOperations: selected, reportPath: 'synthetic-report', key: 'synthetic-key-never-in-content', writeFileSync: (path, text) => saved.push({ path, value: JSON.parse(text) }), console: { log: value => logs.push(value) }, process })
  assert.equal(report.providerRequests.length, 5)
  assert.equal(report.passed, true)
  assert.equal(report.transportAndSchemaPassed, true)
  assert.equal(report.boundedAutomaticQualityChecksPassed, true)
  assert.equal(report.manualQualityPassed, null)
  assert.equal(report.notAttemptedEntries.length, 2)
  assert.ok(report.notAttemptedEntries.every(entry => entry.status === 'not-attempted' && entry.passed === null))
  assert.match(logs[0], /4\/4 selected entries passed; 5 official provider requests/)
  assert.equal(saved.at(-1).value.requestedOperations.length, 4)
  assert.equal(process.exitCode, undefined)
})

test('full retained plan supplies actual weekly and total task hours for semantic review', () => {
  const start = source.indexOf('const planSample ='), end = source.indexOf('\nasync function stop()', start)
  const sample = vm.runInNewContext(source.slice(start, end) + '\nplanSample', { state: { profile: { weeklyHours: 2 } } })
  const tasks = [1, 1, 2, 2].map((week, index) => ({ title: 'task-' + index, objective: 'Registered objective', criteria: ['criterion'], resourceId: 'course-study', courseRef: { id: 'mit-linear', variant: 'foundation' }, hours: .5, week, prerequisites: [] }))
  const plan = { title: 'Synthetic', summary: 'Will require review.', rationale: 'Retained unmodified.', tasks, roadmap: [], questions: [] }
  const result = sample(plan)
  assert.equal(result.tasks.length, 4)
  assert.equal(result.timeBudget.weeklyHoursUpperBound, 2)
  assert.equal(result.timeBudget.scheduledWeek1Hours, 1)
  assert.equal(result.timeBudget.scheduledWeek2Hours, 1)
  assert.equal(result.timeBudget.scheduledTotalHours, 2)
  assert.equal(result.rationale, plan.rationale)
  assert.equal(result.tasks[3].courseRef.id, 'mit-linear')
})

test('outer growth setup failure retains current wire rows and leaves semantic review pending', () => {
  const start = source.indexOf('  const freshWire ='), end = source.indexOf('  if (JSON.stringify(report).includes(key))', start)
  const report = { entries: [], error: { code: 'SYNTHETIC_STARTUP_FAILURE' }, credentialsRemovedFromSyntheticHome: true, secretNotRecorded: true }
  const currentWire = [{ operation: 'generate', attemptId: 'current', httpStatus: 200, responseModel: 'deepseek-flash', streamCompleted: true }]
  vm.runInNewContext(source.slice(start, end), { report, prior: null, wirePath: 'synthetic-wire', existsSync: () => true, readFileSync: () => JSON.stringify(currentWire), route: { model: 'deepseek-flash' }, attemptId: 'current', wanted: new Set(['generate']), requiredOperations: ['generate', 'review', 'import', 'feedback', 'evidence', 'research-digest'], reportPath: 'synthetic-report' })
  assert.equal(report.providerRequests.length, 1)
  assert.equal(report.realOnlineProviderRequests, 1)
  assert.equal(report.attempts[0].officialProviderRequests, 1)
  assert.equal(report.passed, false)
  assert.equal(report.transportAndSchemaPassed, false)
  assert.equal(report.boundedAutomaticQualityChecksPassed, false)
  assert.equal(report.manualQualityPassed, null)
  assert.equal(report.manualQualityReview.status, 'pending')
})

test('retry transport verification uses its own attempt rows while keeping every paid earlier row', () => {
  const start = source.indexOf('  const freshWire ='), end = source.indexOf('  if (JSON.stringify(report).includes(key))', start)
  const report = { entries: [{ operation: 'evidence', attemptId: 'new', passed: true, schemaValidatedByActualService: true, boundedAutomaticChecks: { schema: true } }], credentialsRemovedFromSyntheticHome: true, secretNotRecorded: true }
  const prior = { at: 'earlier', entries: [], realOnlineProviderRequests: 1, providerRequests: [{ operation: 'evidence', attemptId: 'old', httpStatus: 500 }] }
  const currentWire = [{ operation: 'evidence', attemptId: 'new', httpStatus: 200, responseModel: 'deepseek-flash', streamCompleted: true }]
  vm.runInNewContext(source.slice(start, end), { report, prior, wirePath: 'synthetic-wire', existsSync: () => true, readFileSync: () => JSON.stringify(currentWire), route: { model: 'deepseek-flash' }, attemptId: 'new', wanted: new Set(['evidence']), requiredOperations: ['evidence'], reportPath: 'synthetic-report' })
  assert.equal(report.providerRequests.length, 2)
  assert.equal(report.providerRequests[0].httpStatus, 500)
  assert.equal(report.entries[0].providerRequests, 1)
  assert.equal(report.entries[0].actualOfficialTransportVerified, true)
  assert.equal(report.entries[0].passed, true)
  assert.equal(report.manualQualityPassed, null)
})

test('synthetic provider telemetry retains failed JSON verbatim but redacts a key before persistence', async () => {
  const start = source.indexOf('function preloadSource()'), end = source.indexOf('\nasync function getState()', start)
  const preload = vm.runInNewContext(source.slice(start, end) + '\npreloadSource()', { wirePath: 'synthetic-wire', fixtureFeed: '<feed/>', attemptId: 'synthetic-attempt', JSON })
  const writes = [], secret = 'synthetic-private-key-0123456789', malformed = '{"overview":"unterminated'
  let finished
  const completion = new Promise(resolve => { finished = resolve })
  const events = [
    { type: 'message_start', message: { model: 'deepseek-flash', usage: { input_tokens: 1 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: malformed + secret } },
    { type: 'message_delta', usage: { output_tokens: 1 }, delta: { stop_reason: 'end_turn' } },
    { type: 'message_stop' },
  ]
  const chunks = events.map(event => ({ value: new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'), done: false }))
  const context = vm.createContext({ URL, Headers, TextDecoder, Response, writeFileSync: (_file, value) => writes.push(value), fetch: async () => ({ status: 200, url: 'https://api.deepseek.com/anthropic/v1/messages', clone: () => ({ body: { getReader: () => ({ read: async () => chunks.shift() || { done: true }, releaseLock: finished }) } }) }) })
  vm.runInContext(preload.replace("import { writeFileSync } from 'node:fs';", ''), context)
  await context.fetch('https://api.deepseek.com/anthropic/v1/messages', { headers: { 'x-api-key': secret }, body: JSON.stringify({ model: 'deepseek-flash', messages: [] }) })
  await completion
  const rows = JSON.parse(writes.at(-1))
  assert.equal(rows[0].responseText, malformed + '[REDACTED]')
  assert.equal(rows[0].streamCompleted, true)
  assert.equal(rows[0].responseModel, 'deepseek-flash')
  assert.ok(writes.every(value => !value.includes(secret)))
  assert.throws(() => JSON.parse(rows[0].responseText))
})
