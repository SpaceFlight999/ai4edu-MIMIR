import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
const repair = vm.runInNewContext(readFileSync(new URL('../client/block-identity.js', import.meta.url), 'utf8') + '\nmimirBlockIdentityTransaction')
const types = ['paragraph', 'heading', 'listItem', 'tableCell']
const node = (id, type = 'paragraph') => ({ type: { name: type }, attrs: { blockId: id, retained: true } })
function state(rows) {
  const doc = { descendants(fn) { for (const [position, value] of rows) fn(value, position) }, nodeAt(position) { return rows.find(row => row[0] === position)?.[1] } }
  const changes = []
  return { doc, tr: { doc, setNodeMarkup(position, type, attrs) { changes.push({ position, attrs }); return this } }, changes }
}
const identity = { mapping: { mapResult: position => ({ pos: position, deleted: false }) } }
test('split keeps the old paragraph identity and repairs the new duplicate', () => {
  const previous = state([[0, node('old')]]), next = state([[0, node('old')], [8, node('old', 'heading')]])
  assert.equal(repair([identity], previous, next, types, () => 'new'), next.tr)
  assert.equal(next.changes.length, 1)
  assert.equal(next.changes[0].position, 8)
  assert.equal(next.changes[0].attrs.blockId, 'new')
  assert.equal(next.changes[0].attrs.retained, true)
})
test('paste before an annotated owner cannot steal the existing block identity', () => {
  const previous = state([[0, node('annotated')]])
  const next = state([[0, node('annotated')], [12, node('annotated')]])
  const inserted = { mapping: { mapResult: position => ({ pos: position + 12, deleted: false }) } }
  repair([inserted], previous, next, types, () => 'pasted')
  assert.equal(next.changes.length, 1)
  assert.equal(next.changes[0].position, 0)
  assert.equal(next.changes[0].attrs.blockId, 'pasted')
})
test('nested list and table identities stay unique without collisions or repeated transactions', () => {
  const previous = state([]), next = state([[0, node('same', 'listItem')], [2, node('same')], [9, node(null, 'tableCell')], [10, node('taken')]])
  const ids = ['taken', 'one', 'two']
  repair([], previous, next, types, () => ids.shift())
  assert.deepEqual(next.changes.map(row => row.attrs.blockId), ['one', 'two'])
  const healthy = state([[0, node('same')], [8, node('one')], [12, node('two')]])
  assert.equal(repair([], healthy, healthy, types), null)
})
test('a deleted owner allows a surviving block to retain its unique identity', () => {
  const previous = state([[0, node('old')]]), next = state([[0, node('old')]])
  const removed = { mapping: { mapResult: position => ({ pos: position, deleted: true }) } }
  assert.equal(repair([removed], previous, next, types), null)
})
