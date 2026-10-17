import assert from 'node:assert/strict'
import { lstat, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setImmediate, setTimeout } from 'node:timers/promises'

const workspace = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const targets = {
  title: { parent: join(workspace, 'runtime/system/engine'), name: /^\.mimir-title-policy-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.mjs$/, directory: false },
  profile: { parent: join(workspace, '.test-data'), name: /^model-profile-seed-[A-Za-z0-9]{6}$/, directory: true },
}

// Async waits let the module loader close its file handle on Windows. Retry only
// known cleanup interference; preserve unrelated failures and a finite bound.
export async function removeSyntheticPath(target, kind) {
  const rule = targets[kind]
  assert.ok(rule, 'Unknown synthetic cleanup kind')
  const path = resolve(target instanceof URL ? fileURLToPath(target) : target)
  assert.equal(dirname(path), resolve(rule.parent), 'Synthetic cleanup must remain in its exact workspace parent')
  assert.match(basename(path), rule.name, 'Synthetic cleanup requires an owned temporary name')
  let stat
  try { stat = await lstat(path) } catch (error) { if (error.code === 'ENOENT') return; throw error }
  assert.equal(stat.isSymbolicLink(), false, 'Synthetic cleanup rejects symbolic links')
  assert.equal(rule.directory ? stat.isDirectory() : stat.isFile(), true, 'Unexpected synthetic target type')
  await setImmediate()
  for (let attempt = 0; ; attempt++) {
    try { await rm(path, { recursive: rule.directory, force: true }); return }
    catch (error) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY', 'EMFILE', 'ENFILE'].includes(error.code) || attempt >= 10) throw error
      await setTimeout(100)
    }
  }
}
