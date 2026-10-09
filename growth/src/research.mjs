import { GrowthError, fail } from './domain.mjs'

export const RESEARCH_TOPICS = [
  { id: 'robot-learning', title: '机器人学习', query: 'cat:cs.RO AND (all:learning)' },
  { id: 'embodied', title: '具身智能', query: 'cat:cs.RO AND (all:embodied OR all:foundation)' },
  { id: 'planning', title: '运动规划', query: 'cat:cs.RO AND (all:planning)' },
  { id: 'collaboration', title: '人机协作', query: 'cat:cs.RO AND (all:human AND all:interaction)' },
]
const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => { const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }).replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const tag = (xml, name) => decode(xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'))?.[1] || '')
export function parseResearchFeed(xml) {
  if (xml.length > 180000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || !/<feed\b/.test(xml)) throw new GrowthError('RESEARCH_FORMAT', '研究来源返回了无法解析的内容，请稍后重试。', 502)
  const seen = new Set()
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].flatMap(([, entry]) => {
    const sourceId = tag(entry, 'id'), match = sourceId.match(/^https?:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z.-]+\/\d{7}(?:v\d+)?)$/i)
    if (!match) return []
    const id = match[1], base = id.replace(/v\d+$/, ''), title = tag(entry, 'title'), published = tag(entry, 'published'), updated = tag(entry, 'updated')
    if (seen.has(base) || !title || !Number.isFinite(Date.parse(published))) return []
    seen.add(base)
    return [{ id, title: title.slice(0, 500), published, updated, url: 'https://arxiv.org/abs/' + id, abstract: tag(entry, 'summary').slice(0, 1500), authors: [...entry.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/g)].slice(0, 8).map(([, author]) => tag(author, 'name')), publication: tag(entry, 'arxiv:journal_ref') || '预印本；同行评审状态未确认' }]
  }).sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).slice(0, 10)
}
export function createResearchFeed(fetcher = fetch) {
  const cache = new Map(), pending = new Map(); let lastRequestAt = 0
  async function get(topicId, count = 5, signal) {
    const topic = typeof topicId === 'object' ? topicId : RESEARCH_TOPICS.find(item => item.id === topicId)
    if (!topic || ![5, 10].includes(count)) fail('请选择研究方向与 Top 5 / Top 10。')
    const cacheKey = topic.id + '\n' + topic.query + '\n' + topic.title
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.time < 3600000) return { ...cached.value, items: cached.value.items.slice(0, count), cached: true }
    if (pending.size) {
      if (pending.has(cacheKey)) { const value = await pending.get(cacheKey); signal?.throwIfAborted(); return { ...value, items: value.items.slice(0, count), cached: true } }
      throw new GrowthError('RESEARCH_BUSY', '另一研究方向正在更新，请稍后再试。', 429)
    }
    if (Date.now() - lastRequestAt < 3000) throw new GrowthError('RESEARCH_RATE_LIMIT', '请间隔几秒再获取研究成果。', 429)
    const promise = (async () => {
      lastRequestAt = Date.now()
      const url = new URL('https://export.arxiv.org/api/query'); url.search = new URLSearchParams({ search_query: topic.query, start: '0', max_results: '10', sortBy: 'submittedDate', sortOrder: 'descending' }).toString()
      const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
      try {
        const response = await fetcher(url, { signal: combined, redirect: 'error', headers: { accept: 'application/atom+xml', 'user-agent': 'MIMIR-Education/0.9.0' } })
        if (!response.ok) throw new Error('upstream ' + response.status)
        const reader = response.body.getReader(), chunks = []; let size = 0
        try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 180000) throw new Error('oversized feed'); chunks.push(value) } } finally { await reader.cancel().catch(() => {}) }
        const bytes = new Uint8Array(size); let position = 0; for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length }
        const items = parseResearchFeed(new TextDecoder().decode(bytes))
        const value = { topic: { id: topic.id, title: topic.title }, searchTerm: topic.searchTerm || '', source: 'arXiv', fetchedAt: new Date().toISOString(), ranking: '按首次提交时间倒序；不是影响力或质量排名', items, cached: false }
        if (cache.size >= 32) cache.delete(cache.keys().next().value)
        cache.set(cacheKey, { time: Date.now(), value }); return value
      } catch (error) {
        if (signal?.aborted) throw new GrowthError('CANCELLED', '已取消研究检索。', 408)
        if (error instanceof GrowthError) throw error
        throw new GrowthError('RESEARCH_UNAVAILABLE', '暂时无法连接 arXiv。可稍后重试或打开官方检索；未使用旧示例替代最新结果。', 502)
      }
    })().finally(() => pending.delete(cacheKey))
    pending.set(cacheKey, promise)
    const value = await promise; return { ...value, items: value.items.slice(0, count) }
  }
  return { get }
}
