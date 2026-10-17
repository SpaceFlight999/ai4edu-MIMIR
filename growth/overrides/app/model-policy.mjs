import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { checkedResearchChatStream } from './research-chat-quality.mjs'

const installations = new WeakMap()

async function installedNativeApi() {
  const require = createRequire(new URL('../engine/package.json', import.meta.url))
  const [llm, cordis] = await Promise.all([
    import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href),
    import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href),
  ])
  return { ...llm, originalServiceSymbol: cordis.symbols.original }
}

/** Keep research reply checks while preserving all native provider settings. */
export async function installModelPolicy(ctx, { nativeApi } = {}) {
  const native = nativeApi ?? await installedNativeApi()
  const raw = value => native.originalServiceSymbol ? value?.[native.originalServiceSymbol] ?? value : value
  const llm = raw(ctx.get?.('llm') ?? ctx.llm)
  if (!llm || typeof llm.prepareCall !== 'function' || typeof ctx.on !== 'function'
    || typeof native.LlmError !== 'function') throw new Error('MIMIR 科研回复检查无法启动：原生模型服务未就绪。')
  if (installations.has(llm)) return installations.get(llm)

  // Cordis uses a context shadow at dispatch. Compare its service-owned
  // registry so unrelated runtimes are untouched. Never rewrite the route,
  // native prepared request, connection options or persisted model selection.
  const stop = (llm.ctx ?? ctx).on('llm/stream', function (options, next) {
    if (this?.adapters !== llm.adapters) return next()
    const originalStream = next()
    return checkedResearchChatStream(options, () => originalStream, async ({ signal, messages }) => {
      const prepared = await llm.prepareCall({
        provider: options.provider, model: options.model,
        ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
        ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      }, signal)
      return prepared.stream({ ...prepared.config, messages, signal, purpose: 'mimir-research-quality-repair' })
    }, native)
  }, { prepend: true, global: true })
  let disposed = false
  const handle = Object.freeze({ dispose() {
    if (disposed) return
    disposed = true
    stop()
    installations.delete(llm)
  } })
  installations.set(llm, handle)
  if (typeof ctx.effect === 'function') ctx.effect(() => handle.dispose, 'mimir.research-reply-quality')
  return handle
}
