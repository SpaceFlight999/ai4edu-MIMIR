const DRAFT_PREFIX = 'mimir.learning.draft.v1:';
const LEARNING_STEPS = ['准备', '动手学习', '成果与反馈', '选择下一步'];
let learningDraftOwner;
function draftOwner() {
  if (learningDraftOwner) return learningDraftOwner;
  learningDraftOwner = crypto.randomUUID();
  return learningDraftOwner;
}
function acknowledgeLearningDrafts(planId, taskId, data) {
  try {
    const key = draftKey(planId, taskId), stored = JSON.parse(localStorage.getItem(key) || 'null');
    const matches = value => JSON.stringify(value.data) === JSON.stringify(data);
    const drafts = (stored?.drafts || (stored ? [stored] : [])).filter(value => !matches(value));
    if (drafts.length) localStorage.setItem(key, JSON.stringify({ drafts })); else localStorage.removeItem(key);
  } catch { /* An unavailable backup never blocks a successful formal save. */ }
}
function draftKey(planId, taskId) { return DRAFT_PREFIX + planId + '/' + taskId; }
function readLearningDraft(planId, taskId) {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey(planId, taskId)) || 'null');
    const value = (stored?.drafts || (stored ? [stored] : [])).filter(item => item?.planId === planId && item?.taskId === taskId).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    if (!value || value.planId !== planId || value.taskId !== taskId || !Number.isFinite(Date.parse(value.at)) || Date.now() - Date.parse(value.at) > 30 * 86400000) return null;
    const data = value.data;
    if (!data || ![0, 1, 2, 3].includes(data.step) || ![0, 1, 2].includes(data.workIndex) || ![10, 20, 40].includes(data.minutes) || ![0, 1, 2].includes(data.scopeStart) || !data.fields || Array.isArray(data.fields) || Object.values(data.fields).some(text => typeof text !== 'string' || text.length > 1800) || !data.form || typeof data.form.artifactText !== 'string' || data.form.artifactText.length > 20000 || typeof data.form.reflection !== 'string' || data.form.reflection.length > 4000 || ![1, 2, 3, 4, 5].includes(data.form.confidence) || !Array.isArray(data.answers) || data.answers.some(answer => !Number.isInteger(answer) || answer < -1) || typeof data.answer !== 'string' || data.answer.length > 1200) return null;
    return value;
  } catch { return null; }
}
function writeLearningDraft(planId, taskId, data, baseAt, id = 'default') {
  try {
    const at = new Date().toISOString();
    const stored = JSON.parse(localStorage.getItem(draftKey(planId, taskId)) || 'null');
    const drafts = (stored?.drafts || (stored ? [stored] : [])).filter(item => item.id !== id && Date.now() - Date.parse(item.at) <= 30 * 86400000);
    if (drafts.length >= 8) return null;
    drafts.push({ id, planId, taskId, at, baseAt, data });
    localStorage.setItem(draftKey(planId, taskId), JSON.stringify({ drafts }));
    return at;
  } catch { return null; }
}
function removeLearningDraft(planId, taskId, id) {
  try {
    const key = draftKey(planId, taskId), stored = JSON.parse(localStorage.getItem(key) || 'null');
    const drafts = (stored?.drafts || (stored ? [stored] : [])).filter(item => id !== undefined && item.id !== id);
    if (drafts.length) localStorage.setItem(key, JSON.stringify({ drafts })); else localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
function learningSavedAt(session, evidence) { return [session?.at, evidence?.at, evidence?.quizAt].filter(Boolean).sort().at(-1) || ''; }
function learningScope(blocks, workIndex, minutes) {
  return blocks.slice(workIndex, workIndex + ({ 10: 1, 20: 2, 40: 3 })[minutes]);
}
function learningResume(plan, state) {
  return (plan?.tasks || []).filter(task => state.evidence[task.id]?.status !== 'completed').map(task => {
    const session = state.learningSessions?.[task.id], local = readLearningDraft(plan.id, task.id);
    return { task, session, local, at: [local?.at, session?.at].filter(Boolean).sort().at(-1) || '' };
  }).filter(item => item.at).sort((a, b) => b.at.localeCompare(a.at));
}
function recoveryFor(code) {
  if (code === 'TRANSPORT') return { title: '本机服务连接中断', help: '编辑内容仍在当前页面。先保存浏览器备份或导出草稿，确认 MIMIR 后台运行后重试。', retry: true };
  if (['VERSION_CONFLICT', 'STALE_TASK', 'STALE_DRAFT', 'IDEMPOTENCY_MISMATCH'].includes(code)) return { title: '保存记录已变化', help: '可能有另一页更新了记录。刷新记录后对照浏览器草稿，再决定保存；不会自动覆盖新记录。', refresh: true };
  if (code === 'AUTH_REQUIRED') return { title: '页面连接授权已失效', help: '先导出未保存的草稿，再通过 Start MIMIR.cmd 重新打开当前实例。' };
  if (code === 'BACKEND_VERSION') return { title: '后台需要更新', help: '先保存或导出草稿，从托盘退出当前实例，再双击 Start MIMIR.cmd。' };
  if (['MODEL_UNAVAILABLE', 'INVALID_MODEL_OUTPUT', 'MODEL_TIMEOUT', 'MODEL_OUTPUT_LIMIT', 'MODEL_AUTH', 'MODEL_RATE_LIMIT', 'MODEL_NETWORK', 'MODEL_PROVIDER_ERROR', 'MODEL_CONTEXT_LIMIT', 'MODEL_RESPONSE_INCOMPLETE', 'MODEL_REQUEST_INVALID'].includes(code)) return { title: 'AI 暂时未能完成', help: '按报错核对设置或缩小处理范围，再手动重新发起；也可以仅保存成果与自评。当前方案仍然有效。', record: true };
  if (code === 'COURSE_INCOMPLETE') return { title: '还有学习内容未完成', help: '已保存的小步成果可以保留。选择“继续剩余实践”，按提示完成练习和解释。' };
  if (code === 'COMPLETED_TASK') return { title: '这项任务已经完成', help: '回看已有成果；需要修改时，先撤回完成标记。', refresh: true };
  return { title: '这次操作未完成', help: '请按上面的原因调整后重新操作。编辑草稿可以保留。' };
}
function exportLearningDraft(value, name = 'MIMIR-学习草稿.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'mimir-learning-draft', ...value }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function optionMatches(item, query, searchText) {
  const text = searchText(item).toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(word => text.includes(word));
}
let moreChoiceId = 0;
function orderPlanChanges(draft, current) {
  const priority = { replace: 0, new: 1, continue: 2, defer: 3 };
  const tasks = new Map((draft.tasks || []).map(task => [task.id, task]));
  const previous = new Map((current?.tasks || []).map(task => [task.id, task]));
  const importance = change => {
    const task = tasks.get(change.taskId) || previous.get(change.previousTaskId);
    return { weight: draft.profile?.weights?.[task?.area] || 0, week: task?.week || 3 };
  };
  return [...(draft.changeSet || [])].sort((a, b) => {
    const type = (priority[a.kind] ?? 4) - (priority[b.kind] ?? 4);
    if (type) return type;
    const first = importance(a), second = importance(b);
    return second.weight - first.weight || first.week - second.week;
  });
}
function LearningSection({ id, title, description, children, level = 2, initialOpen = false, className = '' }) {
  const [open, setOpen] = useState(() => memory.libraryExpanded?.[id] ?? initialOpen);
  const toggle = () => { const next = !open; memory.libraryExpanded = { ...memory.libraryExpanded, [id]: next }; setOpen(next); };
  return h('section', { className: 'mg-disclosure ' + className, 'data-learning-section': id },
    h('h' + level, null, button(h('span', null, h('span', { className: 'mg-disclosure-title' }, title), description && h('small', null, description), h('span', { className: 'mg-disclosure-action', 'aria-hidden': true }, open ? '收起 −' : '展开 +')), toggle, { className: 'mg-disclosure-trigger', 'aria-expanded': open, 'aria-controls': 'mg-section-' + id, id: 'mg-section-title-' + id })),
    h('div', { id: 'mg-section-' + id, className: 'mg-disclosure-content' + (open ? ' is-open' : ''), inert: open ? undefined : '', 'aria-hidden': !open, 'aria-labelledby': 'mg-section-title-' + id },
      h('div', { className: 'mg-disclosure-clip' }, h('div', { className: 'mg-disclosure-body' }, children))));
}
function MoreChoices({ label, items, renderItem, searchText = item => item.title, className = '', disabled, customItems = [], customSelections = {}, selectedId, onAdd, onManage, onUse, renderCustom, previewLimit }) {
  const [expanded, setExpanded] = useState(false), [query, setQuery] = useState(''), [title, setTitle] = useState(''), [detail, setDetail] = useState(''), [source, setSource] = useState('');
  const [editing, setEditing] = useState(''), [deleting, setDeleting] = useState('');
  const [showAll, setShowAll] = useState(false);
  const id = useRef(null); if (!id.current) id.current = 'mg-more-' + (++moreChoiceId);
  const visible = items.filter(item => optionMatches(item, query, searchText));
  const additions = customItems.filter(item => item.label === label);
  const clear = () => { setTitle(''); setDetail(''); setSource(''); setEditing(''); };
  const submit = () => editing ? onManage?.({ action: 'update', id: editing, title, detail, source }, clear) : onAdd?.({ label, title, detail, source }, clear);
  const edit = item => { setEditing(item.id); setTitle(item.title); setDetail(item.detail || ''); setSource(item.source || ''); setExpanded(true); setDeleting(''); requestAnimationFrame(() => document.querySelector('[data-custom-title="' + label + '"]')?.focus()); };
  const choose = item => onManage ? onManage({ action: 'select', id: item.id }, () => queueMicrotask(() => onUse?.(item))) : onUse?.(item);
  const active = selectedId === undefined ? customSelections[label] : selectedId;
  return h('section', { className: 'mg-more-choices', 'data-more-label': label },
    h('div', { className: 'mg-more-heading' }, h('small', null, '推荐 ' + items.length + ' 项 · 我的补充 ' + additions.length + ' 项'), button(expanded ? '收起其他' : '其他', () => setExpanded(value => !value), { className: 'mg-text-button', disabled, 'aria-expanded': expanded, 'aria-controls': id.current })),
    h('div', { id: id.current, hidden: !expanded, className: 'mg-other-editor' }, h('p', null, editing ? '修改我的' + label + '，保存后更新补充卡片。已有学习记录保留。' : '推荐还不够全面？添加自己的' + label + '。'),
      field(label + '名称', textInput(title, setTitle, { maxLength: 80, disabled, 'data-custom-title': label })),
      field(['研究方向', '兴趣方向'].includes(label) ? '检索关键词或补充说明（建议英文关键词）' : '补充说明（可选）', textArea(detail, setDetail, { rows: 2, maxLength: 1200, disabled, 'data-custom-detail': label })),
      ['核心课', '公开课', '竞赛与历史题', '深入学习主题'].includes(label) && field('来源地址（可选）', textInput(source, setSource, { type: 'url', maxLength: 1000, disabled, placeholder: 'https://…', 'data-custom-source': label })),
      h('div', { className: 'mg-actions' }, button(editing ? '保存修改' : '添加' + label, submit, { className: 'mg-primary', disabled: disabled || !title.trim() || (editing ? !onManage : !onAdd) }), editing && button('取消修改', clear, { className: 'mg-secondary', disabled })),
      h('small', null, '保存到我的补充后，可再次选择和使用。'),
      field('筛选已有推荐（可选）', textInput(query, setQuery, { type: 'search', maxLength: 120, placeholder: '输入名称或关键词', disabled, 'data-option-search': label })),
      !visible.length && h('div', { className: 'mg-search-empty', role: 'status' }, h('p', null, '没有找到匹配项，可以在上方添加自己的内容。'), button('清除搜索', () => setQuery(''), { className: 'mg-secondary', disabled }))),
    h('div', { className: 'mg-custom-cards' }, ...additions.map(item => h('article', { key: item.id, 'data-custom-id': item.id, className: active === item.id ? 'is-selected' : '' }, badge(active === item.id ? '✓ 已选择' : '我的补充'), h('strong', null, item.title), item.detail && h('p', null, item.detail), item.source && h('a', { href: item.source, target: '_blank', rel: 'noopener noreferrer' }, '打开我的来源 ↗'),
      h('div', { className: 'mg-actions' }, button(active === item.id ? '已选择这项补充' : '选择这项补充', () => choose(item), { className: 'mg-secondary', 'aria-pressed': active === item.id, disabled: disabled || !onUse }), button('修改', () => edit(item), { className: 'mg-text-button', disabled: disabled || !onManage }), button('删除', () => setDeleting(item.id), { className: 'mg-text-button mg-danger', disabled: disabled || !onManage })),
      renderCustom?.(item), deleting === item.id && h('div', { className: 'mg-delete-confirm', role: 'group', 'aria-label': '确认删除补充' }, h('p', null, '删除这项补充？已有方案和学习记录会保留。'), button('确认删除', () => onManage?.({ action: 'delete', id: item.id }, () => { setDeleting(''); if (editing === item.id) clear(); }), { className: 'mg-secondary mg-danger', disabled }), button('取消', () => setDeleting(''), { className: 'mg-text-button', disabled }))))),
    h('div', { className }, ...(previewLimit && !showAll && !query ? visible.slice(0, previewLimit) : visible).map(renderItem)),
    previewLimit && visible.length > previewLimit && !query && button(showAll ? '收起更多公开课' : '查看全部公开课（' + visible.length + '）', () => setShowAll(value => !value), { className: 'mg-secondary mg-show-courses', 'aria-expanded': showAll, disabled }));
}
