// Unit fixture only. Native integration separately exercises the actual DSH registry and loop.
export function agentFixture(context, { frames, steps = 1, disposeError } = {}) {
  const stats = { disposed: 0, cancelled: 0, tools: [], sections: [], restrictions: [], guards: [], runtimeContextSuppressed: false, messages: [] }
  const wrapped = { ...context, tools: {}, systemPrompt: {}, agents: { async create(options) {
    const listeners = new Map(), controller = new AbortController()
    let work = Promise.resolve(), ownSection
    const emit = (name, event) => listeners.get(name)?.(event)
    const scoped = {
      on: (name, callback) => listeners.set(name, callback),
      systemPrompt: { section: section => { stats.sections.push(section); ownSection = section }, suppressRuntimeContext: () => { stats.runtimeContextSuppressed = true } },
      tools: { presentAs: () => {}, restrict: filter => stats.restrictions.push(filter), guard: guard => stats.guards.push(guard), register: tool => stats.tools.push(tool) },
    }
    const agent = {
      cancel() { stats.cancelled++; controller.abort(); },
      followup(message) {
        stats.messages.push(message)
        work = (async () => {
          try {
            for (let i = 0; i < steps; i++) { const decision = await listeners.get('agent/pre-step')?.({}, async () => ({ kind: 'enter', messages: [message] })); if (decision?.kind === 'reject') return }
            const stream = frames || (await context.llm.prepareCall(options.agentOptions, controller.signal)).stream({ system: ownSection.text, messages: [message], signal: controller.signal })
            emit('agent/assistant-stream', { frame: { type: 'start' } })
            for await (const chunk of stream) emit('agent/assistant-stream', { frame: { type: 'chunk', chunk } })
            emit('agent/assistant-stream', { frame: { type: 'end', outcome: { kind: 'committed', eventType: 'assistant/message' } } })
          } catch (error) { emit('agent/error', { error }) }
        })()
        const aborted = new Promise(resolve => controller.signal.addEventListener('abort', resolve, { once: true }))
        work = Promise.race([work, aborted])
      },
      whenIdle: () => work,
    }
    await options.setup(scoped, agent)
    return { agent, async dispose() { stats.disposed++; controller.abort(); await work; if (disposeError) throw disposeError } }
  } } }
  return { context: wrapped, stats }
}
