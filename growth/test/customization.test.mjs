import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { GrowthStore } from '../src/store.mjs'
import { createGrowthService } from '../src/host.mjs'
import { defaultProfile, validateProfile } from '../src/domain.mjs'
import { CHOICE_LABELS, researchTopic } from '../src/custom-choices.mjs'
import { modelCatalog, saveModelSettings } from '../src/model-settings.mjs'
import { agentFixture } from './agent-fixture.mjs'

test('multiple goals preserve legacy profiles, survive generation, and reject blank or duplicate entries', async () => {
  assert.equal(validateProfile(defaultProfile()).goal, defaultProfile().goal)
  const goals = ['建立机器人基础', '完成一个可展示项目'], profile = validateProfile({ ...defaultProfile(), goals })
  assert.equal(validateProfile({ ...defaultProfile(), goal: '旧'.repeat(600), goals: ['旧'.repeat(600), '新增目标'] }).goals[0].length, 600);
  assert.deepEqual(profile.goals, goals); assert.equal(profile.goal, goals.join('\n'))
  for (const bad of [[], [''], ['a', ' a '], Array(13).fill('a'), ['a'.repeat(1201)]]) assert.throws(() => validateProfile({ ...defaultProfile(), goals: bad }))
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  try {
    const result = await service.execute('generate', { profile, mode: 'template', version: 0, requestKey: randomUUID() })
    assert.deepEqual(result.result.profile.goals, goals)
    assert.ok(result.result.tasks[0].objective.includes(goals[0]))
  } finally { service.dispose(); store.close() }
})
test('all eight other-choice categories save independently and invalid source URLs cannot commit', async () => {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  const run = payload => service.execute('custom-choice', { ...payload, version: store.read().version, requestKey: randomUUID() })
  try {
    for (const label of CHOICE_LABELS) await run({ label, title: label + '个人补充', detail: '自己的问题', source: 'https://example.org/my-source' })
    assert.equal(store.read().customChoices.length, CHOICE_LABELS.length)
    const before = store.read()
    for (const source of ['javascript:alert(1)', 'file:///C:/secret', 'https://user:pass@example.org', 'invalid']) await assert.rejects(run({ label: '公开课', title: '无效来源', source }))
    await assert.rejects(run({ label: '未知类别', title: '补充' }))
    await assert.rejects(run({ label: '公开课', title: '公开课个人补充' }))
    assert.deepEqual(store.read(), before)
  } finally { service.dispose(); store.close() }
})
test('custom research builds a bounded literal query and custom competition uses the real saved workspace', async () => {
  const store = new GrowthStore(':memory:'), service = createGrowthService(store, { agentDefaultModel: { currentSelection: () => ({}) } })
  const run = (op, payload) => service.execute(op, { ...payload, version: store.read().version, requestKey: randomUUID() })
  try {
    const topic = (await run('custom-choice', { label: '研究方向', title: 'Soft robotics', detail: 'soft robot' })).result
    assert.equal(researchTopic(topic.id, store.read()).query, 'all:"soft" AND all:"robot"')
    const competition = (await run('custom-choice', { label: '竞赛与历史题', title: '我的校园赛题' })).result
    await run('competition-workspace', { problemId: competition.id, step: 1, fields: { requirements: '实现视觉分拣' } })
    assert.equal(store.read().competitionWorkspaces[competition.id].fields.requirements, '实现视觉分拣')
    assert.throws(() => researchTopic(competition.id, store.read()))
  } finally { service.dispose(); store.close() }
})
function modelContext() {
  let selection = { provider: 'alpha', model: 'text-1', reasoningEffort: 'high' }
  const stored = new Map(), saves = []
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ ...selection }), saveSelection: async next => { saves.push(next); selection = { ...next } } },
    llm: { listProviders: () => [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }], listModels: async () => [{ id: 'text-1', name: 'Text 1', inputModalities: ['text'] }, { id: 'text-2', inputModalities: ['text'] }, { id: 'image-only', inputModalities: ['image'] }], listConfigurableProviders: () => ['alpha', 'beta'].map(provider => ({ provider, settingsNs: provider, settingsPath: [] })) },
    settings: { describe: () => [{ ns: 'alpha', value: { apiKeyEnv: 'ALPHA_API_KEY' } }, { ns: 'beta', value: { apiKeyEnv: 'BETA_API_KEY' } }] },
    credentials: { describe: async ref => ({ configured: stored.has(ref), writable: true, value: 'NEVER-PROJECT-SECRET' }), set: async (ref, value) => { stored.set(ref, value) } },
  }
  return { ctx, stored, saves }
}
test('model catalog returns public models and credential status only; keys stay supplier-specific', async () => {
  const { ctx, stored } = modelContext()
  assert.ok(!JSON.stringify(await modelCatalog(ctx)).includes('NEVER-PROJECT-SECRET'))
  assert.deepEqual((await modelCatalog(ctx)).providers[0].models.map(item => item.id), ['text-1', 'text-2'])
  await saveModelSettings(ctx, { provider: 'alpha', model: 'text-2', apiKey: 'synthetic-alpha-key' })
  await saveModelSettings(ctx, { provider: 'beta', model: 'text-1', apiKey: 'synthetic-beta-key' })
  assert.equal(stored.get('ALPHA_API_KEY'), 'synthetic-alpha-key'); assert.equal(stored.get('BETA_API_KEY'), 'synthetic-beta-key')
  const result = await saveModelSettings(ctx, { provider: 'alpha', model: 'text-1' })
  assert.equal(result.selection.provider, 'alpha'); assert.ok(!JSON.stringify(result).includes('synthetic-alpha-key'))
  assert.equal(stored.get('ALPHA_API_KEY'), 'synthetic-alpha-key')
})
test('forged model selections, image models, invalid keys and read-only credentials reject before saving', async () => {
  const { ctx, saves } = modelContext()
  for (const input of [{ provider: 'unknown', model: 'text-1' }, { provider: 'alpha', model: 'image-only' }, { provider: 'alpha', model: 'text-1', apiKey: 'has whitespace' }, { provider: 'alpha', model: 'text-1', credentialRef: 'OTHER_SECRET' }]) await assert.rejects(saveModelSettings(ctx, input))
  ctx.credentials.describe = async () => ({ configured: true, writable: false })
  await assert.rejects(saveModelSettings(ctx, { provider: 'alpha', model: 'text-1', apiKey: 'new-key' }))
  assert.equal(saves.length, 0)
})
test('serialized model changes preserve same-model reasoning and reset it when the route changes', async () => {
  const { ctx, saves } = modelContext()
  await Promise.all([saveModelSettings(ctx, { provider: 'alpha', model: 'text-1' }), saveModelSettings(ctx, { provider: 'beta', model: 'text-2' })])
  assert.equal(saves[0].reasoningEffort, 'high'); assert.equal(saves[1].reasoningEffort, undefined)
  assert.equal(ctx.agentDefaultModel.currentSelection().provider, 'beta')
})
test('DSH generation receives every selected goal without credentials entering learning records', async () => {
  const store = new GrowthStore(':memory:')
  const goals = ['目标一', '目标二'], profile = validateProfile({ ...defaultProfile(), goals })
  const fixture = agentFixture({ agentDefaultModel: { currentSelection: () => ({ provider: 'alpha', model: 'text-1' }) } }, { frames: [{ type: 'text', text: 'invalid-json' }] })
  const service = createGrowthService(store, fixture.context)
  try {
    await assert.rejects(service.execute('generate', { profile, mode: 'model', version: 0, requestKey: randomUUID() }))
    const content = JSON.stringify(fixture.stats.messages)
    for (const goal of goals) assert.ok(content.includes(goal))
    assert.equal(store.read().version, 0)
  } finally { service.dispose(); store.close() }
})
