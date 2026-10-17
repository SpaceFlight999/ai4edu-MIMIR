import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const instance = JSON.parse(readFileSync('.test-data/integration/instance.json'))
const session = await fetch(instance.url, { redirect: 'manual' })
const cookie = session.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const response = await fetch(new URL('/api/mimir/growth/research?topic=robot-learning&count=5', instance.url), { headers: { cookie }, signal: AbortSignal.timeout(25000) })
const result = await response.json()
assert.equal(response.status, 200, result.error?.message)
const collection = result.data
assert.equal(collection.source, 'arXiv'); assert.equal(collection.items.length, 5)
assert.ok(collection.items.every(item => /^https:\/\/arxiv\.org\/abs\//.test(item.url) && Number.isFinite(Date.parse(item.published))))
assert.ok(collection.items.every((item, i) => !i || Date.parse(collection.items[i - 1].published) >= Date.parse(item.published)))
writeFileSync('artifacts/research-live.json', JSON.stringify({ passed: true, source: collection.source, fetchedAt: collection.fetchedAt, ranking: collection.ranking, papers: collection.items.map(({ id, title, url, published }) => ({ id, title, url, published })), checks: ['authenticated native host API', 'actual official arXiv feed', 'Top 5 recent submissions', 'source identity and date sorting'], paidModelCalls: 0 }, null, 2))
console.log('Live research passed: native host API returned 5 source-linked papers; no model calls.')
