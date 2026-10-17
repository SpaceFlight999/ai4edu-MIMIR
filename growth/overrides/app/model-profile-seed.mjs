// Apply only to the packaged configureProduct source during installation.
// Persisted user profiles are guarded by configureProduct's existing existsSync.
const originalSeed = String.raw`'- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n    reasoningEffort: high\n'`
const productSeed = originalSeed.replace('reasoningEffort: high', 'reasoningEffort: off')

export function applyModelProfileSeed(source) {
  if (source.includes(originalSeed)) return source.replace(originalSeed, productSeed)
  if (source.includes(productSeed)) return source
  throw new Error('Unexpected default model seed baseline; do not patch it blindly.')
}
