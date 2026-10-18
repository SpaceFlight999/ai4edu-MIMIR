import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { installModelPolicy } from '../overrides/app/model-policy.mjs'
import { removeSyntheticPath } from './helpers/synthetic-cleanup.mjs'

const require = createRequire(new URL('../../runtime/system/engine/package.json', import.meta.url))
const nativeLlm = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href)
const deepseek = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm-deepseek')).href)
const { Context, symbols } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
const nativeApi = { ...nativeLlm, originalServiceSymbol: symbols.original }
const chosen = { provider: 'custom-gateway', model: 'user-model' }
const collect = async stream => { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return chunks }

async function fixture(selection = chosen, adapter) {
  const ctx = new Context(), requests = [], saves = []
  let stored = { ...selection }
  const defaults = {
    currentSelection() { return { ...stored } },
    async saveSelection(next) { saves.push(next); stored = { ...next } },
  }
  ctx.reflect.provide('agentDefaultModel', defaults)
  const llm = new nativeLlm.LlmRuntime(ctx)
  class Adapter extends nativeLlm.LlmAdapter {
    async resolveModel(provider, model) {
      return { provider, id: model, name: 'Synthetic configurable model', context: { contextWindow: 1048576 },
        inputModalities: ['text', 'image'], systemPromptUpdate: 'in-history', toolUpdate: 'addition-only', defaultMaxTokens: 1000,
        reasoning: { efforts: ['off', 'low', 'high', 'max'].map(id => ({ id, name: id })), defaultEffort: 'high' } }
    }
    async *stream(options) {
      options.signal?.throwIfAborted()
      requests.push(options)
      yield { type: 'text-delta', text: 'mock result' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const registration = llm.registerAdapter([selection.provider], adapter ?? new Adapter())
  const handle = await installModelPolicy(ctx, { nativeApi })
  const messages = [nativeLlm.createUserMessage({ content: [{ type: 'text', text: 'Synthetic input' }], source: { kind: 'test' } })]
  return { ctx, llm, defaults, handle, requests, saves, messages, registration, close: () => ctx.fiber.dispose() }
}

test('installation preserves persisted provider selection, native methods and user saves without migration', async () => {
  const selected = { ...chosen, reasoningEffort: 'low' }, f = await fixture(selected)
  try {
    assert.deepEqual(f.defaults.currentSelection(), selected)
    assert.deepEqual(f.saves, [])
    for (const key of ['prepareCall', 'stream', 'resolveCallConfig']) assert.equal(Object.hasOwn(f.llm, key), false)
    const next = { provider: 'another-provider', model: 'another-model' }
    await f.defaults.saveSelection(next)
    assert.deepEqual(f.defaults.currentSelection(), next)
    assert.deepEqual(f.saves, [next])
  } finally { await f.close() }
})

test('native prepared Agent keeps the chosen route, frozen identity and one-shot dispatch', async () => {
  const f = await fixture()
  try {
    const config = Object.freeze({ ...chosen, reasoningEffort: 'low', maxTokens: 1600 })
    const prepared = await f.llm.prepareCall(config)
    assert.deepEqual(prepared.config, config)
    assert.equal(prepared.context.contextWindow, 1048576)
    const request = nativeLlm.markAgentLoopRequest(Object.freeze({ ...prepared.config, messages: f.messages, sessionId: 'synthetic-session' }))
    assert.equal((await collect(prepared.stream(request))).at(-1).reason.kind, 'stop')
    assert.equal(f.requests[0], request)
    assert.equal(nativeLlm.isAgentLoopRequest(f.requests[0]), true)
    assert.throws(() => prepared.stream(request), error => error.code === 'INVALID_PREPARED_CALL')
  } finally { await f.close() }
})

test('native validation and cancellation stay effective; disposal is idempotent', async () => {
  const f = await fixture()
  try {
    assert.equal(await installModelPolicy(f.ctx, { nativeApi }), f.handle)
    await assert.rejects(f.llm.prepareCall({ ...chosen, reasoningEffort: 'invalid' }), error => error.code === 'UNSUPPORTED_REASONING_EFFORT')
    const controller = new AbortController(); controller.abort()
    const chunks = await collect(f.llm.stream({ ...chosen, messages: f.messages, signal: controller.signal }))
    assert.equal(chunks.at(-1).reason.kind, 'aborted')
    assert.equal(f.requests.length, 0)
    f.handle.dispose(); f.handle.dispose()
    assert.equal((await collect(f.llm.stream({ ...chosen, messages: f.messages }))).at(-1).reason.kind, 'stop')
  } finally { await f.close() }
})

test('context-shadow native chat repairs once with the same custom provider and model', async () => {
  const f = await fixture(), calls = []
  f.llm.registration(chosen.provider).adapter.stream = async function* (options) {
    calls.push(options)
    yield { type: 'text-delta', text: calls.length === 1 ? '长'.repeat(159) : 'θ₁相对基座+x轴，θ₂相对第一杆；零位末端(2,0)。理想结果不等于实测。先画两杆核对投影。' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  try {
    const prepared = await f.ctx.get('llm').prepareCall({ ...chosen, reasoningEffort: 'low' })
    const messages = [nativeLlm.createSystemMessage('你是 Mimir 科研助手。'),
      nativeLlm.createUserMessage({ content: [{ type: 'text', text: '已知二连杆均1米，零位末端(2,0)。最多120字解释参考系。不要调用工具。' }], source: { kind: 'test' } }),
      nativeLlm.createUserMessage({ content: [{ type: 'text', text: 'State snapshot' }], source: { kind: 'runtime-context' } })]
    const result = await collect(prepared.stream({ ...prepared.config, messages }))
    assert.equal(calls.length, 2)
    assert.ok(calls.every(call => call.provider === chosen.provider && call.model === chosen.model && call.reasoningEffort === 'low'))
    assert.match(result[0].text, /θ₁相对基座/)
    assert.doesNotMatch(result[0].text, /长/)
    assert.equal(calls[1].purpose, 'mimir-research-quality-repair')
  } finally { await f.close() }
})

test('adapter replacement remains native and the configured new route is not rewritten', async () => {
  const f = await fixture()
  try {
    f.registration()
    const second = { provider: 'replacement', model: 'replacement-model' }
    const requests = []
    class Replacement extends nativeLlm.LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id, defaultMaxTokens: 100 } }
      async *stream(options) { requests.push(options); yield { type: 'finish', reason: { kind: 'stop' } } }
    }
    f.llm.registerAdapter([second.provider], new Replacement())
    await f.defaults.saveSelection(second)
    const prepared = await f.llm.prepareCall(second)
    await collect(prepared.stream({ ...prepared.config, messages: f.messages }))
    assert.equal(requests[0].provider, second.provider)
    assert.equal(requests[0].model, second.model)
    assert.equal((await collect(f.llm.stream({ ...chosen, messages: f.messages }))).at(-1).reason.failure.code, 'NO_ADAPTER')
  } finally { await f.close() }
})

test('a native DeepSeek adapter can use a custom endpoint in production without an official-address whitelist', async t => {
  const oldEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const received = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    received.push({ url, body: JSON.parse(options.body) })
    const events = [
      { type: 'message_start', message: { id: 'synthetic-message', type: 'message', role: 'assistant', model: 'deepseek-v4-pro', content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Synthetic result' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ]
    return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  })
  const route = { provider: 'deepseek-official', model: 'deepseek-v4-pro' }
  const adapter = new deepseek.DeepSeekAdapter({ options: () => deepseek.resolveAdapterOptions({ baseURL: 'https://gateway.example:8443/anthropic' }),
    resolveAuth: async () => ({ headers: { 'x-api-key': 'synthetic-only' } }), resolveUserId: () => 'synthetic-user',
    prepareExtensions: async () => ({ fields: {}, accept: async () => {} }) })
  let f
  try {
    f = await fixture(route, adapter)
    const prepared = await f.llm.prepareCall({ ...route, reasoningEffort: 'off', maxTokens: 100 })
    assert.equal((await collect(prepared.stream({ ...prepared.config, messages: f.messages }))).at(-1).reason.kind, 'stop')
    assert.equal(received[0].url, 'https://gateway.example:8443/anthropic/v1/messages')
    assert.equal(received[0].body.model, route.model)
    assert.deepEqual(f.saves, [])
  } finally {
    await f?.close()
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv
  }
})

test('native session titles use the logged request route or an explicit provider override; history and budgets survive', async () => {
  const source = readFileSync(new URL('../overrides/session-title-llm/index.js', import.meta.url), 'utf8')
  const temporary = new URL(`../../runtime/system/engine/.mimir-title-policy-${randomUUID()}.mjs`, import.meta.url)
  writeFileSync(temporary, source)
  let f
  try {
    const title = await import(temporary.href)
    f = await fixture()
    const historical = { type: 'request/header', data: { header: { config: { provider: 'historic', model: 'historic-model' } } } }
    const before = structuredClone(historical), events = [historical]
    const session = { id: 'synthetic-session', append: (type, data) => events.push({ type, data }) }
    const limits = { targetWords: 5, targetCjkCharacters: 10, maxInputBytes: 4096, maxOutputTokens: 64, timeoutMs: 1000 }
    const selected = [{ seq: 1, text: 'Synthetic human input' }], signal = new AbortController().signal
    const result = await title.generateSessionTitleWithLlm(f.ctx, title.resolveSessionTitleLlmConfig(limits), { session, messages: selected, route: chosen, signal }, selected, 'synthetic-title-provider')
    assert.deepEqual(result.model, chosen)
    assert.deepEqual(events[1].data.route, chosen)
    assert.deepEqual(events[0], before)
    assert.equal(f.requests[0].maxTokens, 64)
    assert.equal(f.requests[0].purpose, 'session-title')
    assert.equal(f.requests[0].reasoningEffort, 'high')
    const override = { ...chosen, model: 'title-model' }
    const explicit = await title.generateSessionTitleWithLlm(f.ctx, title.resolveSessionTitleLlmConfig({ ...limits, ...override }), { session, messages: selected, route: chosen, signal }, selected, 'synthetic-title-provider')
    assert.deepEqual(explicit.model, override)
    await assert.rejects(title.generateSessionTitleWithLlm(f.ctx, title.resolveSessionTitleLlmConfig(limits), { session, messages: selected, signal }, selected, 'synthetic-title-provider'), /no logged request route/)
  } finally { await f?.close(); await removeSyntheticPath(temporary, 'title') }
})

test('all native model calls recursively regenerate truncated output before emitting it, preserving route and original evidence', async () => {
  const f = await fixture(), calls = [], emitted = []
  f.llm.registration(chosen.provider).adapter.stream = async function* (options) {
    calls.push(options)
    yield { type: 'text-delta', text: calls.length <= 3 ? '{"claims":[TRUNCATED' : '{"claims":[]}' }
    yield { type: 'finish', reason: { kind: calls.length <= 3 ? 'max-tokens' : 'stop' } }
  }
  try {
    const prepared = await f.llm.prepareCall({ ...chosen, reasoningEffort: 'high', maxTokens: 8000 })
    const original = JSON.stringify(f.messages)
    const request = nativeLlm.markAgentLoopRequest(Object.freeze({ ...prepared.config, messages: f.messages, sessionId: 'reduction-fixture' }))
    for await (const chunk of prepared.stream(request)) emitted.push(chunk)
    assert.equal(calls.length, 4)
    assert.equal(emitted.filter(row => row.type === 'text-delta').map(row => row.text).join(''), '{"claims":[]}')
    assert.equal(JSON.stringify(f.messages), original)
    const targets = calls.slice(1).map(call => Number(call.messages.at(-1).content[0].text.match(/maxProseChars=(\d+)/)?.[1]))
    assert.ok(targets.every((target, i) => target > 0 && (i === 0 || target < targets[i - 1])))
    for (const call of calls) {
      assert.equal(call.provider, chosen.provider); assert.equal(call.model, chosen.model)
      assert.equal(call.reasoningEffort, 'high'); assert.equal(call.maxTokens, 8000)
      assert.equal(call.messages[0], f.messages[0]); assert.equal(nativeLlm.isAgentLoopRequest(call), true)
    }
  } finally { await f.close() }
})

test('persistent truncation stops after six reductions and never exposes partial text', async () => {
  const f = await fixture(), calls = [], emitted = []
  f.llm.registration(chosen.provider).adapter.stream = async function* (options) {
    calls.push(options); yield { type: 'text-delta', text: 'PARTIAL' }; yield { type: 'finish', reason: { kind: 'max-tokens' } }
  }
  try {
    let failure
    try { for await (const chunk of f.llm.stream({ ...chosen, messages: f.messages })) emitted.push(chunk) } catch (error) { failure = error }
    assert.equal(calls.length, 7)
    assert.ok(failure?.code === 'MODEL_OUTPUT_LIMIT' || emitted.at(-1)?.reason?.failure?.code === 'MODEL_OUTPUT_LIMIT')
    assert.ok(!emitted.some(row => row.type === 'text-delta'))
  } finally { await f.close() }
})
