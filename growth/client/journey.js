const JOURNEY_OBSTACLES = [['concept', '概念还没理解'], ['time', '时间不够'], ['resource', '资料或工具不足'], ['other', '其他困难']];
function taskReadiness(plan, evidence, task) {
  return task.prerequisites.map(index => plan.tasks[index]).filter(item => evidence[item.id]?.status !== 'completed');
}
function nextJourneyTask(plan, evidence, obstacles, focusId) {
  const pending = plan.tasks.filter(task => evidence[task.id]?.status !== 'completed');
  const ready = pending.filter(task => taskReadiness(plan, evidence, task).length === 0);
  const pinned = pending.find(task => task.id === focusId);
  return pinned || ready.sort((a, b) => Number(Boolean(obstacles[a.id])) - Number(Boolean(obstacles[b.id])) || a.week - b.week || plan.profile.weights[b.area] - plan.profile.weights[a.area] || a.hours - b.hours)[0] || null;
}

function JourneyTaskInspector({ task, plan, evidence, checklist, obstacle, busy, readOnly, onCheck, onRecord, onComplete, onObstacle, onFocus, focused, onOpen, onPreview, onClose }) {
  const saved = evidence[task.id] || {};
  const [note, setNote] = useState(readOnly ? saved.reflection || '' : memory.evidence[task.id]?.reflection ?? saved.reflection ?? '');
  const [obstacleReason, setObstacleReason] = useState(obstacle?.reason || 'concept'), [obstacleNote, setObstacleNote] = useState(obstacle?.note || ''), [panel, setPanel] = useState('steps');
  useEffect(() => { if (!readOnly) memory.evidence[task.id] = { artifactText: saved.artifactText || '', confidence: saved.confidence || 3, ...memory.evidence[task.id], reflection: note }; }, [note, readOnly]);
  const prerequisites = taskReadiness(plan, evidence, task), done = saved.status === 'completed', hasRecord = Boolean(saved.artifactText || saved.reflection);
  const checks = checklist[task.id] || {}, checked = task.criteria.filter((_, index) => checks[index]).length;
  return h('aside', { className: 'mg-todo-inspector', 'aria-label': '目标行动面板' },
    h('header', null, badge(areaNames[task.area] + ' · ' + depthNames[task.depth]), button('收起 ×', onClose, { className: 'mg-text-button' })),
    h('h2', null, task.title), h('div', { className: 'mg-inspector-meta' }, badge('第' + task.week + '周 · ' + task.hours + 'h'), badge(done ? '已确认完成' : obstacle ? '有卡点待处理' : hasRecord ? '已有学习记录' : '待开始')),
    prerequisites.length > 0 && h('div', { className: 'mg-prerequisite-note' }, h('small', null, '先完成前置目标'), ...prerequisites.map(item => button(item.title + ' ↗', () => onOpen(item.id), { key: item.id, className: 'mg-text-button' }))),
    h('div', { className: 'mg-inspector-tabs' }, ...[['steps', '行动清单'], ['record', '学习记录'], ['obstacle', '我卡住了']].map(([id, title]) => button(title, () => setPanel(id), { key: id, className: panel === id ? 'is-selected' : '', 'aria-pressed': panel === id }))),
    h('div', { className: 'mg-inspector-body' }, panel === 'steps' ? h('div', null,
      h('p', { className: 'mg-inspector-purpose' }, task.objective), h('div', { className: 'mg-checklist-caption' }, h('strong', null, '把目标拆成小步'), h('small', null, checked + '/' + task.criteria.length + ' 条已自查')),
      h('div', { className: 'mg-criterion-list' }, ...task.criteria.map((criterion, index) => h('label', { key: index, className: checks[index] ? 'is-checked' : '' }, h('input', { type: 'checkbox', checked: Boolean(checks[index]), disabled: busy || readOnly, onChange: event => onCheck(task.id, index, event.target.checked), 'aria-label': '自查：' + criterion }), h('span', null, criterion)))),
      h('p', { className: 'mg-inspector-help' }, '自查记录你的推进情况；提交成果或自评后，再确认目标完成。'),
      h('div', { className: 'mg-actions' }, button(focused ? '已设为我的下一步' : '设为我的下一步', () => onFocus(task.id), { className: 'mg-secondary', disabled: busy || readOnly || focused || done || prerequisites.length > 0, title: prerequisites.length ? '先完成前置目标，再把这一项设为下一步' : '' }), button('预览目的 ↗', () => onPreview(task.id), { className: 'mg-text-button' }))) :
      panel === 'record' ? h('div', null,
        saved.artifactText && h('details', { className: 'mg-existing-artifact' }, h('summary', null, '查看已有成果'), h('p', null, saved.artifactText)),
        field('这一项的收获或成果摘要', textArea(note, setNote, { rows: 4, maxLength: 4000, disabled: busy || readOnly || done, placeholder: '用自己的话留下概念解释、验证结果或学习反思…' })),
        !readOnly && !done && button('保存学习记录', () => onRecord(task.id, note), { className: 'mg-secondary', disabled: busy || !note.trim() }),
        saved.reflection && h('p', { className: 'mg-record-saved' }, '已保存的自评：' + saved.reflection),
        h('p', { className: 'mg-inspector-help' }, '完整练习、论文笔记与 AI 成果反馈可以在学习页继续。')) :
      h('div', { className: 'mg-obstacle-panel' }, h('p', null, '是什么挡住了你？'), h('div', { className: 'mg-obstacle-options' }, ...JOURNEY_OBSTACLES.map(([id, title]) => button(title, () => setObstacleReason(id), { key: id, className: obstacleReason === id ? 'is-selected' : '', disabled: busy || readOnly, 'aria-pressed': obstacleReason === id }))),
        field('补充一句（可选）', textArea(obstacleNote, setObstacleNote, { rows: 3, maxLength: 1000, disabled: busy || readOnly, placeholder: '例如：总把第二关节的相对角看成全局角。' })),
        !readOnly && h('div', { className: 'mg-actions' }, button('记录这个卡点', () => onObstacle(task.id, obstacleReason, obstacleNote), { className: 'mg-secondary', disabled: busy }), obstacle && button('这个卡点已解决', () => onObstacle(task.id, null, ''), { className: 'mg-text-button', disabled: busy })),
        obstacle && h('small', null, '已记录：' + JOURNEY_OBSTACLES.find(([id]) => id === obstacle.reason)?.[1] + (obstacle.note ? ' · ' + obstacle.note : '')), h('p', { className: 'mg-inspector-help' }, '卡点会留在当前目标里，也会作为下一次 AI 复盘的参考。'))),
    h('footer', null, button('进入完整学习 →', () => onOpen(task.id), { className: 'mg-secondary', disabled: busy }),
      !readOnly && button(done ? '撤回完成标记' : '我确认完成这项目标', () => onComplete(task.id, !done), { className: done ? 'mg-text-button' : 'mg-primary', disabled: busy || (!done && (!hasRecord || prerequisites.length > 0)), title: !done && !hasRecord ? '请先在学习记录中留下成果或自评' : prerequisites.length ? '请先完成前置目标' : '' })));
}

function JourneyBoard({ plan, graph, areas, evidence, checklist, obstacles, focusId, busy, readOnly, onCheck, onRecord, onComplete, onObstacle, onFocus, onPreview, onOpen, onReview, historyId, historyOptions, onHistory }) {
  const navigation = memory.journeyBoards?.[plan.id] || {};
  const [view, setView] = useState(navigation.view || memory.journeyView || 'tasks'), [week, setWeek] = useState(navigation.week ?? 1), [areaFilter, setAreaFilter] = useState(navigation.areaFilter || 'all'), [statusFilter, setStatusFilter] = useState(navigation.statusFilter || 'all');
  const [inspectedId, setInspectedId] = useState(navigation.inspectedId || null), [selectedNode, setSelectedNode] = useState(navigation.selectedNode || null), [pathIndex, setPathIndex] = useState(navigation.pathIndex || 0);
  useEffect(() => { memory.journeyView = view; }, [view]);
  useEffect(() => { memory.journeyBoards ||= {}; memory.journeyBoards[plan.id] = { view, week, areaFilter, statusFilter, inspectedId, selectedNode, pathIndex }; }, [plan.id, view, week, areaFilter, statusFilter, inspectedId, selectedNode, pathIndex]);
  const inspected = plan.tasks.find(task => task.id === inspectedId);
  const completed = plan.tasks.filter(task => evidence[task.id]?.status === 'completed').length, progress = completed / Math.max(1, plan.tasks.length);
  const recorded = plan.tasks.filter(task => evidence[task.id]?.artifactText || evidence[task.id]?.reflection).length, obstacleCount = plan.tasks.filter(task => obstacles[task.id]).length;
  const next = nextJourneyTask(plan, evidence, obstacles, focusId), allDone = completed === plan.tasks.length;
  const status = task => evidence[task.id]?.status === 'completed' ? 'completed' : obstacles[task.id] ? 'obstacle' : evidence[task.id]?.status === 'submitted' ? 'submitted' : Object.values(checklist[task.id] || {}).some(Boolean) ? 'progress' : 'pending';
  const tasks = plan.tasks.filter(task => (!week || task.week === week) && (areaFilter === 'all' || task.area === areaFilter) && (statusFilter === 'all' || status(task) === statusFilter));
  function inspect(taskId) { const item = plan.tasks.find(task => task.id === taskId); if (!item) return; setWeek(item.week); setAreaFilter('all'); setStatusFilter('all'); setInspectedId(item.id); setView('tasks'); }
  const extendedGraph = { ...graph, goal: plan.profile.goal, tasks: plan.tasks.map(task => ({ ...task, status: evidence[task.id]?.status || 'pending' })) };
  return h('section', { className: 'mg-yggdrasil-board' + (view === 'map' || inspected ? ' is-focused-workspace' : '') },
    h('header', { className: 'mg-journey-heading' }, h('div', null, h('span', { className: 'mg-eyebrow' }, 'YGGDRASIL / 世界树'), h('h1', null, plan.title), h('p', null, '第 ' + plan.stage + ' 阶段 · ' + dateLabel(plan.startsAt) + ' — ' + dateLabel(plan.endsAt))),
      h('label', { className: 'mg-journey-history' }, '方案记录', h('select', { value: historyId, onChange: event => onHistory(event.target.value) }, h('option', { value: '' }, '当前方案'), ...historyOptions.map(item => h('option', { key: item.id, value: item.id }, '阶段' + item.stage + ' · ' + dateLabel(item.confirmedAt) + ' · 历史'))))),
    h('div', { className: 'mg-journey-summary' },
      h('section', { className: 'mg-next-action' }, h('small', null, readOnly ? '历史阶段' : allDone ? '阶段目标已全部确认完成' : '把注意力放到下一步'), h('strong', null, allDone ? '给这一段成长留一次回望。' : next ? next.title : '先处理前置目标或记录卡点。'),
        h('p', null, allDone ? '回顾这些成果是否已经支撑你的目的，再选择下一段深度。' : next ? taskReadiness(plan, evidence, next).length ? '这是你选择的目标。先查看并完成它的前置目标，再继续推进。' : focusId === next.id ? '这是你选择的下一步。先完成一个小标准，再继续推进。' : '优先考虑可开始的任务、当前周次和你的成长侧重。' : '任务需要逐步推进，看看是否有未完成的前置目标。'),
        h('div', { className: 'mg-actions' }, allDone ? button('去诺伦回望 →', onReview, { className: 'mg-primary' }) : next && button('打开这一步 →', () => inspect(next.id), { className: 'mg-primary' }), !readOnly && focusId && button('重新选择下一步', () => onFocus(null), { className: 'mg-text-button', disabled: busy }))),
      h('section', { className: 'mg-growth-meter' }, h('svg', { viewBox: '0 0 100 100', 'aria-hidden': true }, h('circle', { cx: 50, cy: 50, r: 40, className: 'mg-meter-track' }), h('circle', { cx: 50, cy: 50, r: 40, className: 'mg-meter-progress', strokeDasharray: (progress * 251.33) + ' 251.33' })),
        h('div', { className: 'mg-meter-text' }, h('strong', null, completed + '/' + plan.tasks.length), h('small', null, '目标完成')), h('p', null, recorded + ' 项已有学习记录', h('br'), obstacleCount ? obstacleCount + ' 个卡点待处理' : '从一小步开始')),
      h('section', { className: 'mg-growth-branches' }, h('small', null, '四条成长枝 · 按完成记录'), ...areas.filter(area => plan.tasks.some(task => task.area === area.id)).map(area => {
        const branch = plan.tasks.filter(task => task.area === area.id), done = branch.filter(task => evidence[task.id]?.status === 'completed').length;
        return button(h('span', null, h('span', { className: 'mg-branch-label' }, h('strong', null, area.name), h('small', null, done + '/' + branch.length)), h('span', { className: 'mg-branch-line' }, h('i', { style: { width: done / branch.length * 100 + '%' } }))), () => { setAreaFilter(area.id); setWeek(0); setStatusFilter('all'); setView('tasks'); }, { key: area.id, className: 'mg-growth-branch', style: { '--area-color': area.color }, 'aria-label': '筛选' + area.name + '目标' });
      }))),
    h('div', { className: 'mg-journey-tabs', role: 'tablist', 'aria-label': '世界树视图' }, ...[['tasks', '行动清单', '01'], ['map', '知识地图', '02'], ['stages', '阶段路径', '03']].map(([id, title, mark]) => button(h('span', null, h('small', null, mark), title), () => setView(id), { key: id, className: view === id ? 'is-selected' : '', role: 'tab', 'aria-selected': view === id, 'aria-controls': 'mg-journey-pane' }))),
    h('div', { id: 'mg-journey-pane', role: 'tabpanel', className: 'mg-journey-pane' },
      view === 'map' ? h(KnowledgeTopology, { graph: extendedGraph, areas, selectedNodeId: selectedNode, onSelectNode: setSelectedNode, onPreviewTask: onPreview, onOpenTask: onOpen, readOnly, busy }) :
      view === 'stages' ? h('div', { className: 'mg-stage-path' }, h('div', { className: 'mg-stage-purpose' }, h('small', null, '始终回到你的目的'), h('p', null, plan.profile.purpose)),
        h('div', { className: 'mg-stage-route', role: 'group', 'aria-label': '规划阶段' }, ...plan.roadmap.map((row, index) => button(h('span', null, h('i', null, String(index + 1).padStart(2, '0')), h('strong', null, row.title), h('small', null, '概览第' + row.fromWeek + '—' + row.toWeek + '周')), () => setPathIndex(index), { key: index, className: pathIndex === index ? 'is-selected' : '', 'aria-pressed': pathIndex === index }))),
        plan.roadmap[pathIndex] && h('article', { className: 'mg-stage-outcome' }, badge('远期规划参考 · 预期成果'), h('h2', null, plan.roadmap[pathIndex].title), h('p', null, plan.roadmap[pathIndex].outcome), h('small', null, '概览周次是这一份规划的相对周次；后续任务在复盘后细化，实际阶段和成果保存在方案记录中。'), h('div', { className: 'mg-actions' }, button('返回当前任务 →', () => setView('tasks'), { className: 'mg-secondary' }), button('回望并设计下一步 →', onReview, { className: 'mg-text-button' })))) :
      h('div', { className: 'mg-todo-workspace mg-task-list' + (inspected ? ' has-inspector' : '') }, h('section', { className: 'mg-todo-list-pane' },
        h('div', { className: 'mg-todo-toolbar' }, h('div', { className: 'mg-week-select' }, ...[[1, '第一周 · 建立理解'], [2, '第二周 · 尝试迁移'], [0, '双周全部']].map(([id, title]) => button(title, () => setWeek(id), { key: id, className: week === id ? 'is-selected' : '', 'aria-pressed': week === id }))),
          h('select', { value: statusFilter, onChange: event => setStatusFilter(event.target.value), 'aria-label': '筛选任务状态' }, ...[['all', '全部状态'], ['pending', '待开始'], ['progress', '推进中'], ['submitted', '已有记录'], ['obstacle', '有卡点'], ['completed', '已完成']].map(([id, title]) => h('option', { key: id, value: id }, title)))),
        h('div', { className: 'mg-todo-area-filters' }, ...[['all', '全部方向'], ...areas.map(area => [area.id, area.name])].map(([id, title]) => button(title, () => setAreaFilter(id), { key: id, className: areaFilter === id ? 'is-selected' : '', 'aria-pressed': areaFilter === id }))),
        h('div', { className: 'mg-todo-rows' }, ...tasks.map(task => {
          const done = evidence[task.id]?.status === 'completed', missing = taskReadiness(plan, evidence, task), saved = evidence[task.id], hasRecord = Boolean(saved?.artifactText || saved?.reflection);
          const statusLabel = done ? '已确认完成' : obstacles[task.id] ? '有卡点' : missing.length ? '先做前置目标' : hasRecord ? '已有记录 · 待确认' : Object.values(checklist[task.id] || {}).some(Boolean) ? '推进中 · 已自查' : '待开始';
          return h('article', { key: task.id, 'data-task-id': task.id, className: 'mg-todo-row' + (done ? ' is-done' : '') + (task.id === inspectedId ? ' is-selected' : '') + (task.id === focusId ? ' is-focused' : ''), style: { '--area-color': areas.find(area => area.id === task.area).color } },
            h('input', { type: 'checkbox', checked: done, disabled: busy || readOnly, 'aria-label': (done ? '撤回完成：' : '确认完成：') + task.title, title: done ? '取消勾选可撤回完成，已有成果保留' : '勾选表示你自报已经办完；课程目标仍需完成练习与成果', onChange: () => onComplete(task.id, !done, true) }),
            button(h('span', null, h('span', { className: 'mg-todo-row-top' }, badge(areaNames[task.area]), task.id === focusId && h('small', null, '◉ 我的下一步')), h('strong', null, task.title), h('small', null, depthNames[task.depth] + ' · ' + task.hours + 'h · ' + statusLabel)), () => inspect(task.id), { className: 'mg-todo-open', 'aria-label': '打开行动清单：' + task.title }),
            button('↗', () => onPreview(task.id), { className: 'mg-todo-preview', 'aria-label': '预览任务：' + task.title }));
        }), !tasks.length && h('div', { className: 'mg-todo-empty' }, h('p', null, '这个筛选下没有任务。'), button('查看全部目标', () => { setWeek(0); setAreaFilter('all'); setStatusFilter('all'); }, { className: 'mg-text-button' }))),
        h('p', { className: 'mg-todo-help' }, '完成后勾选方框，标题会划掉；取消勾选可恢复。勾选是自报，已有成果保留；课程需先完成学习与练习。')),
        inspected && h(JourneyTaskInspector, { key: inspected.id, task: inspected, plan, evidence, checklist, obstacle: obstacles[inspected.id], busy, readOnly, focused: inspected.id === focusId, onCheck, onRecord, onComplete, onObstacle, onFocus, onPreview, onOpen, onClose: () => setInspectedId(null) }))),
    h('div', { className: 'mg-journey-note' }, h('small', null, readOnly ? '历史方案仅供回望；成果、清单与卡点记录仍保留。' : '成长进度来自目标记录；是否值得继续深入，由你在回望时选择。'), button('进入诺伦回望 →', onReview, { className: 'mg-text-button' })));
}
