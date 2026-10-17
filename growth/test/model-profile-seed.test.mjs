import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyModelProfileSeed } from '../overrides/app/model-profile-seed.mjs'
import { removeSyntheticPath } from './helpers/synthetic-cleanup.mjs'

test('installed new-profile seed defaults to off; repeated installation preserves legal persisted profiles byte for byte', async () => {
  const workspace = resolve(fileURLToPath(new URL('../../', import.meta.url)))
  const testRoot = join(workspace, '.test-data'); mkdirSync(testRoot, { recursive: true })
  const temporary = mkdtempSync(join(testRoot, 'model-profile-seed-'))
  try {
    const source = readFileSync(join(workspace, 'runtime/system/app/environment.mjs'), 'utf8')
    const originalSource = source.replace('reasoningEffort: off\\n', 'reasoningEffort: high\\n')
    const seeded = applyModelProfileSeed(originalSource)
    assert.equal(applyModelProfileSeed(seeded), seeded)
    assert.equal(source, seeded)
    // Exercise the real packaged initializer, including its filesystem guard.
    const module = join(temporary, 'environment.mjs'); writeFileSync(module, seeded)
    const { productPaths, configureProduct } = await import(pathToFileURL(module).href)
    const freshHome = join(temporary, 'fresh'), fresh = productPaths(join(workspace, 'runtime'), freshHome)
    const profile = configureProduct(fresh, { SystemRoot: 'C:\\Windows', PATH: '' })
    assert.match(readFileSync(join(profile, 'cordis.patch.yml'), 'utf8'), /reasoningEffort: off\n/)
    for (const effort of ['off', 'low', 'high', 'max']) {
      const home = join(temporary, effort), directory = join(home, 'profiles/web'); mkdirSync(directory, { recursive: true })
      const prior = '# Persisted selection must survive reinstall\n- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: ' + effort + '\n'
      const path = join(directory, 'cordis.patch.yml'); writeFileSync(path, prior)
      const paths = productPaths(join(workspace, 'runtime'), home)
      configureProduct(paths, { SystemRoot: 'C:\\Windows', PATH: '' })
      configureProduct(paths, { SystemRoot: 'C:\\Windows', PATH: '' })
      assert.equal(readFileSync(path, 'utf8'), prior)
    }
    const customDirectory = join(temporary, 'custom', 'profiles/web'); mkdirSync(customDirectory, { recursive: true })
    const customProfile = '- id: agent-default-model\n  config:\n    provider: my-gateway\n    model: my-model\n- id: llm-pi-ai\n  config:\n    providers:\n      my-gateway:\n        api: openai-completions\n        baseURL: https://gateway.example/v1\n        apiKeyEnv: MY_GATEWAY_API_KEY\n'
    const customPath = join(customDirectory, 'cordis.patch.yml'); writeFileSync(customPath, customProfile)
    const customPaths = productPaths(join(workspace, 'runtime'), join(temporary, 'custom'))
    configureProduct(customPaths, { SystemRoot: 'C:\\Windows', PATH: '' })
    configureProduct(customPaths, { SystemRoot: 'C:\\Windows', PATH: '' })
    assert.equal(readFileSync(customPath, 'utf8'), customProfile)
    assert.throws(() => applyModelProfileSeed('export const unexpected = true'), /Unexpected default model seed baseline/)
  } finally {
    await removeSyntheticPath(temporary, 'profile')
  }
})
