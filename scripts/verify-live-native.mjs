// Explicit live smoke: isolated synthetic materials, actual bundled host and official DSH transport.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { longPaperFixture } from './long-paper-fixture.mjs'
import { connectBrowser } from './cdp.mjs'
import { openResearchChat, sendResearchChat, readNewResearchReply } from './research-chat-driver.mjs'
import { nativeRunOptions } from './live-native-options.mjs'
import { hasAutomaticExecutionClaim, readJsonComplete } from './live-native-evidence.mjs'

if (!process.argv.includes('--live')) throw new Error('Explicit --live and a temporary MIMIR_LIVE_API_KEY are required.')
const root = resolve('.')
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID()
const { selectedEntries, requiredEntries, reportPath, resumePath, chatOnly, remaining, explicitEntries } = nativeRunOptions(process.argv.slice(2), root, runId)
let key = process.env.MIMIR_LIVE_API_KEY
delete process.env.MIMIR_LIVE_API_KEY
if (!key) throw new Error('Temporary verification key is missing.')
const previous = resumePath ? JSON.parse(readFileSync(resumePath, 'utf8')) : null
const fixtureId = previous?.fixtureId ?? 'live-native-' + randomUUID()
assert.match(fixtureId, /^live-native-[0-9a-f-]{36}$/)
const home = join(root, '.test-data', fixtureId), marker = join(home, 'owned-by-live-native.json')
if (previous?.fixtureId) assert.equal(JSON.parse(readFileSync(marker, 'utf8')).material, 'synthetic live native fixture')
const report = { passed: false, at: new Date().toISOString(), version: JSON.parse(readFileSync('growth/package.json')).version, material: 'isolated synthetic documents and data only', officialEndpoint: 'https://api.deepseek.com/anthropic', model: 'deepseek-flash', entries: [], limitations: ['One controlled live sample per entry; output quality still requires human judgement.', 'No private learner or research materials were transmitted.'] }
report.fixtureId = fixtureId
report.runId = runId
report.resumeMode=chatOnly?'chat-only':remaining?'remaining':explicitEntries?'selected-fresh':'all-fresh'
report.selectedEntries = chatOnly ? ['research-chat'] : selectedEntries
report.requiredEntries = requiredEntries
if (resumePath) report.resumedFrom = resumePath.slice(root.length + 1).replaceAll('\\', '/')
const telemetry=join(home,'wire-'+randomUUID()+'.json')
report.wire = previous?.wire ?? []
if (previous) {
  report.entries = previous.entries.filter(row => row.passed)
  const previousAttempts=[...(previous.previousAttempts??[]),...previous.entries.filter(row=>!row.passed)]
  report.previousAttempts=[...new Map(previousAttempts.map(row=>[JSON.stringify(row),row])).values()]
  report.diagnosticFailures = [...(previous.diagnosticFailures ?? []), ...(previous.failure ? [previous.failure] : [])]
}
mkdirSync(dirname(reportPath), { recursive: true })
// Reserve the new path before spawning anything; historical reports are never overwritten.
writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
const delay = ms => new Promise(done => setTimeout(done, ms))
const sanitize = value => JSON.parse(JSON.stringify(value).replaceAll(key, '[redacted]').replace(/token=[^\s&"\\]+/g, 'token=[redacted]').replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [redacted]'))
const wanted = name => selectedEntries.includes(name) && (!chatOnly || name === 'research-chat') && !previous?.entries.some(row => row.entry === name && row.passed)
let host, instance, origin, cookie, paperUrl, browser, edge, hostOutput = '', setupStage = 'prepare'
async function wait(check, timeout = 60000) {
  const until = Date.now() + timeout
  while (Date.now() < until) { const value = await check(); if (value) return value; await delay(150) }
  throw new Error('Isolated verification wait expired.')
}
async function api(path, input, bytes) {
  const response = await fetch(origin + path, { method: input === undefined && !bytes ? 'GET' : 'POST', headers: { cookie, origin, ...(bytes ? bytes.headers : { 'content-type': 'application/json' }) }, body: bytes?.body ?? (input === undefined ? undefined : JSON.stringify(input)), signal: AbortSignal.timeout(330000) })
  const body = await response.json()
  if (!response.ok || body.ok === false) throw Object.assign(new Error('A live operation was rejected.'), { code: body.error?.code ?? 'HTTP_' + response.status, actualResponse: body })
  return body.data ?? body
}
async function paper(operation, input = {}, bytes) {
  const response = await fetch(new URL('api/' + operation, paperUrl), { method: 'POST', headers: { 'X-Paper-Guide': '1', 'content-type': bytes ? 'application/pdf' : 'application/json' }, body: bytes ?? JSON.stringify(input), signal: AbortSignal.timeout(330000) })
  const result = await response.json()
  if (!response.ok || result.error) throw Object.assign(new Error('A live paper operation was rejected.'), { code: result.error?.code ?? result.error ?? 'HTTP_' + response.status, actualResponse: result })
  return result
}
async function sample(name, call, check) {
  if (!wanted(name)) return
  const row = { entry: name, passed: false, sourceFixture: report.sourceFixtures?.[name] }, started = Date.now(), firstWire = existsSync(telemetry) ? readJsonComplete(telemetry).length : 0; report.entries.push(row)
  try {
    const result = await call(); row.quality = check(result); row.passed = Object.values(row.quality).every(Boolean)
    if(name==='research-synthesis-writing')row.semanticSample={comparisons:result.result.synthesis.comparisons,draft:result.result.synthesis.draft,issues:result.result.review.issues}
    row.actualResponse = sanitize(result)
    row.sample = JSON.stringify(result).slice(0, 1800)
    if (result.provider || result.model) row.route = { provider: result.provider, model: result.model }
  } catch (error) { row.error = sanitize({ code: error.code ?? error.name, message: error.message, ...(error.actualResponse ? { actualResponse: error.actualResponse } : {}) }) }
  row.elapsedSeconds = Math.round((Date.now() - started) / 1000)
  row.wireStart = (previous?.wire?.length ?? 0) + firstWire
  row.wireEnd = (previous?.wire?.length ?? 0) + (existsSync(telemetry) ? readJsonComplete(telemetry).length : firstWire)
  writeFileSync(reportPath, JSON.stringify(sanitize(report), null, 2))
  console.log(name + ': ' + (row.passed ? 'passed' : 'failed') + ', ' + row.elapsedSeconds + 's')
}
const canonical = result => result.provider === 'deepseek-official' && result.model === 'deepseek-flash'
async function guide(id, operation) {
  const task = await paper(operation, { paperId: id, consent: true, scope: 'paper', depth: 'overview', ...(operation === 'ask' ? { question: '这份合成资料能否证明真实设备的性能？只使用所给原文，说明不能断言的部分。' } : {}) })
  return wait(async () => { const row = await paper('task', { id: task.id }); if (row.status === 'failed') throw Object.assign(new Error('Live paper task failed.'), { code: row.error.code, actualResponse: row }); return row.status === 'succeeded' ? row.result : null }, 330000)
}
try {
  mkdirSync(join(home, 'profiles/web'), { recursive: true })
  writeFileSync(marker, JSON.stringify({ material: 'synthetic live native fixture' }))
  writeFileSync(join(home, 'profiles/web/cordis.patch.yml'), '- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: off\n- id: llm-deepseek\n  config:\n    baseURL: https://api.deepseek.com/anthropic\n    thinking: disabled\n    retryPolicy:\n      mode: normal\n      maxRetries: 0\n')
  // Record only actual model/usage metadata from the provider, preserving real responses.
  const preload = join(home, 'telemetry.mjs')
  writeFileSync(preload, String.raw`
import { writeFileSync } from 'node:fs';
const original = fetch, rows = [], output = ${JSON.stringify(telemetry)};
const save = () => writeFileSync(output, JSON.stringify(rows));
async function observe(response, row) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'message_start') { row.responseModel = event.message.model; row.inputTokens = event.message.usage?.input_tokens; }
          if (event.type === 'content_block_start' && event.content_block?.type === 'text') row.responseText = (row.responseText ?? '') + (event.content_block.text ?? '');
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') row.responseText = (row.responseText ?? '') + event.delta.text;
          if (event.type === 'message_delta') { row.outputTokens = event.usage?.output_tokens; row.stopReason = event.delta?.stop_reason; }
        } catch { /* SSE keep-alives are not metadata. */ }
      }
      save();
    }
  } catch { /* Native cancellation after message_stop must not affect the request. */ }
  finally {
    reader.releaseLock();
    try { row.responseJson = JSON.parse((row.responseText ?? '').trim().replace(/^\x60\x60\x60(?:json)?\s*\n|\n\x60\x60\x60$/g, '')); } catch { /* Plain text or invalid JSON remains available verbatim. */ }
    save();
  }
}
globalThis.fetch = async (...args) => {
  const u = new URL(args[0] instanceof Request ? args[0].url : String(args[0]));
  if (u.origin !== 'https://api.deepseek.com' || !u.pathname.endsWith('/messages')) return original(...args);
  const raw = args[1]?.body ?? (args[0] instanceof Request ? await args[0].clone().text() : '{}');
  const request = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
  const row = { requestModel: request.model, endpoint: u.origin + u.pathname, thinking: request.thinking?.type, inputCharacters: JSON.stringify(request.messages ?? []).length, systemCharacters: JSON.stringify(request.system ?? '').length, messageCount: request.messages?.length ?? 0 };
  rows.push(row); save();
  try {
    const response = await original(...args); row.status = response.status; save();
    void observe(response.clone(), row).catch(() => {});
    return response;
  } catch (error) { row.transportError = error.name; save(); throw error; }
};`)
  host = spawn(process.execPath, ['--import', pathToFileURL(preload).href, join(root, 'runtime/system/app/app.mjs'), '--data-home', home], { windowsHide: true, cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
  for (const stream of [host.stdout, host.stderr]) stream.on('data', data => { hostOutput = (hostOutput + data).slice(-12000) });
  setupStage = 'native-boot'; host.stdin.end(JSON.stringify({ apiKey: key }))
  await wait(() => { if (host.exitCode !== null) throw new Error('Isolated host failed to start.'); return existsSync(join(home, 'instance.json')) })
  instance = JSON.parse(readFileSync(join(home, 'instance.json'))); origin = new URL(instance.url).origin
  const login = await fetch(instance.url, { redirect: 'manual' }); cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  setupStage = 'initial-document'; const originalDocument = await api('/api/mimir/document')
  report.sourceFixtures = {}
  if(!chatOnly){
  for (const kind of ['paragraph', 'latex']) {
    const input = { kind, before: kind === 'paragraph' ? 'The simulation result is useful for this example. No hardware test was performed.' : '\\section{Simulation}\nThe model was checked with two inputs. No hardware test was performed.', instruction: 'Improve clarity in English. Preserve every factual limitation; do not add experiments, data, citations or a claim of real-device validation.' }
    report.sourceFixtures['suggest-' + kind] = input
    await sample('suggest-' + kind, () => api('/api/mimir/ai/suggest', input), value => ({ canonical: canonical(value), replacementOnly: typeof value.after === 'string' && !value.after.startsWith('```'), limitationPreserved: /[Nn]o hardware|not.*hardware|without.*hardware/.test(value.after) }))
  }
  const csv = await api('/api/mimir/files/import', undefined, { headers: { 'x-mimir-filename': 'synthetic.csv' }, body: 'time,distance\n0,0\n1,1\n2,2\n' })
  const pdfBytes = longPaperFixture(1, 'live'), pdf = await api('/api/mimir/files/import', undefined, { headers: { 'x-mimir-filename': 'synthetic.pdf' }, body: pdfBytes })
  report.fileFixtures = { csv: { sourceId: csv.id, text: 'time,distance\n0,0\n1,1\n2,2\n' }, pdf: { sourceId: pdf.id, pages: 1, bytes: pdfBytes.length, sha256: createHash('sha256').update(pdfBytes).digest('hex'), sourceText: Array.from({ length: 44 }, (_, row) => `This synthetic paper studies a simple measurement system. Fixture live page 1 row ${row}: method evidence.`).join('\n'), limitations: 'Repeated synthetic descriptive lines; no measured outcomes, hardware validation, units or physical constraints are supplied.' } }
  const requests = [
    ['word', { fields: { title: 'Synthetic notes', body: 'One ideal simulation was discussed. No hardware tests were performed.' } }, 'Improve this short body in English. Preserve limitations; there is no imported Word file, so do not propose tracked replacements or claim file edits.'],
    ['markdown', { fields: { name: 'Synthetic notes', body: '# Result\n\nAn ideal simulation was discussed. No hardware tests were performed.' } }, 'Improve clarity in English, preserving the heading and the hardware limitation.'],
    ['pdf', { sourceId: pdf.id, fields: { action: 'extract', pageStart: '1', pageEnd: '1' } }, '用中文说明实际读到的合成PDF的主题与证据范围。只分析，不提出文件操作，不宣称真实论文结论。'],
    ['figure', { sourceId: csv.id, fields: { mode: 'plot', kind: 'line', style: 'journal', x: 'time', y: 'distance' } }, 'Explain in English whether the given three synthetic rows justify a line chart. Use only the actual time/distance columns; do not invent units or a population finding.'],
    ['run', { fields: { runtime: 'python', code: 'print(1 + 1)', fileIds: [] } }, 'Explain what this Python snippet would print. Do not run it, install anything or write files. Only change code if necessary.'],
    ['research', { fields: { query: 'ideal planar robot verification', sources: ['arxiv'], limit: '3' }, results: [], readouts: [], checks: [] }, '给出具体检索与核查计划。没有检索结果，不能列论文、DOI、实验结果或声称已经读过全文。'],
  ]
  for (const [module, context, instruction] of requests) {
    report.sourceFixtures['assist-' + module] = { module, context, instruction, ...(module === 'pdf' ? { file: report.fileFixtures.pdf } : module === 'figure' ? { file: report.fileFixtures.csv } : {}) }
    setupStage = 'assist-' + module
    await sample('assist-' + module, () => api('/api/mimir/ai/assist', { module, context, instruction }), value => ({ canonical: canonical(value), originalSchema: typeof value.summary === 'string' && typeof value.notes === 'string' && value.patch && typeof value.patch === 'object', useful: Boolean(value.summary.trim()) && Boolean(value.notes.trim()), noAutomaticExecutionClaim: !hasAutomaticExecutionClaim(value.notes) }))
  }
  assert.deepEqual(await api('/api/mimir/document'), originalDocument, 'AI assistance changed the original manuscript.')
  if (['paper-guide', 'paper-question', 'research-synthesis-writing'].some(wanted)) {
  const open = await api('/api/paper-guide/open', { rpcId: 'live-native' }); paperUrl = open.result.value.url
  const existingPaper = previous?.fixtureId ? (await paper('papers')).find(row => row.title === 'Synthetic-live.pdf') : null
  const imported = existingPaper ?? await paper('import?title=Synthetic-live.pdf', {}, pdfBytes), paperId = imported.paperId ?? imported.paper?.paperId
  assert.ok(paperId)
  await wait(async () => (await paper('paper', { paperId })).paper.parseStatus === 'ready')
  await paper('reading', { paperId, page: 1, zoom: 1, enableTools: true })
  for (const name of ['paper-guide', 'paper-question', 'research-synthesis-writing']) report.sourceFixtures[name] = { file: report.fileFixtures.pdf, paperId, selectedPages: [1], ...(name === 'paper-question' ? { question: '这份合成资料能否证明真实设备的性能？只使用所给原文，说明不能断言的部分。' } : name === 'research-synthesis-writing' ? { question: '用中文写一份简短草稿，说明所给合成资料能支持哪些结论和无法验证哪些条件；不要假造实验或论文。' } : { depth: 'overview' }) }
  await sample('paper-guide', () => guide(paperId, 'generate'), value => ({ canonical: value.model.provider === 'deepseek-official' && value.model.model === 'deepseek-flash', hasLocatedEvidence: value.claims.length > 0 && value.claims.every(claim => !['作者主张', '系统解释'].includes(claim.kind) || claim.evidence.length > 0), sourceBounded: value.coverage.pages.length === 1 }))
  await sample('paper-question', () => guide(paperId, 'ask'), value => ({ canonical: value.model.provider === 'deepseek-official' && value.model.model === 'deepseek-flash', answeredWithClaims: value.claims.length > 0, sourceBounded: value.coverage.pages.length === 1 }))
  const currentPaper = (await paper('paper', { paperId })).paper
  await sample('research-synthesis-writing', async () => {
    const run = await paper('research-start', { consent: true, workflow: 'synthesis-writing', question: '用中文写一份简短草稿，说明所给合成资料能支持哪些结论和无法验证哪些条件；不要假造实验或论文。', papers: [{ paperId, version: currentPaper.version, pages: [1] }] })
    return wait(async () => { const row = await paper('research-get', { runId: run.runId, view: 'full' }); if (row.status === 'failed') throw Object.assign(new Error('Live research failed.'), { code: row.error.code, actualResponse: row }); return row.status === 'succeeded' ? row : null }, 330000)
  }, value => ({ succeeded: value.status === 'succeeded', draftAndReview: value.result.synthesis.draft.length > 0 && Boolean(value.result.review), citationsValidated: value.metrics.invalidCitationsBlocked === 0, noAutomaticManuscriptWrite: JSON.stringify(value.result.synthesis.draft).length > 0 }))
  }
  }
  if (wanted('research-chat')) {
  setupStage = 'research-chat-browser'
  const browserHome = join(home, 'browser-'+randomUUID()); edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--no-first-run', '--user-data-dir=' + browserHome, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  await wait(() => existsSync(join(browserHome, 'DevToolsActivePort')))
  browser = await connectBrowser(Number(readFileSync(join(browserHome, 'DevToolsActivePort'), 'utf8').split('\n')[0]))
  await browser.send('Page.navigate', { url: instance.url }); await browser.waitFor("Boolean(document.querySelector('.mg-well-landing'))")
  const chatPrompt = '这是一条合成教学验收。已知理想二连杆长均为1米，角均为0度，末端为(2,0)米；没有实物测试。请用中文最多120字解释参考系、限制与我可做的一个核查步骤。不要调用工具、执行代码或修改资料。'
  report.sourceFixtures['research-chat'] = { prompt: chatPrompt, assistantOnly: true, characterLimit: 120, givenResult: '(2,0) 米', hardwareEvidence: 'None supplied' }
  setupStage = 'research-chat-response'
  await sample('research-chat', async () => {
    await openResearchChat(browser)
    const previousReplies=await sendResearchChat(browser, chatPrompt)
    const text=await readNewResearchReply(browser,previousReplies,150000)
    return { text }
  }, value => ({ visibleReply: /核对|检查|验证|代入/.test(value.text), limitation: value.text.includes('实物'), requestedLength: Array.from(value.text).length <= 120 }))
  }
  await delay(500)
  report.manuscriptUnchanged = JSON.stringify(await api('/api/mimir/document')) === JSON.stringify(originalDocument)
} catch (error) { report.failure = { code: error.code ?? error.name, message: error.message.replaceAll(key, '[redacted]').replace(/token=[^\s&]+/g, 'token=[redacted]'), stage: setupStage, hostDiagnostic: hostOutput.replaceAll(key, '[redacted]').replace(/token=[^\s&]+/g, 'token=[redacted]').slice(-3500) } }
finally {
  await browser?.close().catch(() => {}); edge?.kill()
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  if (host) await wait(() => host.exitCode !== null, 10000).catch(() => host.kill())
  // Each resume records into a fresh file; even an outer setup/browser failure retains new paid-call metadata.
  let freshWire=[]
  try{if(existsSync(telemetry))freshWire=readJsonComplete(telemetry)}catch{report.telemetryReadFailed=true}
  report.wire=[...(previous?.wire??[]),...freshWire]
  report.allActualModelsCanonical=report.wire.length>0&&report.wire.every(row=>row.requestModel==='deepseek-flash'&&row.responseModel==='deepseek-flash'&&row.status===200)
  report.remainingEntries=requiredEntries.filter(name=>!report.entries.some(row=>row.entry===name&&row.passed))
  report.passed=!report.failure&&!report.telemetryReadFailed&&report.remainingEntries.length===0&&report.entries.every(row=>row.passed)&&report.allActualModelsCanonical&&report.manuscriptUnchanged===true
  // Remove only persisted secret carriers in this freshly created fixture.
  function removeSecretCarriers(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) removeSecretCarriers(file)
      else if (['instance.json', 'model.secret', '.credentials.yaml', '.credentials.yaml.lock'].includes(entry.name) || readFileSync(file).includes(Buffer.from(key))) rmSync(file, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  }
  try { removeSecretCarriers(home); report.credentialsRemoved = true }
  catch (error) { report.credentialsRemoved = false; report.cleanupFailure = { code: error.code ?? error.name }; report.passed = false }
  const safeReport = sanitize(report)
  key = null
  writeFileSync(reportPath, JSON.stringify(safeReport, null, 2))
  console.log(JSON.stringify({ passed: report.passed, completedEntries: report.entries.length, actualCalls: report.wire?.length ?? 0, failure: report.failure }))
  if (!report.passed) process.exitCode = 1
}
