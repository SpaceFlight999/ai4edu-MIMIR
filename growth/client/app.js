const { createElement: h, Fragment, useEffect, useRef, useState } = require('react');
const { createPortal } = require('react-dom');
const PANEL = 'mimir-growth';
const learningDoors = [['courses', '课程与知识图谱', '知识关联 · 公开课 · 问答'], ['competitions', '竞赛工作台', '赛事推荐 · 历年题 · 实践报告'], ['research', '前沿研究', '联网检索 · Top N · 论文阅读'], ['interest', '兴趣探索', '选择场景 · 小实验 · 下一步']];
function openGrowth(ctx, tab = 'well', section) {
  memory.tab = tab; if (section) memory.librarySection = section;
  if (tab === 'well') memory.wellMode = 'landing';
  ctx.layout.selectPanel(PANEL);
  window.dispatchEvent(new CustomEvent('mimir-growth-open', { detail: { tab, section } }));
}
const memory = { tab: 'well', wellMode: 'landing', step: 0, forest: 'hub', selectedTask: null, profile: null, feedback: '', evidence: {}, quizzes: {}, filter: 'all' };
const areaNames = { research: '科研', competition: '竞赛', gpa: '绩点', interest: '兴趣' };
const depthNames = { intro: '入门', apply: '应用', deep: '深入' };
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' }) : '待确认';
const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
const badge = (label, className = '') => h('span', { className: 'mg-badge ' + className }, label);
const field = (label, control, help) => h('label', { className: 'mg-field' }, h('span', null, label), control, help && h('small', null, help));
const textInput = (value, onChange, props = {}) => h('input', { value, onChange: (event) => onChange(event.target.value), ...props });
const textArea = (value, onChange, props = {}) => h('textarea', { value, onChange: (event) => onChange(event.target.value), ...props });
function ProcessingTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const start = performance.now(); const timer = setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 1000); return () => clearInterval(timer); }, []);
  return h('small', { 'data-mimir-processing': true, role: 'timer' }, 'MIMIR 已处理 ' + seconds + ' 秒');
}
function confirmLeaveLearning() { return !Object.values(memory.dirtyLearning || {}).some(Boolean) || window.confirm('当前学习有未保存的内容。建议先保存过程与草稿；仍要离开吗？'); }
function learningResource(state, task) {
  const resource = state.resources.find(item => item.id === task.resourceId);
  return task.courseUnit ? { ...resource, course: task.courseUnit.course, studyTopic: task.courseUnit.studyTopic, workshop: task.courseUnit.workshop, quizzes: task.courseUnit.questions } : resource;
}
function redistribute(weights, id, value) {
  const others = Object.keys(weights).filter((key) => key !== id), remaining = 100 - value;
  const total = others.reduce((sum, key) => sum + weights[key], 0), result = { ...weights, [id]: value };
  const fractions = others.map((key) => { const exact = total ? weights[key] / total * remaining : remaining / others.length; result[key] = Math.floor(exact); return { key, fraction: exact - result[key] }; }).sort((a, b) => b.fraction - a.fraction);
  let left = remaining - others.reduce((sum, key) => sum + result[key], 0);
  for (let index = 0; left > 0; index++, left--) result[fractions[index % fractions.length].key]++;
  return result;
}
function WellEmblem() {
  return h('svg', { className: 'mg-well-emblem', viewBox: '0 0 44 44', fill: 'none', 'aria-hidden': true },
    h('path', { d: 'M8 28a17 17 0 0 1 25-19M36 16a17 17 0 0 1-25 19', stroke: 'currentColor', strokeWidth: 1, opacity: .5 }),
    h('ellipse', { className:'mg-well-ripple', cx: 22, cy: 31, rx: 13, ry: 4, stroke: 'currentColor', strokeWidth: 1.3 }),
    h('ellipse', { className:'mg-well-ripple mg-well-ripple-inner', cx: 22, cy: 31, rx: 7, ry: 2, stroke: 'currentColor', opacity: .5 }),
    h('path', { className:'mg-well-stream', d: 'M22 29V13M16 28c-4-6-3-11 6-15M28 28c4-6 3-11-6-15', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    h('path', { d: 'm22 6 2 3-2 3-2-3Z', fill: 'currentColor' }));
}
function Fountain() {
  return h('svg', { className: 'mg-fountain', viewBox: '0 0 360 340', fill: 'none', 'aria-hidden': true },
    h('defs', null, h('radialGradient', { id: 'mg-glow' }, h('stop', { stopColor: '#8ca7cc', stopOpacity: '.45' }), h('stop', { offset: '1', stopColor: '#8ca7cc', stopOpacity: '0' }))),
    h('circle', { cx: 180, cy: 180, r: 150, fill: 'url(#mg-glow)' }),
    ...[60, 90, 123].map((radius, index) => h('ellipse', { key: radius, cx: 180, cy: 233, rx: radius, ry: radius * .28, className: 'mg-water-ring', style: { animationDelay: `${index * -2}s` } })),
    h('path', { d: 'M66 234 Q180 298 294 234 M85 247 Q180 301 275 247 M112 262 Q180 294 248 262', className: 'mg-water-bowl', stroke: 'currentColor', strokeWidth: '.7', opacity: '.45' }),
    ...[0, 1, 2, 3].map((index) => h('path', { key: index, d: `M${130 + index * 34} 221 C${90 + index * 48} 160 ${240 - index * 32} 137 ${148 + index * 19} 76`, className: 'mg-stream', style: { animationDelay: `${index * -3}s` } })),
    h('circle', { cx: 180, cy: 65, r: 5, fill: 'currentColor', opacity: '.7' }), h('path', { d: 'M170 65h20M180 55v20', stroke: 'currentColor', opacity: '.6' }));
}
async function api(path, payload, signal) {
  let response;
  try { response = await fetch('/api/mimir/growth/' + path, { method: payload ? 'POST' : 'GET', credentials: 'same-origin', ...(payload ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) } : {}), signal }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw Object.assign(new Error('无法连接本机服务。请确认 MIMIR 后台仍在运行，再重试。'), { code: 'TRANSPORT' }); }
  if (response.status === 404) throw Object.assign(new Error('当前后台缺少这个功能。请保存编辑，从对应实例托盘退出，再通过 Start MIMIR.cmd 重新启动；刷新页面不会更新后台。'), { code: 'BACKEND_VERSION' });
  if ([401, 403].includes(response.status)) throw Object.assign(new Error('当前连接授权已失效，请通过 MIMIR 启动入口重新打开页面。'), { code: 'AUTH_REQUIRED' });
  let result;
  try { result = await response.json(); } catch { throw Object.assign(new Error('后台返回了无法识别的响应，请重试；仍失败时保存编辑并重新启动 MIMIR。'), { code: 'TRANSPORT' }); }
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.error?.message || '操作未完成。'), { code: result.error?.code });
  return result.data;
}
function App({ ctx }) {
  const [libraryVisit, setLibraryVisit] = useState(0);
  const [state, setState] = useState(null), [profile, setProfile] = useState(memory.profile), [tab, setTab] = useState(memory.tab);
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(null), [selectedTask, setSelectedTask] = useState(memory.selectedTask), [filter, setFilter] = useState(memory.filter);
  const [feedback, setFeedback] = useState(memory.feedback), [imported, setImported] = useState(null), [sharePreview, setSharePreview] = useState(null), [reviewNote, setReviewNote] = useState('');
  const [historyId, setHistoryId] = useState(''), [postId, setPostId] = useState('sorting'), [forumReply, setForumReply] = useState('');
  const [wellMode, setWellMode] = useState(memory.wellMode), [step, setStep] = useState(memory.step), [forest, setForest] = useState(memory.forest);
  const [previewTask, setPreviewTask] = useState(null), [proposalId, setProposalId] = useState(''), [reviewPart, setReviewPart] = useState('reflection'), [reviewAdvance, setReviewAdvance] = useState(true);
  const [setupIntent, setSetupIntent] = useState('generate'), [sharingFilter, setSharingFilter] = useState('all'), [sharedId, setSharedId] = useState(''), [forumThread, setForumThread] = useState(false), [journeyWeek, setJourneyWeek] = useState(1);
  const operation = useRef(null), snapshot = useRef(null), lastRequest = useRef(null), mounted = useRef(true);
  useEffect(() => {
    const open = event => {
      if (operation.current) return;
      const { tab: target, section } = event.detail || {};
      if (target === 'library' && learningDoors.some(([id]) => id === section)) openLibrary(section);
      else if (target === 'well') { if (!confirmLeaveLearning()) return; setTab('well'); setWellMode('landing'); }
      setPreviewTask(null); setNotice(null);
    };
    window.addEventListener('mimir-growth-open', open);
    return () => window.removeEventListener('mimir-growth-open', open);
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; }; }, []);
  useEffect(() => { memory.profile = profile; }, [profile]);
  useEffect(() => { const changed = () => void reload(); window.addEventListener('mimir-model-changed', changed); return () => window.removeEventListener('mimir-model-changed', changed); }, []);
  useEffect(() => { memory.tab = tab; memory.selectedTask = selectedTask; memory.feedback = feedback; memory.filter = filter; }, [tab, selectedTask, feedback, filter]);
  useEffect(() => { memory.wellMode = wellMode; memory.step = step; memory.forest = forest; }, [wellMode, step, forest]);
  useEffect(() => { if (notice?.kind !== 'success') return; const timer = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!previewTask) return;
    const previous = document.activeElement;
    const close = event => {
      if (event.key === 'Escape') setPreviewTask(null);
      if (event.key === 'Tab') {
        const elements = [...document.querySelectorAll('.mg-preview-card button:not(:disabled)')];
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('keydown', close); previous?.focus?.(); };
  }, [previewTask]);
  useEffect(() => { const element = document.querySelector('.mg-scroll'); if (element) element.scrollTop = 0; }, [tab, wellMode, step, forest, selectedTask, reviewPart, sharedId, forumThread]);
  async function reload() {
    try { const result = await api('state'); snapshot.current = result; if (mounted.current) { setState(result); setProfile((current) => current || result.profile); } }
    catch (error) { if (mounted.current) setNotice({ kind: 'error', text: error.message, code: error.code, recovery: recoveryFor(error.code) }); }
  }
  async function run(path, payload, label, after, retry = false) {
    if (operation.current) return;
    const request = retry ? lastRequest.current : { path, payload: { ...payload, version: snapshot.current.version, requestKey: crypto.randomUUID() }, label, after };
    if (!request) return;
    const controller = new AbortController(); operation.current = { controller, key: request.payload.requestKey }; lastRequest.current = request;
    setBusy(label); setNotice(null);
    try {
      const result = await api(request.path, request.payload, controller.signal);
      snapshot.current = result.state;
      if (request.path === 'evidence') {
        const saved = result.state.evidence[request.payload.taskId];
        if (saved) memory.evidence[request.payload.taskId] = { artifactText: saved.artifactText || '', ...memory.evidence[request.payload.taskId], reflection: saved.reflection || '', confidence: saved.confidence || 3 };
      }
      if (mounted.current) {
        setState(result.state);
        if (['generate', 'review', 'import', 'course-plan', 'course-next'].includes(request.path)) { setProposalId(result.result.id); setJourneyWeek(1); setPreviewTask(null); setTab('proposal'); }
        if (request.path === 'confirm') { setProfile(result.state.profile); setHistoryId(''); setSelectedTask(result.result.source?.startsWith('course-') ? result.result.tasks.find(task => task.courseRef && !task.continuedFrom)?.id || null : null); setWellMode('landing'); setTab('journey'); }
        if (request.path === 'decline') { setProposalId(''); setTab(result.state.activePlanId ? 'journey' : 'well'); setWellMode('landing'); }
        setNotice({ kind: 'success', text: '已保存。' }); request.after?.(result);
      }
      lastRequest.current = null;
    } catch (error) {
      if (mounted.current) setNotice({ kind: error.name === 'AbortError' ? 'info' : 'error', text: error.name === 'AbortError' ? '已取消本次操作，原方案保持有效。' : error.message, code: error.code, recovery: error.name === 'AbortError' ? null : recoveryFor(error.code) });
    } finally { operation.current = null; if (mounted.current) setBusy(''); }
  }
  async function cancel() {
    if (!operation.current) return;
    const current = operation.current;
    await api('cancel', { requestKey: current.key }).catch(() => {});
    current.controller.abort();
  }
  function addCustomChoice(payload, after) { return run('custom-choice', payload, '正在保存我的补充', after); }
  function manageCustomChoice(payload, after) { return run('custom-choice', payload, '正在更新我的补充', after); }
  function useCustomGoal(item) { const value = (item.title + (item.detail ? '：' + item.detail : '')).slice(0, 1200); const goals = profile.goals || [profile.goal]; if (!goals.includes(value)) { if (goals.length >= 12) { setNotice({ kind: 'error', text: '最多添加12个目标，请先移除一项目标。' }); return; } changeProfile({ goals: [...goals, value], goal: [...goals, value].join('\n') }); } beginConfiguration('generate', 1); }
  function changeProfile(patch) { setProfile((current) => ({ ...current, ...patch })); }
  function openLibrary(section) { if (!confirmLeaveLearning()) return; memory.librarySection = section; setLibraryVisit(value => value + 1); setTab('library'); setNotice(null); setPreviewTask(null); }
  function navigate(target) { if (busy) return; if (target === 'library') { openLibrary('courses'); return; } if (!confirmLeaveLearning()) return; setTab(target); setNotice(null); setPreviewTask(null); if (target === 'well') setWellMode('landing'); if (target === 'community') setForest('hub'); if (target === 'journey') setSelectedTask(null); }
  function beginConfiguration(intent = 'generate', nextStep = 0) { if (!confirmLeaveLearning()) return; setSetupIntent(intent); setStep(nextStep); setWellMode('configuration'); setTab('well'); setNotice(null); }
  function openModule(panel) { if (busy || !confirmLeaveLearning()) return; setNotice({ kind: 'info', text: '当前任务已保留，完成阅读或整理后返回智慧之泉提交成果。' }); ctx.layout.selectPanel(panel); }
  function download(value, name, type = 'application/json') {
    const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function readShare(event) {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 150000) { setNotice({ kind: 'error', text: '方案文件需小于150KB。' }); return; }
    try { const value = JSON.parse(await file.text()); if (value.format !== 'mimir-growth-template' || value.schemaVersion !== 1) throw new Error('请选择MIMIR导出的v1方案文件。'); const safe = await api('validate-share', { template: value }); setImported(safe); setSharePreview(null); setSharedId(''); setJourneyWeek(1); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
    event.target.value = '';
  }
  if (!state || !profile) return h('div', { className: 'mg-app mg-loading' }, h(Fountain), h('h1', null, '智慧之泉'), h('p', null, notice?.text || '正在连接你的成长记录…'), button('重新连接', reload));
  const current = state.plans.find((plan) => plan.id === state.activePlanId), drafts = state.plans.filter((plan) => plan.status === 'draft');
  const viewing = historyId ? state.plans.find((plan) => plan.id === historyId) || current : current;
  const task = viewing?.tasks.find((item) => item.id === selectedTask), draft = drafts.find(plan => plan.id === proposalId) || drafts[drafts.length - 1];
  const completed = current?.tasks.filter((item) => state.evidence[item.id]?.status === 'completed').length || 0;
  const catalog = state.sharingCatalog || [];
  const actionsDisabled = Boolean(busy);
  const tabs = [['well', '智慧之泉', 'Mímisbrunnr'], ['journey', '世界树', '成长路径'], ['library', '知识与实践', '课程与前沿'], ['review', '诺伦回望', '阶段复盘'], ['community', '密米尔之林', '共享与同好']];

  function previewCards(plan, proposal = false) {
    return h('div', { className: 'mg-plan-cards' }, ...plan.tasks.filter(item => item.week === journeyWeek && (proposal || filter === 'all' || item.area === filter)).map((item, index) => {
      const evidence = state.evidence[item.id];
      return button(h('span', null, h('span', { className: 'mg-card-top' }, badge(areaNames[item.area]), h('small', null, String(index + 1).padStart(2, '0'))), h('strong', null, item.title), h('span', { className: 'mg-card-purpose' }, item.objective), h('span', { className: 'mg-card-bottom' }, h('small', null, depthNames[item.depth || plan.profile?.depths[item.area] || plan.depths?.[item.area]] + ' · ' + item.hours + 'h'), h('small', null, evidence?.status === 'completed' ? '✓ 已完成' : '预览目的与标准 ↗'))), () => setPreviewTask({ item, plan, proposal }), { key: item.id || index, className: 'mg-plan-card mg-task-row', style: { '--area-color': state.areas.find(area => area.id === item.area).color }, 'aria-label': '预览任务：' + item.title, disabled: actionsDisabled });
    }));
  }
  function weekSwitch(includeOverview = false) {
    return h('div', { className: 'mg-page-tabs', role: 'group', 'aria-label': '方案分页' }, ...[...(includeOverview ? [[0, '路径概览']] : []), [1, '第一周 · 建立理解'], [2, '第二周 · 尝试迁移']].map(([id, label]) => button(label, () => setJourneyWeek(id), { key: id, className: journeyWeek === id ? 'is-selected' : '', 'aria-pressed': journeyWeek === id, disabled: actionsDisabled })));
  }
  function previewDialog() {
    if (!previewTask) return null;
    const { item, plan, proposal } = previewTask, resource = learningResource(state, item);
    const depth = item.depth || plan.profile?.depths[item.area] || plan.depths?.[item.area];
    return h('div', { className: 'mg-preview-backdrop', onClick: event => { if (event.target === event.currentTarget) setPreviewTask(null); } }, h('section', { className: 'mg-preview-card', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'mg-preview-title' },
      h('header', null, badge(areaNames[item.area] + ' · ' + depthNames[depth]), button('关闭预览 ×', () => setPreviewTask(null), { className: 'mg-text-button', autoFocus: true })),
      h('div', { className: 'mg-preview-body' }, h('h2', { id: 'mg-preview-title' }, item.title), h('h3', null, '为什么做这件事'), h('p', null, item.objective),
        h('div', { className: 'mg-qualitative' }, h('div', null, h('small', null, '能力目标'), h('strong', null, DEPTH_DESCRIPTIONS[depth])), h('div', null, h('small', null, '预期成果'), h('strong', null, ({ paper: '论文问题与证据笔记', project: '设计方案与验证思路', lesson: '解题过程与概念解释', course: '课程判断、练习解释与迁移记录', explore: '探索记录与偏好判断' })[resource?.kind] || '学习成果记录')), h('div', null, h('small', null, '预计投入'), h('strong', null, '第' + item.week + '周 · ' + item.hours + '小时'))),
        h('h3', null, '怎样判断已经够用'), h('ul', null, ...item.criteria.map((criterion, index) => h('li', { key: index }, criterion))), item.prerequisites?.length > 0 && h('p', { className: 'mg-muted' }, '前置任务：' + item.prerequisites.map(index => plan.tasks[index].title).join('；'))),
      h('footer', null, button('返回方案', () => setPreviewTask(null), { className: 'mg-secondary' }), !proposal && button('进入这项学习 →', () => { setSelectedTask(item.id); setPreviewTask(null); }, { className: 'mg-primary' }))));
  }
  function draftView() {
    if (!draft) return h('div', { className: 'mg-empty' }, h('h1', null, '还没有待确认的方案'), button('进入智慧之泉', () => navigate('well'), { className: 'mg-primary' }));
    return h('div', { className: 'mg-proposal' }, h('header', { className: 'mg-page-heading' }, h('span', { className: 'mg-eyebrow' }, 'YOUR PLAN / 培养方案预览'), h('h1', null, draft.title), h('p', null, draft.summary)),
      h('section', { className: 'mg-plan-intent' }, h('div', null, h('small', null, '你的目的'), h('p', null, draft.profile.purpose)), h('div', null, h('small', null, '设计依据'), h('p', null, draft.rationale))),
      h('div', { className: 'mg-plan-meta' }, badge(draft.mode === 'model' ? 'AI 候选 · 待确认' : '本地示例 · 待确认'), badge(draft.tasks.length + '项目标 · 双周阶段'), badge(draft.advance ? '下一阶段' : '当前阶段'), ...state.areas.filter(area => draft.profile.weights[area.id] > 0).map(area => badge(area.name + ' ' + draft.profile.weights[area.id] + '% · ' + depthNames[draft.profile.depths[area.id]]))),
      h(LearningSection, { id: 'plan-changes', title: current ? '确认后，有什么变化？' : '这份候选安排了什么？', description: '先看调整与新增，再看延续与历史；同类变化优先显示你更看重的成长方向。', initialOpen: true, className: 'mg-plan-change-section' },
        h('div', { className: 'mg-plan-changes', 'aria-label': '候选方案差异' }, ...orderPlanChanges(draft, current).map((change, index) => h('article', { key: change.taskId || index, 'data-change-kind': change.kind }, badge(({ continue: '延续记录', replace: '调整目标', new: '新增目标', defer: '保留到历史' })[change.kind]), h('div', null, h('strong', null, change.title), change.previousTitle && change.kind === 'replace' && h('small', null, '原目标：' + change.previousTitle), h('p', null, change.reason), change.previousHours != null && change.hours !== undefined && h('small', null, change.previousHours + 'h → ' + change.hours + 'h')))))),
      weekSwitch(), previewCards(draft, true), current && h('p', { className: 'mg-step-help' }, '原方案与成果会保留在历史中，确认后才切换任务。'),
      h('div', { className: 'mg-proposal-controls' }, button(draft.source?.startsWith('course-') ? '← 返回课程目录' : '← 返回配置', () => { if (draft.source?.startsWith('course-')) { openLibrary('courses'); return; } setProfile(draft.profile); setReviewAdvance(draft.advance); beginConfiguration(draft.source === 'review' ? 'review' : 'generate', 5); }, { className: 'mg-secondary', disabled: actionsDisabled }), button('放弃候选', () => run('decline', { planId: draft.id }, '正在放弃候选'), { className: 'mg-text-button', disabled: actionsDisabled }), button('确认使用这份方案', () => run('confirm', { planId: draft.id }, '正在确认方案'), { className: 'mg-primary', disabled: actionsDisabled })));
  }

  function chatView() {
    return h('section', { className: 'mg-coach' }, h('div', { className: 'mg-section-heading' }, h('div', null, h('span', { className: 'mg-eyebrow' }, 'WITH MIMIR'), h('h2', null, '让计划听见你的变化')), h('span', { className: 'mg-coach-mark', 'aria-hidden': true }, 'M')),
      h('p', { className: 'mg-muted' }, '遇到困难、发现新的偏好，或觉得已经学得够用，都可以在这里告诉 MIMIR。'),
      h('div', { className: 'mg-conversation', 'aria-live': 'polite' }, state.messages.length ? state.messages.slice(-12).map((message) => h('div', { key: message.id, className: 'mg-message ' + message.role }, h('small', null, message.role === 'assistant' ? 'MIMIR' : '我'), h('p', null, message.text))) : h('p', { className: 'mg-empty-message' }, '例如：“我发现自己更喜欢控制方向，读论文的时间能否少一些？”')),
      h(CoachPrompts, { disabled: actionsDisabled, onChoose: setFeedback }),
      field('向 MIMIR 反馈，可自由补充', textArea(feedback, setFeedback, { placeholder: '选择上面的情境，或直接写下你现在的想法…', rows: 3, maxLength: 4000, disabled: actionsDisabled })),
      h('div', { className: 'mg-actions' }, button('与 MIMIR 交流', () => run('feedback', { message: feedback, mode: 'model' }, 'MIMIR 正在回应', () => setFeedback('')), { className: 'mg-primary', disabled: actionsDisabled || !feedback.trim() }), button('仅记录反馈', () => run('feedback', { message: feedback, mode: 'record' }, '正在记录反馈', () => setFeedback('')), { className: 'mg-text-button', disabled: actionsDisabled || !feedback.trim() })) );
  }
  function wellView() {
    if (wellMode === 'configuration') return h(Configuration, { profile, onChange: changeProfile, step, setStep, areas: state.areas, busy: actionsDisabled, intent: setupIntent,
      customItems: state.customChoices || [], customSelections: state.customChoiceSelections || {}, onManage: manageCustomChoice, onAdd: addCustomChoice, onExit: () => { setWellMode('landing'); if (setupIntent === 'review') setTab('review'); }, onSave: () => run('profile', { profile }, '正在保存配置'),
      onGenerate: mode => { setJourneyWeek(1); run(setupIntent === 'review' ? 'review' : 'generate', { profile, mode, advance: setupIntent === 'review' && reviewAdvance }, 'MIMIR 正在设计阶段方案'); } });
    const resumes = learningResume(current, state), resume = resumes[0], resumable = resume?.task;
    return h('section', { className: 'mg-well-landing' }, h('div', { className: 'mg-landing-copy' }, h('span', { className: 'mg-eyebrow' }, 'MÍMISBRUNNR / 智慧之泉'), h('h1', null, '你想成为怎样的自己？'), h('p', null, '选一个目的，构建你的成长方向。', h('br'), '每一步，都可以确认、回望与重新选择。'),
      button(h('span', null, h('strong', null, resumable ? '继续上次学习' : current ? '重新构建我的成长' : '开启我的成长配置'), h('small', null, resumable ? resumable.title : '六步配置 · 先选择，再定义')), () => { if (resumable) { setHistoryId(''); setSelectedTask(resumable.id); setTab('journey'); } else beginConfiguration(); }, { className: 'mg-enter-well', disabled: actionsDisabled }),
      resumable && button('重新配置成长方向 ↗', () => beginConfiguration(), { className: 'mg-text-button', disabled: actionsDisabled }),
      resume && h('section', { className: 'mg-resume-detail', 'aria-label': '上次学习进度' }, h('strong', null, resume.local ? '有浏览器草稿待恢复' : '成长记录已保存'), h('p', null, LEARNING_STEPS[(resume.local?.data || resume.session).step] + ' · 实践 ' + ((resume.local?.data || resume.session).workIndex + 1) + ' / 3 · 上次安排 ' + (resume.local?.data || resume.session).minutes + ' 分钟'), h('small', null, '记录时间：' + new Date(resume.at).toLocaleString('zh-CN') + '。进入后继续保存的小步。'), resumes.length > 1 && h('details', null, h('summary', null, '其他可继续的学习 · ' + (resumes.length - 1) + ' 项'), ...resumes.slice(1).map(item => button(item.task.title, () => { setHistoryId(''); setSelectedTask(item.task.id); setTab('journey'); }, { key: item.task.id, className: 'mg-text-button', disabled: actionsDisabled })))),
      h('div', { className: 'mg-landing-links' }, current && button('查看我的培养方案 ↗', () => navigate('journey'), { className: 'mg-text-button' }), button('随时向 MIMIR 反馈 ↗', () => setTab('coach'), { className: 'mg-text-button' })),
      draft && button('继续预览待确认方案 →', () => { setProposalId(draft.id); setJourneyWeek(1); setTab('proposal'); }, { className: 'mg-resume-plan' })),
      h('div', { className: 'mg-well-portal', 'aria-hidden': true }, h('div', { className: 'mg-orbit mg-orbit-one' }), h('div', { className: 'mg-orbit mg-orbit-two' }), h(Fountain), h('span', { className: 'mg-portal-label' }, 'MÍMISBRUNNR', h('small', null, 'WISDOM BEGINS WITH A CHOICE'))),
      h('div', { className: 'mg-home-bottom' }, h('nav', { className: 'mg-learning-doors', 'aria-label': '学习与实践快捷入口' }, ...learningDoors.map(([id, title, subtitle]) => button(h('span', { className: 'mg-door-content' }, h('span', { className: 'mg-door-topline' }, h('strong', null, title), h('span', { className: 'mg-door-arrow', 'aria-hidden': true }, '↗')), h('small', null, subtitle)), () => openLibrary(id), { key: id, disabled: actionsDisabled, 'data-learning-door': id }))),
      h('div', { className: 'mg-landing-foot' }, h('span', null, '科研 / 竞赛 / 绩点 / 兴趣'), h('span', null, current ? '第 ' + current.stage + ' 阶段 · ' + completed + '/' + current.tasks.length + ' 项完成' : '从一个选择开始'))));
  }

  function journeyView() {
    if (task) return h('div', { className: 'mg-learning-page' }, h(LearningStudio, { key: task.id, task, plan: viewing, resource: learningResource(state, task), evidence: state.evidence[task.id] || {}, session: state.learningSessions?.[task.id], studySession: state.studySessions?.[task.id], onStudy: payload => run('study-workspace', { taskId: task.id, ...payload }, '正在保存专题验证'), roboticsSession: state.roboticsSessions?.[task.id], roboticsTopic: state.roboticsTopic, onRobotics: payload => run('robotics-workspace', { taskId: task.id, ...payload }, '正在保存运动学检查与算例'), previousEvidence: state.evidence[task.previousTaskId], busy: actionsDisabled, readOnly: viewing.id !== state.activePlanId,
      onBack: () => { if (confirmLeaveLearning()) setSelectedTask(null); }, onSave: (payload, after) => run('learning', payload, '正在保存学习过程', after), onEvidence: (form, mode) => run('evidence', { taskId: task.id, ...form, mode }, mode === 'model' ? 'MIMIR 正在核对成果' : '正在保存成果'), onQuiz: answers => run('quiz', { taskId: task.id, answers }, '正在检查练习'), onComplete: (completed, after) => run('complete', { taskId: task.id, completed }, '正在更新完成状态', after), onModule: openModule, onCoach: message => { if (confirmLeaveLearning()) { setFeedback(message); setTab('coach'); } }, onCourseNext: () => run('course-next', { taskId: task.id }, '正在生成课程下一步候选'), onReview: () => { setReviewPart('reflection'); navigate('review'); }, onNext: () => { if (!confirmLeaveLearning()) return; const next = nextJourneyTask(viewing, state.evidence, state.journeyObstacles || {}, null); setSelectedTask(next?.id || null); if (!next) { setReviewPart('reflection'); navigate('review'); } } }));
    if (!viewing) return h('div', { className: 'mg-empty' }, h(Fountain), h('h1', null, '你的路径，即将从这里生长。'), button('进入智慧之泉', () => navigate('well'), { className: 'mg-primary' }));
    const graph = state.journeys?.[viewing.id] || { nodes: [], links: [], taskStatus: {} };
    return h(JourneyBoard, { key: viewing.id, plan: viewing, graph, areas: state.areas, evidence: state.evidence, checklist: state.journeyChecklist || {}, obstacles: state.journeyObstacles || {}, focusId: state.journeyFocus?.[viewing.id] || null, busy: actionsDisabled, readOnly: viewing.id !== state.activePlanId,
      historyId, historyOptions: state.plans.filter(plan => plan.status === 'historical'), onHistory: id => { setHistoryId(id); setSelectedTask(null); },
      onPreview: id => { const item = viewing.tasks.find(value => value.id === id); if (item) setPreviewTask({ item, plan: viewing, proposal: false }); }, onOpen: setSelectedTask, onReview: () => navigate('review'),
      onFocus: taskId => run('focus-task', { taskId }, '正在保存我的下一步'), onCheck: (taskId, index, checked) => run('check-criterion', { taskId, index, checked }, '正在保存小步清单'),
      onObstacle: (taskId, reason, note) => run('task-obstacle', { taskId, reason, note }, reason ? '正在记录卡点' : '正在更新卡点'),
      onComplete: (taskId, completed, selfReport = false) => run('complete', { taskId, completed, selfReport }, '正在更新目标完成记录'),
      onRecord: (taskId, reflection) => { const saved = state.evidence[taskId] || {}; run('evidence', { taskId, reflection, artifactText: saved.artifactText || '', confidence: saved.confidence || 3, mode: 'record' }, '正在保存学习记录'); } });
  }

  function reviewView() {
    if (!current) return h('div', { className: 'mg-empty' }, h('h1', null, '先建立第一份培养方案。'), button('进入智慧之泉', () => navigate('well'), { className: 'mg-primary' }));
    return h('div', { className: 'mg-review-page' }, h('header', { className: 'mg-page-heading' }, h('span', { className: 'mg-eyebrow' }, 'NORNS / 诺伦回望'), h('h1', null, '回望，是为了选择下一步。'), h('p', null, '第 ' + current.stage + ' 阶段 · ' + completed + '/' + current.tasks.length + ' 项完成 · ' + dateLabel(current.endsAt) + ' 复盘')),
      h('div', { className: 'mg-plan-meta' }, badge('每周轻回顾 · ' + dateLabel(current.checkInAt)), badge('双周复盘 · ' + dateLabel(current.endsAt)), ['weekly', 'stage'].includes(state.reviewStatus.kind) && badge('已到回顾时间')),
      h('div', { className: 'mg-page-tabs' }, ...[['reflection', '01 · 回望目的'], ['choices', '02 · 选择下一步'], ['history', '反馈记录']].map(([id, title]) => button(title, () => setReviewPart(id), { key: id, className: reviewPart === id ? 'is-selected' : '' }))),
      reviewPart === 'reflection' ? h(ReviewDialogue, { plan: current, sessions: state.learningSessions || {}, disabled: actionsDisabled, onSave: message => run('feedback', { message, mode: 'record' }, '正在保存阶段回顾', () => setReviewPart('choices')), onConfigure: hours => { setProfile(value => ({ ...value, weeklyHours: hours })); beginConfiguration('review', 4); }, onDepth: areas => { setProfile(value => ({ ...value, depths: { ...value.depths, ...Object.fromEntries(areas.map(area => [area, 'deep'])) } })); beginConfiguration('review', 3); } }) :
      reviewPart === 'history' ? h('section', { className: 'mg-feedback-history' }, state.feedback.length ? state.feedback.slice().reverse().slice(0, 20).map(item => h('div', { key: item.id }, h('small', null, dateLabel(item.at)), h('p', null, item.text))) : h('p', null, '还没有反馈记录。')) :
      h('section', { className: 'mg-review-next' }, h('h2', null, '保留目的，也允许自己改变方向。'), h('div', { className: 'mg-option-grid' }, h(Choice, { title: '调整当前阶段', subtitle: '保留阶段日期，重新安排当前任务', selected: !reviewAdvance, onClick: () => setReviewAdvance(false), disabled: actionsDisabled }), h(Choice, { title: '进入下一阶段', subtitle: '保留旧方案与成果，开启新的双周目标', selected: reviewAdvance, onClick: () => setReviewAdvance(true), disabled: actionsDisabled })), h('div', { className: 'mg-actions' }, button('调整配置后再设计 →', () => beginConfiguration('review', 2), { className: 'mg-primary', disabled: actionsDisabled }), button('沿用配置，AI 设计', () => run('review', { profile, mode: 'model', advance: reviewAdvance }, 'MIMIR 正在设计下一步'), { className: 'mg-secondary', disabled: actionsDisabled }), button('本地示例：进入下一阶段', () => { setJourneyWeek(1); run('review', { profile, mode: 'template', advance: true }, '正在建立示例复盘候选'); }, { className: 'mg-text-button', disabled: actionsDisabled }))));
  }

  function forestHeader(title, subtitle) {
    return h('header', { className: 'mg-page-heading' }, forest !== 'hub' && button('← 密米尔之林', () => { setForest('hub'); setSharedId(''); setForumThread(false); }, { className: 'mg-text-button' }), h('span', { className: 'mg-eyebrow' }, 'MIMIR FOREST / 密米尔之林'), h('h1', null, title), h('p', null, subtitle));
  }
  function courseAction(courseId, variant = 'foundation', topicRef) {
    const target = current?.tasks.find(task => task.courseRef?.id === courseId && state.evidence[task.id]?.status !== 'completed');
    if (target && (!topicRef || target.topicRef === topicRef)) { setHistoryId(''); setSelectedTask(target.id); setTab('journey'); return; }
    run('course-plan', { courseId, variant, ...(topicRef ? { topicRef } : {}) }, '正在设计这门课程的学习候选');
  }
  function attachLearning(area, artifactText, workshopFields = {}, startStep = 2) {
    const target = current?.tasks.find(item => item.area === area && state.evidence[item.id]?.status !== 'completed');
    if (!target) { beginConfiguration('generate', 2); setNotice({ kind: 'info', text: '当前没有这个方向的未完成目标。可调整侧重后设计候选方案；已保存的练习和工作台仍保留。' }); return; }
    const saved = memory.evidence[target.id] || state.evidence[target.id] || {};
    if ((saved.artifactText?.length || 0) + artifactText.length + 2 > 20000) { setNotice({ kind: 'error', text: '合并后超过成果文字上限。请先导出报告，或在目标中整理已有草稿后再带入。' }); return; }
    memory.evidence[target.id] = { artifactText: saved.artifactText ? saved.artifactText + '\n\n' + artifactText : artifactText, reflection: saved.reflection || '', confidence: saved.confidence || 3 };
    memory.learning ||= {}; const session = memory.learning[target.id] || state.learningSessions?.[target.id] || {}; memory.learning[target.id] = { ...session, fields: { ...session.fields, ...workshopFields }, step: startStep };
    setHistoryId(''); setSelectedTask(target.id); setTab('journey'); setNotice({ kind: 'info', text: '已带入成果草稿，请补充自己的理解并保存。当前目标尚未标记完成。' });
  }
  function communityView() {
    if (forest === 'sharing') return sharingView();
    if (forest === 'forum') return forumView();
    return h('section', { className: 'mg-forest-hub' }, forestHeader('在这里，遇见彼此的可能。', '一条好路径，一次有启发的讨论，都可以从这里出发。'),
      h('div', { className: 'mg-forest-doors' }, button(h('span', null, h('small', null, '01 / SHARED PATHS'), h('i', { 'aria-hidden': true }, '⌘'), h('strong', null, '方案共享'), h('p', null, '发现培养路径，Star 收藏，再适配成自己的下一步。'), h('span', null, '进入方案库 →')), () => { setForest('sharing'); setSharedId(''); setImported(null); setSharePreview(null); }, { className: 'mg-forest-door' }),
        button(h('span', null, h('small', null, '02 / CONVERSATIONS'), h('i', { 'aria-hidden': true }, '◌'), h('strong', null, '同好论坛'), h('p', null, '围绕学习、论文与项目，交换问题和经验。'), h('span', null, '进入同好论坛 →')), () => { setForest('forum'); setForumThread(false); }, { className: 'mg-forest-door' })));
  }
  function sharingView() {
    const shared = catalog.find(item => item.id === sharedId), template = shared?.template || imported || sharePreview;
    if (template) return h('div', { className: 'mg-sharing' }, button('← 方案库', () => { setSharedId(''); setImported(null); setSharePreview(null); }, { className: 'mg-text-button' }),
      h('header', { className: 'mg-page-heading' }, h('span', { className: 'mg-eyebrow' }, 'SHARED PATH / 共享方案预览'), h('h1', null, template.title), h('p', null, template.summary)),
      h('div', { className: 'mg-share-preview' }, h('div', { className: 'mg-plan-meta' }, badge(shared?.example ? '示例方案' : '本机方案'), ...state.areas.map(area => badge(area.name + ' ' + template.weights[area.id] + '%'))),
        h('div', { className: 'mg-sharing-controls' }, shared ? button((shared.starred ? '★ Starred' : '☆ Star') + ' · ' + shared.starCount, () => run('star', { planId: shared.id, starred: !shared.starred }, '正在更新收藏'), { className: 'mg-star' + (shared.starred ? ' is-starred' : ''), 'aria-pressed': shared.starred, disabled: actionsDisabled }) : button('保存到方案库', () => run('save-share', { template }, '正在保存共享方案', result => { setSharedId(result.result.id); setImported(null); setSharePreview(null); }), { className: 'mg-secondary', disabled: actionsDisabled }),
          button('下载可导入 JSON', () => download(template, 'MIMIR-成长方案.json'), { className: 'mg-secondary' }), button('下载可阅读 Markdown', () => download('# ' + template.title + '\n\n' + template.summary + '\n\n' + template.tasks.map(item => '## 第' + item.week + '周：' + item.title + '\n\n' + item.objective + '\n\n' + item.criteria.map(criterion => '- ' + criterion).join('\n')).join('\n\n'), 'MIMIR-成长方案.md', 'text/markdown;charset=utf-8'), { className: 'mg-text-button' })),
        weekSwitch(), previewCards(template, true), h('div', { className: 'mg-actions' }, button('用 AI 重新适配', () => run('import', { profile, template, mode: 'model' }, 'MIMIR 正在适配共享方案'), { className: 'mg-primary', disabled: actionsDisabled }), button('本地规则适配', () => run('import', { profile, template, mode: 'template' }, '正在适配示例方案'), { className: 'mg-secondary', disabled: actionsDisabled })), h('p', { className: 'mg-step-help' }, '将按你的目标与时间生成候选，确认后才替换当前方案。')));
    const plans = catalog.filter(item => sharingFilter !== 'starred' || item.starred);
    return h('div', { className: 'mg-sharing' }, forestHeader('让一条路径，启发下一条。', 'Star 收藏喜欢的方案，再按自己的目标、基础与时间重新适配。'),
      h('div', { className: 'mg-sharing-toolbar' }, h('div', { className: 'mg-page-tabs' }, button('全部方案', () => setSharingFilter('all'), { className: sharingFilter === 'all' ? 'is-selected' : '' }), button('我的 Stars · ' + state.starredPlanIds.length, () => setSharingFilter('starred'), { className: sharingFilter === 'starred' ? 'is-selected' : '' })),
        h('div', { className: 'mg-actions' }, button('预览我的共享方案', async () => { try { setSharePreview(await api('export')); setJourneyWeek(1); } catch (error) { setNotice({ kind: 'error', text: error.message }); } }, { className: 'mg-secondary', disabled: !current || actionsDisabled }), h('label', { className: 'mg-file-button' }, '导入方案文件', h('input', { type: 'file', accept: '.json,application/json', onChange: readShare, disabled: actionsDisabled })))),
      h('div', { className: 'mg-shared-grid' }, ...plans.map(plan => h('article', { key: plan.id, className: 'mg-shared-card' }, h('div', { className: 'mg-section-heading' }, h('small', null, plan.author), button((plan.starred ? '★ Starred' : '☆ Star') + ' · ' + plan.starCount, () => run('star', { planId: plan.id, starred: !plan.starred }, '正在更新收藏'), { className: 'mg-star' + (plan.starred ? ' is-starred' : ''), 'aria-pressed': plan.starred, disabled: actionsDisabled })), button(h('span', null, h('strong', null, plan.title), h('p', null, plan.template.summary), h('span', { className: 'mg-share-tags' }, ...state.areas.filter(area => plan.template.weights[area.id] >= 20).map(area => badge(area.name + ' ' + plan.template.weights[area.id] + '%'))), h('small', null, plan.example ? '示例路径 · 预览与适配 ↗' : '本机保存 · 预览与适配 ↗')), () => { setSharedId(plan.id); setJourneyWeek(1); }, { className: 'mg-shared-open' })))), !plans.length && h('p', { className: 'mg-empty' }, '还没有收藏方案。给喜欢的路径点一颗 Star。'), h('p', { className: 'mg-step-help' }, '方案库与 Star 当前保存在本机；分享文件前请预览任务文字。'));
  }
  function forumView() {
    const post = state.forumSeed.find(item => item.id === postId) || state.forumSeed[0];
    return h('div', { className: 'mg-forum' }, forestHeader(forumThread ? post.title : '同好论坛', forumThread ? '围绕一个具体问题，分享你的思考。' : '把卡住的问题，放进一场有回应的讨论。'), badge('本地交互 Demo'),
      !forumThread ? h('div', { className: 'mg-topic-grid' }, ...state.forumSeed.map(item => button(h('span', null, h('span', { className: 'mg-share-tags' }, ...item.tags.map(tag => badge(tag))), h('strong', null, item.title), h('p', null, item.body), h('small', null, (item.replies.length + state.forum.filter(reply => reply.postId === item.id).length) + ' 条讨论 · 查看话题 →')), () => { setPostId(item.id); setForumThread(true); }, { key: item.id, className: 'mg-topic-card' }))) :
      h('article', { className: 'mg-post' }, button('← 返回话题列表', () => setForumThread(false), { className: 'mg-text-button' }), h('small', null, post.author), h('p', null, post.body), ...[...post.replies, ...state.forum.filter(reply => reply.postId === post.id)].map((reply, index) => h('div', { key: reply.id || index, className: 'mg-post-reply' }, h('small', null, reply.author), h('p', null, reply.text))), field('参与讨论', textArea(forumReply, setForumReply, { rows: 3, maxLength: 2000, disabled: actionsDisabled })), button('保存本地回复', () => run('forum-reply', { postId: post.id, message: forumReply }, '正在保存演示回复', () => setForumReply('')), { className: 'mg-secondary', disabled: actionsDisabled || !forumReply.trim() })),
      h('p', { className: 'mg-step-help' }, '示例主题与新增回复用于本机演示，不是在线公开论坛。'));
  }

  return h('div', { className: 'mg-app mg-navigation-v2' }, h('div', { className: 'mg-topbar' }, h('small', { className: 'mg-wordmark-meta' }, h('span', null, '成长工作空间'), h('span', { className: 'mg-wordmark-version' }, 'v' + MIMIR_DISPLAY_VERSION)), button(h('span', { className: 'mg-wordmark' }, h('span', { className: 'mg-wordmark-name' }, h('mimir-wordmark', { width: '285', embedded: '' }, h('img',{className:'mg-wordmark-art mg-wordmark-light',src:WORDMARK_IMAGE,alt:'MIMIR',width:285,height:138}),h('img',{className:'mg-wordmark-art mg-wordmark-dark',src:WORDMARK_IMAGE,alt:'MIMIR',width:285,height:138})))), () => navigate('well'), { className: 'mg-wordmark-button', 'aria-label': '返回智慧之泉首页', disabled: actionsDisabled }), h('nav', { 'aria-label': '成长空间导航' }, ...tabs.map(([id, label, subtitle]) => button(h('span', null, label, h('small', null, subtitle)), () => navigate(id), { key: id, className: (tab === id || (id === 'well' && ['proposal', 'coach'].includes(tab))) ? 'is-active' : '', 'aria-current': (tab === id || (id === 'well' && ['proposal', 'coach'].includes(tab))) ? 'page' : undefined, disabled: actionsDisabled })))),
    h('div', { className: 'mg-scroll' + (tab === 'well' ? ' mg-screen' : '') }, notice && h('div', { className: 'mg-notice ' + notice.kind + (tab === 'journey' && notice.kind === 'success' ? ' mg-save-toast' : ''), role: notice.kind === 'error' ? 'alert' : 'status' }, h('div', null, notice.recovery && h('strong', null, notice.recovery.title), h('p', null, notice.text), notice.recovery && h('small', null, notice.recovery.help)), notice.recovery?.retry && lastRequest.current && button('重试上次操作', () => run(null, null, null, null, true), { disabled: actionsDisabled }), notice.recovery?.refresh && button('刷新保存记录', reload, { disabled: actionsDisabled }), notice.recovery?.record && lastRequest.current?.path === 'evidence' && button('仅保存成果与自评', () => run('evidence', { ...lastRequest.current.payload, mode: 'record' }, '正在保存成果'), { disabled: actionsDisabled }), notice.kind === 'error' && task && button('导出保留的草稿', () => exportLearningDraft({ taskId: task.id, title: task.title, data: { ...memory.learning?.[task.id], form: memory.evidence[task.id], answers: memory.quizzes[task.id] } }), { disabled: actionsDisabled })),
      busy && h('div', { className: 'mg-busy', role: 'status' }, h('span', { className: 'mg-spinner' }), busy, h(ProcessingTime), button('取消本次操作', cancel, { className: 'mg-text-button' })),
      tab === 'well' ? wellView() : tab === 'proposal' ? draftView() : tab === 'coach' ? h('div', { className: 'mg-coach-page' }, button('← 智慧之泉', () => navigate('well'), { className: 'mg-text-button' }), h('header', { className: 'mg-page-heading' }, h('h1', null, '让计划听见你的变化。')), chatView()) : tab === 'journey' ? journeyView() : tab === 'library' ? h(ResourceLibrary, { key: libraryVisit, state, busy: actionsDisabled, onRun: run, onAttach: attachLearning, onCourse: courseAction, onDownload: download, onAdd: addCustomChoice, onManage: manageCustomChoice, onCustomGoal: useCustomGoal, onModelSaved: reload }) : tab === 'review' ? reviewView() : communityView(),
      tab !== 'well' && h('footer', { className: 'mg-footer' }, h('span', null, 'MIMIR · 每一次选择，都可以重新出发。'), h('span', null, '个人成长计划 · 双周迭代'))), previewDialog());
}
exports.inject = ['slots', 'connection', 'layout', 'locale'];
exports.apply = function apply(ctx) {
  defineMimirWordmark();
  ctx.effect(() => observeNativeAiRequests(window, reportNativeAi));
  ctx.effect(() => {
    const original = ctx.locale.translate;
    const labels = { 'message.turnProcess.deepDivingFor': 'MIMIR 已处理 {duration}', 'message.turnProcess.took': 'MIMIR 处理用时 {duration}', 'message.turnProcess.failed': 'MIMIR 处理失败，请查看下方错误原因', 'chat.deepDiving': 'MIMIR 正在处理…' };
    const translated = function(namespace, key, params) { const copy = namespace === 'chat' && ctx.locale.getSnapshot().active.startsWith('zh') && labels[key]; return copy ? copy.replace(/\{(\w+)\}/g, (match, name) => params && name in params ? String(params[name]) : match) : original.call(this, namespace, key, params); };
    ctx.locale.translate = translated;
    return () => { if (ctx.locale.translate === translated) ctx.locale.translate = original; };
  });
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.mimirGrowth = '0.12.7'; style.textContent = GROWTH_CSS; document.head.appendChild(style); return () => style.remove(); });
  // Reuse the native settings owner so its section renderer keeps its authorization.
  ctx.slots.inject('sidebar.settings', () => {
    const originals = new Map();
    function patch() {
      for (const entry of ctx.slots.entriesOfSlot('sidebar.settings')) {
        if (!entry.children?.['settings.section'] || originals.has(entry)) continue;
        const original = entry.component;
        const wrapped = props => h(Fragment, null, h(original, props), h(NativeModelBridge, { renderSlot: props.renderSlot }));
        originals.set(entry, { original, wrapped }); entry.component = wrapped;
      }
    }
    patch(); const unsubscribe = ctx.slots.subscribe('sidebar.settings', patch);
    return () => { unsubscribe(); for (const [entry, value] of originals) if (entry.component === value.wrapped) entry.component = value.original; };
  });
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'mimir-native-ai-status', order: 21 }, NativeAiStatus));
  ctx.slots.inject('conversation.input.model', () => {
    const originals = new Map();
    function patch() { for (const entry of ctx.slots.entriesOfSlot('conversation.input.model')) { if (originals.has(entry)) continue; originals.set(entry, entry.component); entry.component = ResearchModelEntry; } }
    patch(); const unsubscribe = ctx.slots.subscribe('conversation.input.model', patch);
    return () => { unsubscribe(); for (const [entry, original] of originals) if (entry.component === ResearchModelEntry) entry.component = original; };
  });
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, () => h(App, { ctx })));
  // Reuse a declared sidebar seat; the host rejects undeclared child slots.
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', id: 'mimir-growth-entry', priority: -100 }, function GrowthEntry({ collapsed, usePanelInfo }) {
    const active = usePanelInfo(info => info.activePanelId === PANEL);
    return button(h('span', null, h(WellEmblem), !collapsed && h('span', null, '智慧之泉', h('small', null, '我的成长计划'))), () => { if (confirmLeaveLearning()) openGrowth(ctx); }, { className: 'mg-sidebar-entry' + (active ? ' is-active' : ''), title: '智慧之泉 · 我的成长计划', 'aria-label': '打开智慧之泉成长工作空间', 'aria-current': active ? 'page' : undefined });
  }));
  ctx.slots.inject('main', () => {
    const open = () => { if (ctx.slots.entriesOfSlot('main').some((entry) => entry.options?.key === PANEL)) { try { ctx.layout.selectPanel(PANEL); } catch {} } };
    open();
  });
};
