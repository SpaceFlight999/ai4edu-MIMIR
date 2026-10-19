import assert from 'node:assert/strict'
import { mkdir, link, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { install, createDesktopShortcut, dataDirectory } from './package/lib/installer.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const release = JSON.parse(await readFile(join(here, 'package/release.json'), 'utf8'))
const base = join(here, 'real-install-smoke-beta2')
await mkdir(join(base, 'cache'), { recursive: true })
try { await link(join(here, 'release', new URL(release.url).pathname.split('/').at(-1)), join(base, 'cache', release.sha256 + '.zip')) } catch (error) { if (error.code !== 'EEXIST') throw error }
const installed = await install(release, base)
assert.equal(await install(release, base), installed)
const runtime = join(installed, 'runtime')
const desktop = join(base, 'isolated-desktop')
await mkdir(desktop, { recursive: true })
await createDesktopShortcut(installed, dataDirectory(release, base), base, desktop)
assert.match(await readFile(join(runtime, '使用说明.txt'), 'utf8'), /0\.12\.11-beta\.2/)
assert.equal(JSON.parse(await readFile(join(runtime, 'system/product.json'), 'utf8')).version, release.version)
assert.deepEqual(await readFile(join(runtime, 'Mimir.ico')), await readFile(join(here, 'package/lib/mimir.ico')))
const data = join(base, 'fresh-data')
await mkdir(data, { recursive: true })
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET/i.test(name)))
const child = spawn(join(runtime, 'system/node/node.exe'), [join(runtime, 'system/app/app.mjs'), '--headless', '--data-home', data], { cwd: runtime, env: cleanEnvironment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let instance, timer, output = ''
const exited = new Promise(done => child.once('exit', code => done(code)))
try {
  instance = await new Promise((done, reject) => {
    timer = setTimeout(() => reject(new Error('Fresh runtime startup timed out.')), 90000)
    child.once('error', reject)
    child.once('exit', code => reject(new Error('Fresh runtime exited before readiness: ' + code)))
    child.stderr.on('data', () => {})
    child.stdout.on('data', bytes => {
      output = (output + bytes.toString()).slice(-512000)
      const match = output.match(/MIMIR_READY=(\{[^\r\n]+\})/)
      if (match) { try { done(JSON.parse(match[1])) } catch (error) { reject(error) } }
    })
  })
  clearTimeout(timer)
  const origin = new URL(instance.url).origin
  const unauthenticated = await fetch(origin + '/api/mimir/growth/state', { signal: AbortSignal.timeout(5000) })
  assert.equal(unauthenticated.status, 401)
  const login = await fetch(instance.url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie)
  const response = await fetch(origin + '/api/mimir/growth/state', { headers: { cookie }, signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200)
  const state = await response.json()
  assert.equal(state.ok, true)
  assert.equal(typeof state.data.version, 'number')
  const installedPackage = JSON.parse(await readFile(join(runtime, 'system/engine/node_modules/@mimir/growth-layer/package.json'), 'utf8'))
  assert.equal(installedPackage.version, '0.12.10')
  await writeFile(join(here, 'release/real-install-smoke.json'), JSON.stringify({ passed: true, releaseVersion: release.version, runtimeVersion: installedPackage.version, checks: ['actual archive checksum and 64115-file extraction', 'completed installation reuse', 'isolated desktop shortcut using actual exe and icon', 'updated user guide and product version', 'confirmed tray icon bytes', 'fresh isolated data directory', 'actual headless backend startup', 'unauthenticated API rejection', 'authenticated growth state'], networkSource: 'local verified release archive; remote GitHub download awaits publication', paidModelCalls: 0, at: new Date().toISOString() }, null, 2))
  console.log('Actual runtime smoke passed: 9 checks; no paid model requests.')
} finally {
  clearTimeout(timer)
  if (instance) await fetch('http://127.0.0.1:' + instance.controlPort + '/exit', { method: 'POST', headers: { 'X-Mimir-Control': instance.controlToken }, signal: AbortSignal.timeout(5000) }).catch(() => {})
  const stopped = await Promise.race([exited.then(() => true), new Promise(done => { const cleanup = setTimeout(() => done(false), 8000); cleanup.unref() })])
  if (!stopped) child.kill()
}
