import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { resolve, join, dirname, basename } from 'node:path'
import { withFileLock, writeFileAtomic } from '../overrides/atomic-write/index.js'

const nativeRm = fs.rm
const nativeWriteFile = fs.writeFile
const windows = process.platform === 'win32'
async function fixture(t, failure) {
  const testRoot = resolve('.test-data')
  await fs.mkdir(testRoot, { recursive: true })
  const directory = await fs.mkdtemp(join(testRoot, 'atomic-lock-unit-'))
  const filename = join(directory, '.credentials.yaml'), lockPath = `${filename}.lock`
  let removals = 0, injectedFailures = 0
  t.mock.method(fs, 'rm', async (target, options) => {
    if (target === lockPath) {
      removals++
      const error = await failure?.(removals)
      if (error) { injectedFailures++; throw error }
    }
    return nativeRm(target, options)
  })
  syncBuiltinESMExports()
  t.after(async () => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    assert.equal(dirname(resolve(directory)), testRoot, 'Unsafe synthetic cleanup parent')
    assert.match(basename(directory), /^atomic-lock-unit-[A-Za-z0-9]{6}$/, 'Unsafe synthetic cleanup name')
    await nativeRm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  return { filename, lockPath, removals: () => removals, injectedFailures: () => injectedFailures }
}
const errorWithCode = code => Object.assign(new Error(`synthetic ${code}`), { code })

test('Windows transient lock-release errors retry without rerunning the credential write', { skip: !windows }, async t => {
  const f = await fixture(t, attempt => attempt <= 2 ? errorWithCode(attempt === 1 ? 'EBUSY' : 'EPERM') : undefined)
  const previous = 'version: 1\nrefs:\n  SYNTHETIC: old-fixture\n', next = 'version: 1\nrefs:\n  SYNTHETIC: new-fixture\n'
  await fs.writeFile(f.filename, previous)
  let operations = 0
  const result = await withFileLock(f.filename, async () => {
    operations++
    assert.equal(await fs.readFile(f.lockPath, 'utf8'), `${process.pid}\n`)
    assert.equal(await fs.readFile(f.filename, 'utf8'), previous)
    await writeFileAtomic(f.filename, next, { mode: 0o600, dirMode: 0o700 })
    return 'written-once'
  })
  assert.equal(result, 'written-once')
  assert.equal(operations, 1)
  assert.equal(f.injectedFailures(), 2)
  assert.ok(f.removals() >= 3 && f.removals() <= 9)
  assert.equal(await fs.readFile(f.filename, 'utf8'), next)
  await assert.rejects(fs.lstat(f.lockPath), error => error.code === 'ENOENT')
})

test('Windows release keeps contenders excluded throughout transient retry', { skip: !windows }, async t => {
  let releaseStarted, retryStarted, permitRelease, contenderBlocked
  const started = new Promise(resolve => { releaseStarted = resolve })
  const retrying = new Promise(resolve => { retryStarted = resolve })
  const releaseGate = new Promise(resolve => { permitRelease = resolve })
  const blocked = new Promise(resolve => { contenderBlocked = resolve })
  const f = await fixture(t, async attempt => {
    if (attempt === 1) { releaseStarted(); return errorWithCode('EBUSY') }
    if (attempt === 2) { retryStarted(); await releaseGate }
  })
  t.mock.method(fs, 'writeFile', async (target, ...args) => {
    try { return await nativeWriteFile(target, ...args) }
    catch (error) {
      if (target === f.lockPath && ['EEXIST', 'EPERM'].includes(error.code)) contenderBlocked()
      throw error
    }
  })
  syncBuiltinESMExports()
  let releaseAllowed = false, secondEntered = false, firstOperations = 0, secondOperations = 0
  const events = []
  const first = withFileLock(f.filename, async () => { firstOperations++; events.push('first'); return 'first-result' })
  await started
  assert.equal(await fs.readFile(f.lockPath, 'utf8'), `${process.pid}\n`)
  const second = withFileLock(f.filename, async () => {
    secondOperations++; secondEntered = true
    assert.equal(releaseAllowed, true)
    events.push('second')
    return 'second-result'
  })
  try {
    await Promise.all([retrying, blocked])
    assert.equal(secondEntered, false)
    assert.equal(await fs.readFile(f.lockPath, 'utf8'), `${process.pid}\n`)
    releaseAllowed = true
  } finally { permitRelease() }
  assert.deepEqual(await Promise.all([first, second]), ['first-result', 'second-result'])
  assert.deepEqual(events, ['first', 'second'])
  assert.equal(firstOperations, 1); assert.equal(secondOperations, 1)
  assert.equal(f.injectedFailures(), 1)
  // Two releases plus the injected failure; real Windows file-handle
  // interference may add retries, bounded by nine attempts per holder.
  assert.ok(f.removals() >= 3 && f.removals() <= 18)
  await assert.rejects(fs.lstat(f.lockPath), error => error.code === 'ENOENT')
})

test('persistent Windows busy or permission interference exhausts a finite bound and keeps the lock', { skip: !windows }, async t => {
  for (const code of ['EBUSY', 'EPERM']) {
    await t.test(code, async child => {
      const error = errorWithCode(code), f = await fixture(child, () => error)
      let operations = 0
      await assert.rejects(withFileLock(f.filename, async () => { operations++; return 'unreleased' }), caught => caught === error)
      assert.equal(operations, 1)
      assert.equal(f.removals(), 9)
      assert.equal(await fs.readFile(f.lockPath, 'utf8'), `${process.pid}\n`)
    })
  }
})

test('release does not retry unrelated errors or weaken the live-holder acquisition timeout', async t => {
  for (const code of ['EACCES', 'EIO']) {
    await t.test(code, async child => {
      const error = errorWithCode(code), f = await fixture(child, () => error)
      await assert.rejects(withFileLock(f.filename, async () => 'result'), caught => caught === error)
      assert.equal(f.removals(), 1)
      let entered = false
      await assert.rejects(withFileLock(f.filename, async () => { entered = true }, { waitMs: 0 }), /timed out waiting for the writer lock/)
      assert.equal(entered, false)
      assert.equal(f.removals(), 1)
      assert.equal(await fs.readFile(f.lockPath, 'utf8'), `${process.pid}\n`)
    })
  }
})

test('a failed operation retains its original error after successful Windows release retry', { skip: !windows }, async t => {
  const f = await fixture(t, attempt => attempt === 1 ? errorWithCode('EPERM') : undefined)
  const operationError = new Error('synthetic-operation-error')
  await assert.rejects(withFileLock(f.filename, async () => { throw operationError }), error => error === operationError)
  assert.equal(f.injectedFailures(), 1)
  assert.ok(f.removals() >= 2 && f.removals() <= 9)
  await assert.rejects(fs.lstat(f.lockPath), error => error.code === 'ENOENT')
})

test('non-Windows busy errors retain the original immediate release failure', async t => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
  t.after(() => Object.defineProperty(process, 'platform', platform))
  const error = errorWithCode('EBUSY'), f = await fixture(t, () => error)
  await assert.rejects(withFileLock(f.filename, async () => 'result'), caught => caught === error)
  assert.equal(f.removals(), 1)
})
