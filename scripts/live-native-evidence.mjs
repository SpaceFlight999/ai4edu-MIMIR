import { readFileSync } from 'node:fs'

// The observer writes from a separate owned process; a reader may catch truncate-before-write.
// Retry only incomplete JSON or transient file absence. Never return stale data or discard rows.
export function readJsonComplete(path, { attempts = 50, retryMs = 10 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return JSON.parse(readFileSync(path, 'utf8')) }
    catch (error) {
      if (!(error instanceof SyntaxError) && error.code !== 'ENOENT' || attempt >= attempts - 1) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs)
    }
  }
}

export function hasAutomaticExecutionClaim(text) {
  text = String(text)
  const pattern = /已(?:自动)?(?:执行|运行|完成文件|修改文件)|\bI (?:ran|executed|saved)\b/gi
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(0, match.index)
    // Reject affirmative past execution, while preserving explicit negated labels such as 非已执行结果.
    if (/(?:非|并非|不是|不代表|不属于|未称|未声称|不声称|没有声称|未改写为|没有改写为|不改写为)[“"'\s]*$/.test(before)) continue
    return true
  }
  return false
}
