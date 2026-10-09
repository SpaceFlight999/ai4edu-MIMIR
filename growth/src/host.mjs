import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { GrowthStore } from './store.mjs'
import { AREAS, DEPTHS, RESOURCES, FORUM_SEED } from './catalog.mjs'
import { activePlan, assessQuiz, adaptShare, confirmDraft, fail, GrowthError, makeDraft, number, reviewStatus, sharePlan, templatePlan, text, validateProfile, validateShare } from './domain.mjs'
import { evidenceWithModel, feedbackWithModel, planWithModel, generateText, parseModelJson, COACH_SYSTEM } from './model.mjs'
import { localShare, sharingCatalog } from './sharing.mjs'
import { journeysForState, prepareJourneyOperation } from './journey.mjs'
import { WORKSHOPS, prepareLearning, assessCourseQuiz, checkCourseCompletion } from './learning.mjs'
import { publicTaskUnit } from './course-catalog.mjs'
import { buildCourseCandidate, buildCourseNext, buildCourseReview } from './course-plan.mjs'
import { curriculumSnapshot, curriculumSearch } from './curriculum.mjs'
import { librarySnapshot, prepareLibrary } from './library.mjs'
import { createResearchFeed, RESEARCH_TOPICS } from './research.mjs'
import { prepareRobotics, checkRoboticsCompletion } from './robotics.mjs'
import { publicRoboticsTopic } from './robotics-topic.mjs'
import { STUDY_TOPICS, prepareStudy } from './study-topics.mjs'
import { taskCourseUnit } from './course-catalog.mjs'
import { prepareCustomChoice, researchTopic } from './custom-choices.mjs'
import { modelCatalog, saveModelSettings } from './model-settings.mjs'

export const name = 'mimir-growth'
export const inject = ['connection', 'llm', 'agentDefaultModel', 'agents', 'tools', 'systemPrompt']
export const API_OPERATIONS = ['custom-choice', 'profile', 'generate', 'confirm', 'decline', 'evidence', 'complete', 'quiz', 'feedback', 'review', 'import', 'forum-reply', 'star', 'save-share', 'focus-task', 'check-criterion', 'task-obstacle', 'learning', 'content-concept', 'course-quiz', 'competition-workspace', 'research-digest', 'course-plan', 'course-next', 'robotics-workspace', 'study-workspace']

export function createGrowthService(store, ctx, { researchFetch = fetch } = {}) {
  const running = new Map()
  const research = createResearchFeed(researchFetch)
  function snapshot() { const state = store.read(); return { ...state, growthVersion: '0.10.0', roboticsTopic: publicRoboticsTopic(), plans: state.plans.map(plan => ({ ...plan, tasks: plan.tasks.map(task => ({ ...task, ...(task.courseRef ? { courseUnit: publicTaskUnit(task) } : {}) })) })), journeys: journeysForState(state), sharingCatalog: sharingCatalog(state), areas: AREAS, depths: DEPTHS, resources: RESOURCES.map(({ quizzes, ...resource }) => ({ ...resource, workshop: WORKSHOPS[resource.id], ...(quizzes ? { quizzes: quizzes.map(({ correct, explanation, hint, ...quiz }) => quiz) } : {}) })), forumSeed: FORUM_SEED, reviewStatus: reviewStatus(state), modelSelection: ctx.agentDefaultModel.currentSelection() } }
  async function execute(operation, input, requestSignal) {
    if (!API_OPERATIONS.includes(operation)) fail('未知培养操作。')
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('请求格式无效。')
    const key = text(input.requestKey, '请求标识', 128), version = number(input.version, '记录版本', 0, Number.MAX_SAFE_INTEGER)
    if (!Number.isInteger(version)) fail('记录版本必须是整数。')
    const fingerprint = createHash('sha256').update(operation + JSON.stringify(input)).digest('hex')
    const prior = store.prior(key, fingerprint)
    if (prior) return { ...prior, state: snapshot() }
    if (running.has(key)) {
      if (running.get(key).fingerprint !== fingerprint) fail('重复操作的内容不一致。', 'IDEMPOTENCY_MISMATCH', 409)
      return running.get(key).promise
    }
    const controller = new AbortController(), signal = requestSignal ? AbortSignal.any([controller.signal, requestSignal]) : controller.signal
    const promise = (async () => {
      const before = store.read()
      if (before.version !== version) fail('记录已经变化，请刷新后重新操作。', 'VERSION_CONFLICT', 409)
      const operationResult = await prepare(operation, input, before, signal)
      signal.throwIfAborted()
      const committed = store.mutate({ key, fingerprint, version, kind: operation }, operationResult)
      return { ...committed, state: snapshot() }
    })().finally(() => running.delete(key))
    running.set(key, { fingerprint, controller, promise })
    return promise
  }
  async function prepare(operation, input, before, signal) {
    if (operation === 'custom-choice') return prepareCustomChoice(input, before)
    if (operation === 'study-workspace') return prepareStudy(input, before, taskCourseUnit)
    if (operation === 'course-plan' || operation === 'course-next') {
      if (input.topicRef !== undefined && (input.topicRef !== 'planar-2r-v1' || input.courseId !== 'mit-robotics' || (input.variant !== undefined && input.variant !== 'foundation'))) fail('请选择已注册的运动学专题。')
      const spec = operation === 'course-plan' ? buildCourseCandidate(before, input.courseId, input.variant, input.topicRef === 'planar-2r-v1') : buildCourseNext(before, input.taskId)
      return state => makeDraft(state, spec.output, { ...spec, mode: 'template', source: operation })
    }
    if (['content-concept', 'course-quiz', 'competition-workspace'].includes(operation)) return prepareLibrary(operation, input, before)
    if (operation === 'research-digest') {
      const collection = await research.get(researchTopic(input.topic, before), input.count, signal)
      const reply = await generateText(ctx, `${COACH_SYSTEM}\n根据提供的论文元数据和摘要片段生成中文阅读概览，不假装读过全文，不推断论文录用或影响力。只返回 JSON：{"overview":"共同主题与阅读建议","items":[{"id":"原文id","summary":"研究问题与方法，150字以内","question":"阅读时需要验证的问题"}]}。每篇必须保留原 id，不能增加论文。`, collection, signal)
      const parsed = parseModelJson(reply.text)
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length !== collection.items.length || new Set(parsed.items.map(item => item.id)).size !== collection.items.length || parsed.items.some(item => !collection.items.some(paper => paper.id === item.id))) fail('研究概览没有对应全部来源，请重试。', 'INVALID_MODEL_OUTPUT', 422)
      const digest = { overview: text(parsed.overview, '概览', 1800), items: parsed.items.map(item => ({ id: item.id, summary: text(item.summary, '研究摘要', 800), question: text(item.question, '阅读问题', 500) })), model: reply.model, collection, at: new Date().toISOString() }
      return state => { state.researchDigests[input.topic] = digest; return digest }
    }
    if (operation === 'learning') return prepareLearning(input, before)
    if (['focus-task', 'check-criterion', 'task-obstacle'].includes(operation)) return prepareJourneyOperation(operation, input, before)
    if (operation === 'star') {
      const id = text(input.planId, '共享方案标识', 128)
      if (!sharingCatalog(before).some(plan => plan.id === id)) fail('共享方案不存在。')
      if (typeof input.starred !== 'boolean') fail('请选择收藏或取消收藏。')
      return state => {
        state.starredPlanIds = state.starredPlanIds.filter(item => item !== id)
        if (input.starred) state.starredPlanIds.push(id)
        return { planId: id, starred: input.starred }
      }
    }
    if (operation === 'save-share') {
      const plan = localShare(input.template, before.profile.name)
      return state => {
        if (!state.sharedPlans.some(item => item.id === plan.id)) state.sharedPlans.push(plan)
        return plan
      }
    }
    if (operation === 'robotics-workspace') return prepareRobotics(input, before)
    if (operation === 'profile') { const profile = validateProfile(input.profile); return (state) => { state.profile = profile; state.profileSaved = true } }
    if (['generate', 'review', 'import'].includes(operation)) {
      const profile = validateProfile(input.profile ?? before.profile)
      if (!['model', 'template'].includes(input.mode)) fail('请选择真实AI生成或本地示例。')
      const review = operation === 'review', advance = input.advance === true
      if (review && !activePlan(before)) fail('先确认方案，再进行阶段复盘。')
      const shared = operation === 'import' ? validateShare(input.template) : null
      let output, model, courseReview
      if (input.mode === 'model') ({ output, model } = await planWithModel(ctx, before, profile, signal, { review, advance, shared }))
      else { courseReview = review ? buildCourseReview(before, profile) : null; output = shared ? adaptShare(shared, profile) : courseReview?.output || templatePlan(profile) }
      if (review && input.mode === 'template' && !courseReview) {
        const done = activePlan(before).tasks.filter((t) => before.evidence[t.id]?.status === 'completed').length
        output.rationale = `本地规则复盘：当前阶段已确认完成${done}项任务。按你本次明确填写的配置重新安排；尚未调用模型评估成果。`
      }
      return (state) => { const draft = makeDraft(state, output, { ...courseReview, profile, mode: input.mode, advance, source: operation }); if (model) draft.model = model; return draft }
    }
    if (operation === 'confirm') return (state) => confirmDraft(state, text(input.planId, '候选方案标识', 128))
    if (operation === 'decline') return (state) => { const plan = state.plans.find((p) => p.id === input.planId); if (!plan || plan.status !== 'draft') fail('候选方案已失效。', 'STALE_DRAFT', 409); plan.status = 'declined' }
    if (operation === 'feedback') {
      const message = text(input.message, '反馈', 4000)
      if (!['model', 'record'].includes(input.mode)) fail('请选择AI交流或仅记录。')
      const reply = input.mode === 'model' ? await feedbackWithModel(ctx, before, message, signal) : null
      return (state) => {
        const item = { id: randomUUID(), text: message, at: new Date().toISOString(), mode: input.mode }
        state.feedback.push(item); state.messages.push({ id: item.id, role: 'user', text: message, at: item.at })
        if (reply) state.messages.push({ id: randomUUID(), role: 'assistant', text: reply.text, model: reply.model, at: item.at })
        return item
      }
    }
    if (operation === 'forum-reply') {
      if (!FORUM_SEED.some((post) => post.id === input.postId)) fail('演示主题不存在。')
      const reply = { id: randomUUID(), postId: input.postId, author: before.profile.name || '我', text: text(input.message, '回复', 2000), at: new Date().toISOString() }
      return (state) => { state.forum.push(reply); return reply }
    }
    const current = activePlan(before), task = current?.tasks.find((t) => t.id === input.taskId)
    if (!task) fail('任务不属于当前生效方案，请刷新。', 'STALE_TASK', 409)
    if (operation === 'quiz') {
      if (before.evidence[task.id]?.status === 'completed' && JSON.stringify(input.answers) !== JSON.stringify(before.evidence[task.id]?.quiz?.answers)) fail('请先撤回完成标记，再修改练习答案。', 'COMPLETED_TASK', 409)
      const quiz = task.courseRef ? assessCourseQuiz(task, input.answers) : assessQuiz(task.resourceId, input.answers)
      return (state) => { state.evidence[task.id] = { ...state.evidence[task.id], quiz, quizAt: new Date().toISOString() }; return quiz }
    }
    if (operation === 'evidence') {
      if (before.evidence[task.id]?.status === 'completed') fail('请先撤回完成标记，再修改成果。', 'COMPLETED_TASK', 409)
      const evidence = { artifactText: text(input.artifactText ?? '', '成果文字', 20000, false), reflection: text(input.reflection ?? '', '自评', 4000, false), confidence: number(input.confidence, '理解程度自评', 1, 5), at: new Date().toISOString() }
      if (!evidence.artifactText && !evidence.reflection) fail('请写下成果或学习反思。')
      if (!['model', 'record'].includes(input.mode)) fail('请选择AI反馈或仅保存自评。')
      const assessed = input.mode === 'model' ? await evidenceWithModel(ctx, before, task, evidence, signal) : null
      return (state) => {
        state.evidence[task.id] = { ...state.evidence[task.id], ...evidence, status: 'submitted', source: evidence.artifactText ? 'artifact' : 'self-report', assessment: assessed?.assessment ?? null, model: assessed?.model ?? null }
        return state.evidence[task.id]
      }
    }
    if (operation === 'complete') return (state) => {
      if (typeof input.completed !== 'boolean') fail('完成状态需要为是或否。')
      let evidence = state.evidence[task.id]
      if (input.completed !== true) { if (evidence) { evidence.status = evidence.artifactText || evidence.reflection ? 'submitted' : 'pending'; delete evidence.completedAt; delete evidence.completionNote } return evidence }
      if (input.selfReport === true && !task.courseRef && !evidence?.artifactText && !evidence?.reflection) {
        evidence = state.evidence[task.id] = { ...evidence, source: 'self-report', completionNote: '学生在行动清单自报已办完，尚无成果支持。' }
      }
      if (!evidence?.artifactText && !evidence?.reflection && !(input.selfReport === true && !task.courseRef)) fail('请先提交成果或自评，再确认完成。')
      checkCourseCompletion(state, task)
      checkRoboticsCompletion(state, task)
      const missing = task.prerequisites.filter((index) => state.evidence[current.tasks[index].id]?.status !== 'completed')
      if (missing.length) fail('请先完成这项任务的前置任务。')
      evidence.status = 'completed'; evidence.completedAt = new Date().toISOString()
      return evidence
    }
    fail('未知任务操作。')
  }
  return { snapshot, execute, library: () => ({ ...({ ...librarySnapshot(), studyTopics: STUDY_TOPICS.map(({ diagnosis, ...item }) => item) }), curriculum: curriculumSnapshot(store.read()), roboticsTopic: publicRoboticsTopic(), researchTopics: RESEARCH_TOPICS.map(({ query, ...topic }) => topic) }), research: (topic, count, signal) => research.get(researchTopic(topic, store.read()), count, signal), materials: async (core, keyword, count, signal) => research.get(curriculumSearch(core, keyword), count, signal), export: () => sharePlan(store.read()), cancel(key) { running.get(key)?.controller.abort(); return { cancelled: running.has(key) } }, dispose() { for (const operation of running.values()) operation.controller.abort() } }
}
export async function apply(ctx) {
  const directory = join(process.env.DSH_HOME, 'mimir-growth')
  const store = new GrowthStore(join(directory, 'growth.sqlite'))
  const service = createGrowthService(store, ctx)
  const register = (path, methods, handle) => ctx.effect(() => ctx.connection.fetch.register({ path: '/api/mimir/growth/' + path, methods, requestBody: 'buffered', async fetch(request) {
    const requestId = randomUUID()
    try {
      const result = await handle(request)
      return Response.json({ ok: true, data: result, requestId }, { headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } })
    } catch (error) {
      const known = error instanceof GrowthError
      return Response.json({ ok: false, error: { code: known ? error.code : request.signal.aborted ? 'CANCELLED' : 'FAILED', message: known ? error.message : '操作未完成，请刷新后重试。原方案保持有效。' }, requestId }, { status: known ? error.status : 500, headers: { 'cache-control': 'no-store' } })
    }
  } }))
  async function body(request) {
    const raw = await request.text()
    if (raw.length > 160000) fail('请求内容过长。', 'PAYLOAD_TOO_LARGE', 413)
    try { return JSON.parse(raw) } catch { fail('请求不是有效JSON。') }
  }
  register('state', ['GET'], () => service.snapshot())
  register('models', ['GET'], request => modelCatalog(ctx, request.signal))
  register('model-selection', ['GET'], () => { const current = ctx.agentDefaultModel.currentSelection(); return { provider: current.provider || '', model: current.model || '' } })
  register('model-settings', ['POST'], async request => saveModelSettings(ctx, await body(request), request.signal))
  register('library', ['GET'], () => service.library())
  register('materials', ['GET'], request => { const url = new URL(request.url); return service.materials(url.searchParams.get('core'), url.searchParams.get('keyword') || '', Number(url.searchParams.get('count') || 5), request.signal) })
  register('research', ['GET'], request => { const url = new URL(request.url); return service.research(url.searchParams.get('topic') || 'robot-learning', Number(url.searchParams.get('count') || 5), request.signal) })
  register('export', ['GET'], () => service.export())
  register('validate-share', ['POST'], async request => localShare((await body(request)).template, '').template)
  register('cancel', ['POST'], async (request) => { const input = await body(request); return service.cancel(text(input.requestKey, '操作标识', 128)) })
  for (const operation of API_OPERATIONS) register(operation, ['POST'], async (request) => service.execute(operation, await body(request), request.signal))
  ctx.effect(() => () => { service.dispose(); store.close() })
}
