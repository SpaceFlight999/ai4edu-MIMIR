import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { download, install, validateRelease, dataDirectory } from './package/lib/installer.mjs'

const payload = Buffer.from('fixed evaluation runtime fixture')
const manifest = { version: '0.12.11-beta.2', runtimeVersion: '0.12.10', url: 'https://github.com/SpaceFlight999/ai4edu-MIMIR/releases/download/test/runtime.zip', sha256: createHash('sha256').update(payload).digest('hex'), bytes: payload.length, files: 4, unpackedBytes: 99 }
async function temporary(fn) {
  const root = await mkdtemp(join(tmpdir(), 'mimir-installer-test-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}
const goodFetch = async () => new Response(payload)

test('rejects unexpected host, malformed digest and size manifest', () => {
  for (const change of [{ url: 'https://evil.example/runtime.zip' }, { url: 'http://github.com/SpaceFlight999/ai4edu-MIMIR/releases/download/a/b' }, { sha256: 'bad' }, { bytes: -1 }, { files: 1.5 }]) assert.throws(() => validateRelease({ ...manifest, ...change }))
})

test('beta2 reuses the 0.12.10 data directory and rejects wrong release identities', () => {
  assert.equal(dataDirectory(manifest, 'base'), join('base', 'data', '0.12.10'))
  assert.throws(() => validateRelease({ ...manifest, version: '0.12.10' }))
  assert.throws(() => validateRelease({ ...manifest, runtimeVersion: '../another-profile' }))
})
test('downloads once and verifies existing cache before reuse', () => temporary(async root => {
  let requests = 0
  const target = join(root, 'runtime.zip')
  const fetcher = async () => { requests++; return goodFetch() }
  await download(manifest, target, fetcher)
  await download(manifest, target, fetcher)
  assert.equal(requests, 1)
  await writeFile(target, Buffer.alloc(payload.length))
  await download(manifest, target, fetcher)
  assert.equal(requests, 2)
  assert.deepEqual(await readFile(target), payload)
}))
test('rejects corrupt/truncated/oversized downloads and removes partial files', () => temporary(async root => {
  for (const bytes of [Buffer.alloc(payload.length), Buffer.from('short'), Buffer.alloc(payload.length + 1)]) {
    await assert.rejects(download(manifest, join(root, 'runtime.zip'), async () => new Response(bytes)))
    assert.deepEqual(await readdir(root), [])
  }
}))
test('preserves corrupt cache if its replacement download fails', () => temporary(async root => {
  const target = join(root, 'runtime.zip')
  await writeFile(target, 'previous')
  await assert.rejects(download(manifest, target, async () => new Response('missing', { status: 404 })))
  assert.equal(await readFile(target, 'utf8'), 'previous')
  assert.deepEqual(await readdir(root), ['runtime.zip'])
}))
async function fixtureExtract(archive, stage) {
  for (const name of ['runtime/Mimir.exe', 'runtime/Mimir.ico', 'runtime/system/app/app.mjs', 'runtime/system/node/node.exe', 'runtime/system/engine/node_modules/@mimir/growth-layer/package.json']) {
    const path = join(stage, name)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, name.endsWith('package.json') ? JSON.stringify({ version: '0.12.10' }) : 'fixture')
  }
}
test('cold install publishes only complete runtime and reuses receipt', () => temporary(async root => {
  let requests = 0
  await mkdir(join(root, 'data', '0.12.10'), { recursive: true })
  const existingData = join(root, 'data', '0.12.10', 'preserve.txt')
  await writeFile(existingData, 'existing user data')
  const options = { fetcher: async () => { requests++; return goodFetch() }, extractor: async (archive, stage) => {
    assert.match(stage.slice(root.length + 1), /^s-[a-f0-9]{8}$/)
    await fixtureExtract(archive, stage)
  } }
  const location = await install(manifest, root, options)
  assert.equal(JSON.parse(await readFile(join(location, '.mimir-install.json'), 'utf8')).sha256, manifest.sha256)
  assert.equal(await install(manifest, root, options), location)
  assert.equal(requests, 1)
  assert.equal(await readFile(existingData, 'utf8'), 'existing user data')
  assert.ok(!(await readdir(root)).some(path => path.endsWith('.lock')))
}))
test('failed extraction cleans staging and unlocks without publishing a version', () => temporary(async root => {
  await assert.rejects(install(manifest, root, { fetcher: goodFetch, extractor: async () => { throw new Error('broken zip') } }), /broken zip/)
  assert.deepEqual(await readdir(join(root, 'versions')), [])
  assert.ok(!(await readdir(root)).some(path => path.endsWith('.lock')))
}))
test('rejects another installation lock without deleting it', () => temporary(async root => {
  const lock = 'install-' + manifest.sha256.slice(0, 12) + '.lock'
  await mkdir(join(root, lock))
  await assert.rejects(install(manifest, root, { fetcher: goodFetch }), /Another installation/)
  assert.ok((await readdir(root)).includes(lock))
}))
test('rejects a downloaded runtime with a mismatched module version', () => temporary(async root => {
  await assert.rejects(install(manifest, root, { fetcher: goodFetch, extractor: async (archive, stage) => {
    await fixtureExtract(archive, stage)
    await writeFile(join(stage, 'runtime/system/engine/node_modules/@mimir/growth-layer/package.json'), '{"version":"0.1.0"}')
  } }), /version does not match/)
  assert.deepEqual(await readdir(join(root, 'versions')), [])
}))
