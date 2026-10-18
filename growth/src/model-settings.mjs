import { fail, GrowthError } from './domain.mjs'

const queues = new WeakMap()
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
const supportsText = model => model?.inputModalities === undefined || (Array.isArray(model.inputModalities) && model.inputModalities.includes('text'))
// Only expose public capability fields, never adapter connection/authentication objects.
function publicModel(info) {
  const name = typeof info.name === 'string' && info.name ? info.name : info.id
  const dated = name.match(/^(.*?)[-\s]((?:20\d{2}[-]?\d{2}[-]?\d{2})|(?:\d{4}))$/)
  const efforts = info.reasoning?.efforts?.filter(item => validId(item.id) && typeof item.name === 'string').map(({ id, name }) => ({ id, name }))
  return { id: info.id, name: dated?.[1] || name, ...(dated ? { version: dated[2] } : {}),
    ...(Array.isArray(info.inputModalities) ? { inputModalities: [...info.inputModalities] } : {}),
    ...(info.context?.contextWindow ? { contextWindow: info.context.contextWindow } : {}),
    ...(info.defaultMaxTokens ? { maxOutputTokens: info.defaultMaxTokens } : {}),
    ...(efforts?.length ? { reasoning: { efforts, ...(efforts.some(item => item.id === info.reasoning.defaultEffort) ? { defaultEffort: info.reasoning.defaultEffort } : {}) } } : {}) }
}
export async function modelInfo(ctx, input, signal) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['provider', 'model'].includes(key)) || !validId(input.provider) || !validId(input.model)) fail('请选择有效的供应商和模型。')
  try {
    const models = await bounded(() => ctx.llm.listModels(input.provider), signal)
    const listed = models.find(item => item.id === input.model && supportsText(item))
    if (!listed) fail('所选模型不在当前文本模型目录中，请刷新目录。')
    const info = typeof ctx.llm.resolveModelInfo === 'function' ? await bounded(() => ctx.llm.resolveModelInfo(input.provider, input.model, signal), signal) : listed
    if (!supportsText(info)) fail('此模型不支持文本输入。')
    return publicModel(info)
  } catch (error) {
    if (signal?.aborted) throw new GrowthError('CANCELLED', '已取消模型配置。', 408)
    if (error instanceof GrowthError) throw error
    throw new GrowthError('MODEL_UNAVAILABLE', '无法读取此模型的能力信息，请刷新或检查提供商配置。', 503)
  }
}
export async function modelSelection(ctx, signal) {
  const current = ctx.agentDefaultModel.currentSelection()
  const selection = { provider: current.provider || '', model: current.model || '', ...(current.reasoningEffort ? { reasoningEffort: current.reasoningEffort } : {}) }
  if (!selection.provider || !selection.model) return selection
  try { return { ...selection, ...await modelInfo(ctx, selectionRoute(selection), signal) } }
  catch { signal?.throwIfAborted(); return { ...selection, unavailable: true } }
}
const selectionRoute = ({ provider, model }) => ({ provider, model })
async function bounded(call, signal) {
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
  combined.throwIfAborted()
  let abort
  try { return await Promise.race([Promise.resolve().then(call), new Promise((_, reject) => { abort = () => reject(combined.reason); combined.addEventListener('abort', abort, { once: true }) })]) }
  finally { combined.removeEventListener('abort', abort) }
}
async function credentialFor(ctx, provider) {
  const entries = ctx.llm.listConfigurableProviders?.() ?? []
  const entry = entries.find(item => item.provider === provider)
  if (!entry) return null
  const settings = ctx.get ? ctx.get('settings') : ctx.settings, credentials = ctx.get ? ctx.get('credentials') : ctx.credentials
  const namespace = settings?.describe({ redactSecrets: true }).find(item => item.ns === entry.settingsNs)
  let value = namespace?.value
  for (const segment of entry.settingsPath) value = value?.[segment]
  const ref = value?.apiKeyEnv
  if (typeof ref !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref) || !credentials) return null
  return { ref, credentials }
}
export async function modelCatalog(ctx, signal) {
  try {
    const registered = await bounded(() => ctx.llm.listProviders(), signal)
    const providers = await Promise.all(registered.filter(item => validId(item.id)).map(async provider => {
      let models = [], unavailable = false
      try { models = [...new Map((await bounded(() => ctx.llm.listModels(provider.id), signal)).filter(item => validId(item?.id) && supportsText(item)).map(item => [item.id, publicModel(item)])).values()] }
      catch { unavailable = true }
      const credential = await credentialFor(ctx, provider.id)
      const info = credential ? await credential.credentials.describe(credential.ref) : null
      return { id: provider.id, name: provider.name || provider.id, models, unavailable, credential: info ? { configured: Boolean(info.configured), writable: Boolean(info.writable) } : null }
    }))
    signal?.throwIfAborted()
    return { selection: await modelSelection(ctx, signal), providers }
  } catch {
    if (signal?.aborted) throw new GrowthError('CANCELLED', '已取消模型配置。', 408)
    throw new GrowthError('MODEL_UNAVAILABLE', '模型目录暂不可用，请稍后刷新。', 503)
  }
}
export async function saveModelSettings(ctx, input, signal) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['provider', 'model', 'apiKey', 'reasoningEffort'].includes(key)) || !validId(input.provider) || !validId(input.model)) fail('请选择有效的供应商和模型。')
  if (input.reasoningEffort !== undefined && input.reasoningEffort !== null && !validId(input.reasoningEffort)) fail('请选择有效的推理强度。')
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.length > 4096 || /\s/.test(input.apiKey))) fail('API Key 需为不含空白的有效文本。')
  const pending = (queues.get(ctx.agentDefaultModel) ?? Promise.resolve()).then(async () => {
    const catalog = await modelCatalog(ctx, signal)
    const provider = catalog.providers.find(item => item.id === input.provider)
    if (!provider?.models.some(item => item.id === input.model)) fail('请选择目录中支持文本的模型；新供应商请先在模型设置中添加。')
    const current = ctx.agentDefaultModel.currentSelection()
    const same = current.provider === input.provider && current.model === input.model
    const requested = input.reasoningEffort === null ? undefined : input.reasoningEffort ?? (same ? current.reasoningEffort : undefined)
    let next = { provider: input.provider, model: input.model, ...(requested ? { reasoningEffort: requested } : {}) }
    const info = await modelInfo(ctx, selectionRoute(input), signal)
    if (requested && (input.reasoningEffort !== undefined || typeof ctx.llm.resolveModelInfo === 'function') && !info.reasoning?.efforts.some(item => item.id === requested)) fail('此模型不支持所选推理强度，请选择模型默认或可用档位。')
    if (typeof ctx.llm.resolveCallConfig === 'function') {
      try { next = selectionRouteWithEffort(await bounded(() => ctx.llm.resolveCallConfig(next, signal), signal)) }
      catch { signal?.throwIfAborted(); fail('所选模型或推理强度不可用，请检查提供商配置。') }
    }
    signal?.throwIfAborted()
    if (input.apiKey !== undefined) {
      const credential = await credentialFor(ctx, input.provider)
      if (!credential || !provider.credential?.writable) fail('当前凭据来源不可修改，请使用模型设置中的供应商配置。')
      try { await credential.credentials.set(credential.ref, input.apiKey) }
      catch { throw new GrowthError('MODEL_UNAVAILABLE', 'API Key 保存失败，请检查凭据来源后重试。', 503) }
    }
    await ctx.agentDefaultModel.saveSelection(next)
    const saved = ctx.agentDefaultModel.currentSelection()
    if (saved.provider !== next.provider || saved.model !== next.model || saved.reasoningEffort !== next.reasoningEffort) throw new GrowthError('MODEL_UNAVAILABLE', '模型选择未保存，请重试。', 503)
    return modelCatalog(ctx, signal)
  })
  queues.set(ctx.agentDefaultModel, pending.catch(() => {}))
  return pending
}
const selectionRouteWithEffort = ({ provider, model, reasoningEffort }) => ({ provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) })
