// 程序 A 的模型输出完整性关卡：仅在输出截断/超长时递归重生成。
// Original questions, source evidence, schema and native model settings stay intact.
export const MAX_OUTPUT_REDUCTIONS = 6

export function outputReductionInstruction(level) {
  const maxProseChars = Math.max(96, Math.floor(6000 * .5 ** level))
  const maxOptionalItems = Math.max(1, Math.floor(8 * .55 ** level))
  return `OUTPUT_REDUCTION level=${level} maxProseChars=${maxProseChars} maxOptionalItems=${maxOptionalItems}
上一响应达到输出上限或字符预算，已丢弃。请依据原问题和全部原始资料，重新生成一份更精简但完整的最终结果，不能接写半截响应。
缩短解释和可选示例，合并重复观点；生成说明文字目标最多 ${maxProseChars} 个字符，可选条目每组最多 ${maxOptionalItems} 项。原任务更严格的字数和数量要求继续有效。
必须保留原任务要求的全部必填字段、逐项核对、指定主题、事实、条件、数值、单位、否定与不确定性；引用必须逐字来自原文，不能截断句子、代码、公式或 JSON。长度目标不能代替这些要求；仅缩短可精简的表达，不删改输入或伪造证据。
若原任务要求 JSON，只返回符合原结构的完整 JSON；若要求文本或代码，保持该格式。不要输出思维过程、重复题目或全文原文。工具结果与已完成操作仍有效，不重放历史工具操作。只缩减输出，不扩大权限或分析范围。`
}

function outputLimit(options) {
  if (options.purpose === 'mimir-workbench-edit') return 40000
  if (options.purpose === 'mimir-workbench-assist') return 160000
  if (options.messages?.some(message => message.source?.kind === 'mimir-growth')) return 60000
  return 100000
}

async function bounded(operation, signal) {
  signal.throwIfAborted()
  let abort
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try { return await Promise.race([Promise.resolve().then(operation), cancelled]) }
  finally { signal.removeEventListener('abort', abort) }
}

export async function* checkedModelOutputStream(options, first, regenerate, { LlmError, createUserMessage }) {
  if (options.signal?.aborted) { yield* first(); return }
  // Preserve caller/native timing, including calls that intentionally omit a signal.
  // A synthetic deadline here could stop waiting without cancelling the first dispatch.
  const signal = options.signal ?? new AbortController().signal
  const limit = outputLimit(options)
  const limited = () => new LlmError('模型达到输出上限，正在缩减输出后重新生成。', 'MODEL_OUTPUT_LIMIT')

  async function generate(level) {
    signal.throwIfAborted()
    let iterator, done = false
    try {
      const source = level === 0 ? first() : await bounded(() => regenerate({
        signal,
        messages: [...options.messages, createUserMessage({ content: [{ type: 'text', text: outputReductionInstruction(level) }], source: {kind:'plugin',plugin:'mimir-output-reduction'} })],
      }), signal)
      iterator = source[Symbol.asyncIterator]()
      const chunks = []
      let textChars = 0, finish
      while (true) {
        const step = await bounded(() => iterator.next(), signal)
        if (step.done) { done = true; break }
        const chunk = step.value
        if (chunk.type === 'text-delta') textChars += chunk.text.length
        if (textChars > limit) throw limited()
        if (chunk.type === 'finish') {
          finish = chunk.reason
          if (['max-tokens', 'length', 'max_tokens'].includes(finish?.kind)
            || finish?.failure?.code === 'MODEL_OUTPUT_LIMIT') throw limited()
        }
        chunks.push(chunk)
      }
      return chunks
    } catch (error) {
      signal.throwIfAborted()
      if (error?.code !== 'MODEL_OUTPUT_LIMIT') throw error
      if (level >= MAX_OUTPUT_REDUCTIONS) {
        throw new LlmError('模型输出已自动递归缩减六次，仍未完整生成；结果未保存。请缩小范围后重试。', 'MODEL_OUTPUT_LIMIT')
      }
    } finally {
      if (!done && iterator?.return) Promise.resolve().then(() => iterator.return()).catch(() => {})
    }
    return generate(level + 1)
  }

  // No text or tool call from a discarded partial response reaches consumers.
  yield* await generate(0)
}
