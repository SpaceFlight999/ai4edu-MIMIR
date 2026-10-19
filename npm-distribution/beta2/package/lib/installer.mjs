import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export function validateRelease(release) {
  const url = new URL(release.url)
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/SpaceFlight999/ai4edu-MIMIR/releases/download/') || url.search || url.hash) throw new Error('Unexpected runtime download address.')
  if (release.version !== '0.12.11-beta.2' || release.runtimeVersion !== '0.12.10' || !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('Invalid release identity or SHA-256.')
  for (const field of ['bytes', 'files', 'unpackedBytes']) if (!Number.isSafeInteger(release[field]) || release[field] <= 0) throw new Error('Invalid runtime size manifest.')
  return release
}

export async function download(release, target, fetcher = fetch) {
  try {
    if ((await stat(target)).size === release.bytes && await sha256(target) === release.sha256) return
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const temporary = target + '.partial-' + randomUUID()
  try {
    const response = await fetcher(release.url, { signal: AbortSignal.timeout(30 * 60 * 1000) })
    if (!response.ok || !response.body) throw new Error('Runtime download failed (HTTP ' + response.status + '). Check the GitHub release attachment and your connection, then retry.')
    const hash = createHash('sha256')
    let bytes = 0
    const check = new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length
      if (bytes > release.bytes) return callback(new Error('Runtime download exceeds the published size.'))
      hash.update(chunk)
      callback(null, chunk)
    } })
    await pipeline(Readable.fromWeb(response.body), check, createWriteStream(temporary, { flags: 'wx' }))
    if (bytes !== release.bytes || hash.digest('hex') !== release.sha256) throw new Error('Runtime checksum mismatch. Nothing was installed; retry the download.')
    // Replace a corrupt cached archive only after the replacement passed verification.
    await rm(target, { force: true })
    await rename(temporary, target)
  } finally { await rm(temporary, { force: true }) }
}

export async function extract(archive, destination, release) {
  const script = fileURLToPath(new URL('./extract.ps1', import.meta.url))
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Archive', archive, '-Destination', destination, '-ExpectedFiles', String(release.files), '-ExpectedBytes', String(release.unpackedBytes)]
  await new Promise((done, reject) => {
    const child = spawn(powershell, args, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? done() : reject(new Error('Runtime extraction failed (exit ' + code + ').')))
  })
}

export async function install(release, base, { fetcher, extractor = extract } = {}) {
  validateRelease(release)
  const location = join(base, 'versions', 'b2-' + release.sha256.slice(0, 12))
  const receipt = join(location, '.mimir-install.json')
  try {
    const saved = JSON.parse(await readFile(receipt, 'utf8'))
    if (saved.sha256 === release.sha256 && (await stat(join(location, 'runtime', 'Mimir.exe'))).isFile()) return location
    throw new Error('The existing installation is incomplete. Move this version directory aside and retry: ' + location)
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(base, { recursive: true })
  const lock = join(base, 'install-' + release.sha256.slice(0, 12) + '.lock')
  try { await mkdir(lock) } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another installation may be running. Wait and retry. If an earlier installation was forcibly closed, remove this empty lock directory: ' + lock)
    throw error
  }
  // Use a short staging path instead of appending a UUID to the version path.
  const stage = join(base, 's-' + randomUUID().slice(0, 8))
  let ownsStage = false
  try {
    await mkdir(join(base, 'versions'), { recursive: true })
    await mkdir(join(base, 'cache'), { recursive: true })
    const archive = join(base, 'cache', release.sha256 + '.zip')
    console.log('Downloading/verifying MIMIR runtime (' + Math.ceil(release.bytes / 1024 / 1024) + ' MiB). The first run may take several minutes.')
    await download(release, archive, fetcher)
    await mkdir(stage)
    ownsStage = true
    console.log('Extracting runtime...')
    await extractor(archive, stage, release)
    for (const required of ['runtime/Mimir.exe', 'runtime/Mimir.ico', 'runtime/system/app/app.mjs', 'runtime/system/node/node.exe', 'runtime/system/engine/node_modules/@mimir/growth-layer/package.json']) {
      if (!(await stat(join(stage, required))).isFile()) throw new Error('Runtime is incomplete: ' + required)
    }
    const growth = JSON.parse(await readFile(join(stage, 'runtime/system/engine/node_modules/@mimir/growth-layer/package.json'), 'utf8'))
    if (growth.version !== release.runtimeVersion) throw new Error('Growth module version does not match this installer.')
    await writeFile(join(stage, '.mimir-install.json'), JSON.stringify({ version: release.version, sha256: release.sha256, installedAt: new Date().toISOString() }, null, 2), { flag: 'wx' })
    await rename(stage, location)
    return location
  } finally {
    if (ownsStage) await rm(stage, { recursive: true, force: true })
    await rm(lock, { recursive: true, force: true })
  }
}

export function dataDirectory(release, base) {
  // A packaging update must reuse the existing profile and credentials.
  return join(base, 'data', release.runtimeVersion)
}

export async function createDesktopShortcut(location, data, base, desktop) {
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = fileURLToPath(new URL('./shortcut.ps1', import.meta.url))
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Executable', join(location, 'runtime', 'Mimir.exe'), '-DataHome', data,
    '-Icon', join(location, 'runtime', 'Mimir.ico'), '-InstallBase', base]
  if (desktop) args.push('-Desktop', desktop)
  await new Promise((done, reject) => {
    const child = spawn(powershell, args, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? done() : reject(new Error('Desktop shortcut creation failed.')))
  })
}

export async function main(release, { installOnly = false } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This evaluation release supports Windows x64 only.')
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Install Node.js 24 or newer first.')
  const local = process.env.LOCALAPPDATA
  if (!local) throw new Error('LOCALAPPDATA is unavailable for this Windows account.')
  const base = resolve(local, 'MIMIR-Evaluation')
  const location = await install(release, base)
  console.log('Installed: ' + location)
  const data = dataDirectory(release, base)
  await mkdir(data, { recursive: true })
  try { await createDesktopShortcut(location, data, base) }
  catch (error) { console.warn('MIMIR is installed, but the desktop shortcut could not be created: ' + error.message) }
  if (installOnly) return
  await new Promise((done, reject) => {
    const child = spawn(join(location, 'runtime', 'Mimir.exe'), ['--data-home', data], { cwd: join(location, 'runtime'), detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); done() })
  })
  console.log('MIMIR launched. Your evaluation data is stored in: ' + data)
}
