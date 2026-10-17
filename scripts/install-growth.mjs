import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { applyModelProfileSeed } from '../growth/overrides/app/model-profile-seed.mjs'
import { applyProductConfigWrite } from '../growth/overrides/app/product-config-write.mjs'
const root = resolve('runtime'), target = join(root, 'system/engine/node_modules/@mimir/growth-layer')
if (!existsSync(join(root, 'system/app/environment.mjs'))) throw new Error('Restore the runtime first.')
if (!existsSync('growth/lib/client.js')) throw new Error('Build the growth client first.')
mkdirSync(target, { recursive: true })
for (const entry of ['package.json', 'cordis.patch.yml', 'src', 'lib']) cpSync(join('growth', entry), join(target, entry), { recursive: true })
const paperOverridePaths = ['reader.mjs', 'reader.css', 'reader-ui.mjs', 'research-ui.mjs', 'reader.html', 'drafts.mjs', 'highlights.mjs', 'session.mjs'].map(name => 'system/engine/node_modules/@mimir/dsh-workbench-bundle/paper/viewer/' + name)
for (const path of paperOverridePaths) cpSync(join('growth/overrides/paper/viewer', path.split('/').at(-1)), join(root, path))
const nativeOverrides = [
  ['growth/overrides/atomic-write/index.js', 'system/engine/node_modules/@deepseek-ai/dsh-atomic-write/lib/index.js'],
  ['growth/overrides/app/model-policy.mjs', 'system/app/model-policy.mjs'],
  ['growth/overrides/app/research-chat-quality.mjs', 'system/app/research-chat-quality.mjs'],
  ['growth/overrides/session-title-llm/index.js', 'system/engine/node_modules/@deepseek-ai/dsh-session-title-llm/lib/index.js'],
  ['growth/overrides/host/model-comparison.mjs', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/model-comparison.mjs'],
  ['growth/overrides/host/model-output.mjs', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/model-output.mjs'],
  ['growth/overrides/host/workbench-import-format.mjs', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/workbench-import-format.mjs'],
  ['growth/overrides/host/model-context.mjs', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/model-context.mjs'],
  ['growth/overrides/host/index.js', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/index.js'],
  ['growth/overrides/workbench/client.js', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/lib/client.js'],
  ['growth/overrides/host/unified.js', 'system/engine/node_modules/@mimir/dsh-workbench-bundle/host/unified.js'],
  ['growth/overrides/chat/client.js', 'system/engine/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'],
]
for (const [source, destination] of nativeOverrides) cpSync(source, join(root, destination))
const environmentPath = join(root, 'system/app/environment.mjs')
// Seed legacy launcher credentials through DSH so the Models page can edit them.
const appPath = join(root, 'system/app/app.mjs')
let appSource = readFileSync(appPath, 'utf8')
const oldCredentials = 'if (credential.apiKey) process.env.DEEPSEEK_API_KEY=credential.apiKey;\ncredential=null;'
const seedCredentials = `  if (credential?.apiKey) {
    const credentials = app.ctx.get('credentials');
    if (!credentials) throw new Error('DSH 凭据服务未就绪。');
    const info = await credentials.describe('DEEPSEEK_API_KEY');
    if (!info.configured) await credentials.set('DEEPSEEK_API_KEY', credential.apiKey);
  }
  credential=null;`
if (appSource.includes(oldCredentials)) {
  appSource = appSource.replace(oldCredentials, '// Credentials are seeded into the native store after DSH starts.')
  const anchor = '  await initializeProductWorkspace(app.ctx, paths);'
  if (!appSource.includes(anchor)) throw new Error('Unexpected credential startup baseline.')
  appSource = appSource.replace(anchor, anchor + '\n' + seedCredentials)
  writeFileSync(appPath, appSource)
} else if (!appSource.includes(seedCredentials)) throw new Error('Unexpected credential startup baseline.')
if (!appSource.includes("import { installModelPolicy } from './model-policy.mjs';")) {
  const anchor = "import { chooseProductPort, rememberProductPort } from './server-port.mjs';"
  if (!appSource.includes(anchor)) throw new Error('Unexpected model policy startup baseline.')
  appSource = appSource.replace(anchor, anchor + "\nimport { installModelPolicy } from './model-policy.mjs';")
}
if (!appSource.includes('await installModelPolicy(app.ctx);')) {
  const anchor = '  credential=null;'
  if (!appSource.includes(anchor)) throw new Error('Credential startup checkpoint is missing.')
  appSource = appSource.replace(anchor, anchor + '\n  await installModelPolicy(app.ctx);')
}
writeFileSync(appPath, appSource)
let environment = readFileSync(environmentPath, 'utf8')
if (!environment.includes("'@mimir/growth-layer'")) {
  if (!environment.includes("'@mimir/dsh-workbench-bundle']")) throw new Error('Unexpected startup baseline; do not patch it blindly.')
  environment = environment.replace("'@mimir/dsh-workbench-bundle']", "'@mimir/dsh-workbench-bundle','@mimir/growth-layer']")
}
// Only the source seed changes. configureProduct's existsSync guard preserves
// all persisted profiles and their legal current reasoning effort.
environment = applyModelProfileSeed(environment)
environment = applyProductConfigWrite(environment)
writeFileSync(environmentPath, environment)
const manifestPath = join(root, 'system/engine/package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dependencies['@mimir/growth-layer'] = 'file:../../../growth'
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const files = {}
const overlayPaths = ['system/app/environment.mjs', 'system/app/app.mjs', 'system/engine/package.json', ...paperOverridePaths, ...nativeOverrides.map(([, destination]) => destination)]
function collect(directory) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = directory + '/' + entry.name
    if (entry.isDirectory()) collect(path); else overlayPaths.push(path)
  }
}
collect('system/engine/node_modules/@mimir/growth-layer')
for (const path of overlayPaths) {
  const bytes = readFileSync(join(root, path))
  files[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}
mkdirSync('artifacts', { recursive: true })
writeFileSync('artifacts/growth-overlay.json', JSON.stringify({ version: JSON.parse(readFileSync('growth/package.json')).version, baseVersion: '0.12.0-beta.1', installedAt: new Date().toISOString(), files }, null, 2))
console.log('Installed the growth layer; existing engine and research modules retained.')
