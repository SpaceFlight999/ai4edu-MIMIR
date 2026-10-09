const LEARNING_CHOICES = [['enough', '当前已经够用', '把已有成果用于当前目的'], ['deepen', '我想继续深入学习', '选择下一步想独立完成的事'], ['help', '我需要帮助', '先处理卡点，再决定投入']];
function compiledLearning(resource, fields) {
  const lines = resource.workshop.blocks.flatMap(block => block.fields.filter(spec => fields[spec.id]).map(spec => spec.label + '：' + fields[spec.id]));
  if (resource.kind === 'lesson' && fields.comparison) lines.unshift('连杆实验：' + fields.comparison);
  if (resource.kind === 'explore') ['class1', 'class2', 'class3'].forEach((id, index) => { if (fields[id]) lines.push('信息卡 ' + (index + 1) + ' 分工：' + fields[id]); });
  return lines.length ? resource.workshop.title + '\n\n' + lines.join('\n\n') : '';
}
function KinematicsLab({ fields, update, disabled }) {
  const a = Number(fields.angle1 || 0), b = Number(fields.angle2 || 0), rad = Math.PI / 180;
  const x1 = Math.cos(a * rad), y1 = Math.sin(a * rad), x = x1 + Math.cos((a + b) * rad), y = y1 + Math.sin((a + b) * rad);
  const [comparison, setComparison] = useState('');
  const move = patch => { update({ ...patch, comparison: '' }); setComparison(''); };
  function compare() {
    const px = Number(fields.predictX), py = Number(fields.predictY);
    const correct = Math.abs(px - x) < .05 && Math.abs(py - y) < .05;
    const result = `θ₁=${a}°，θ₂=${b}°；预测 (${fields.predictX}, ${fields.predictY})，实际 (${x.toFixed(2)}, ${y.toFixed(2)})。`;
    update({ comparison: result }); setComparison((correct ? '预测与计算一致。' : '预测还需调整。') + '第二段的全局角为 ' + (a + b) + '°，将两段的 x、y 投影分别相加。');
  }
  return h('div', { className: 'mg-kinematics-lab' },
    h('svg', { viewBox: '0 0 400 330', role: 'img', 'aria-label': '平面二连杆：两段长度为 1，当前末端坐标 ' + x.toFixed(2) + ', ' + y.toFixed(2) },
      h('path', { d: 'M25 175H375 M200 20V315', stroke: 'var(--mg-line)', strokeWidth: 1 }), h('text', { x: 370, y: 167 }, 'x'), h('text', { x: 208, y: 28 }, 'y'),
      h('circle', { cx: 200, cy: 175, r: 125, fill: 'none', stroke: 'var(--mg-line)', strokeDasharray: '4 6' }),
      h('path', { d: `M200 175L${200 + x1 * 62} ${175 - y1 * 62}`, stroke: '#7193c2', strokeWidth: 9, strokeLinecap: 'round' }),
      h('path', { d: `M${200 + x1 * 62} ${175 - y1 * 62}L${200 + x * 62} ${175 - y * 62}`, stroke: '#c2859b', strokeWidth: 9, strokeLinecap: 'round' }),
      ...[[200, 175], [200 + x1 * 62, 175 - y1 * 62], [200 + x * 62, 175 - y * 62]].map(([cx, cy], index) => h('circle', { key: index, cx, cy, r: 6, fill: 'currentColor' }))),
    h('div', null, ...[['angle1', '第一关节 θ₁', a], ['angle2', '相对关节 θ₂', b]].map(([id, title, value]) => field(title + ' · ' + value + '°', h('input', { type: 'range', min: -180, max: 180, step: 15, value, disabled, 'aria-label': title, onChange: event => move({ [id]: event.target.value }) }))),
      h('div', { className: 'mg-prediction' }, field('预测 x', textInput(fields.predictX || '', value => move({ predictX: value }), { type: 'number', step: '.01', min: -2, max: 2, disabled })), field('预测 y', textInput(fields.predictY || '', value => move({ predictY: value }), { type: 'number', step: '.01', min: -2, max: 2, disabled }))),
      button('比较你的预测', compare, { className: 'mg-secondary', disabled: disabled || !fields.predictX?.trim() || !fields.predictY?.trim() || !Number.isFinite(Number(fields.predictX)) || !Number.isFinite(Number(fields.predictY)) }),
      (comparison || fields.comparison) && h('p', { className: 'mg-lab-feedback', role: 'status' }, comparison || fields.comparison), h('small', null, 'L₁=L₂=1；角度按度输入。实验记录只保存观察，不代表掌握度。')));
}
function ClassificationLab({ fields, update, disabled }) {
  const [checked, setChecked] = useState(false);
  const cards = fields.scene === '室内导航' ? ['检测前方障碍物的位置', '选择一条可行路径', '向轮子发送运动指令'] : fields.scene === '人机协作' ? ['识别人是否进入工作区域', '决定等待还是调整作业顺序', '执行机械臂停止或移动动作'] : ['识别物体的位置与类别', '选择抓取顺序和路径', '执行关节运动与夹爪动作'];
  return h('div', { className: 'mg-classification' }, ...cards.map((card, index) => field(card, h('select', { value: fields['class' + (index + 1)] || '', disabled, onChange: event => { update({ ['class' + (index + 1)]: event.target.value }); setChecked(false); } }, h('option', { value: '' }, '选择分工'), ...['感知', '规划', '执行'].map(value => h('option', { key: value }, value))))),
    button('检查我的分类', () => setChecked(true), { className: 'mg-secondary', disabled: disabled || [1, 2, 3].some(index => !fields['class' + index]) }), checked && h('div', { className: 'mg-lab-feedback', role: 'status' }, ...cards.map((_, index) => h('p', { key: index }, (fields['class' + (index + 1)] === ['感知', '规划', '执行'][index] ? '✓ ' : '再想想：') + '信息卡 ' + (index + 1) + ' 对应' + ['感知：获取场景信息。', '规划：选择行动。', '执行：让动作发生。'][index]))));
}
function LearningStudio({ task, plan, resource, evidence, session, previousEvidence, studySession, onStudy, roboticsSession, roboticsTopic, busy, readOnly, onBack, onSave, onEvidence, onQuiz, onComplete, onModule, onCoach, onReview, onNext, onCourseNext, onRobotics }) {
  memory.learning ||= {};
  const cached = readOnly ? null : memory.learning[task.id];
  const [recovery, setRecovery] = useState(() => {
    const value = !readOnly && !cached && evidence.status !== 'completed' ? readLearningDraft(plan.id, task.id) : null;
    return value;
  });
  const draftId = useRef(cached?.draftId || draftOwner());
  const [backupAt, setBackupAt] = useState(''), [backupFailed, setBackupFailed] = useState(false);
  const [step, setStep] = useState(cached?.step ?? session?.step ?? (evidence.status === 'completed' ? 3 : 0));
  const [workIndex, setWorkIndex] = useState(cached?.workIndex ?? session?.workIndex ?? 0), [minutes, setMinutes] = useState(cached?.minutes ?? session?.minutes ?? 20);
  const [scopeStart, setScopeStart] = useState(cached?.scopeStart ?? session?.scopeStart ?? 0);
  const [fields, setFields] = useState(cached?.fields ?? session?.fields ?? {}), [choice, setChoice] = useState(cached?.choice ?? session?.checkpoint?.choice ?? '');
  const [answer, setAnswer] = useState(cached?.answer ?? session?.checkpoint?.answer ?? ''), [focus, setFocus] = useState(cached?.focus ?? session?.checkpoint?.focus ?? 'concept');
  const evidenceForm = { artifactText: evidence.artifactText || '', reflection: evidence.reflection || '', confidence: evidence.confidence || 3 };
  const savedForm = session?.draftForm && (!evidence.at || session.at >= evidence.at) && evidence.status !== 'completed' ? session.draftForm : evidenceForm;
  const [form, setForm] = useState(readOnly ? savedForm : memory.evidence[task.id] || savedForm), [error, setError] = useState('');
  const savedAt = useRef(evidence.at);
  const persistedAnswers = evidence.quiz && (evidence.status === 'completed' || !session?.quizAnswers || (evidence.quizAt || '') >= (session.at || '')) ? evidence.quiz.answers : session?.quizAnswers || evidence.quiz?.answers || resource.quizzes?.map(() => -1) || [];
  const [answers, setAnswers] = useState(readOnly || evidence.status === 'completed' ? persistedAnswers : memory.quizzes[task.id] || persistedAnswers);
  const done = evidence.status === 'completed', locked = busy || readOnly || done || Boolean(recovery);
  const isCourse = Boolean(task.courseRef), scopeEnd = Math.min(2, scopeStart + ({ 10: 1, 20: 2, 40: 3 })[minutes] - 1);
  const dirty = !readOnly && (JSON.stringify(fields) !== JSON.stringify(session?.fields || {}) || ['artifactText', 'reflection', 'confidence'].some(key => form[key] !== savedForm[key]) || minutes !== (session?.minutes || 20) || choice !== (session?.checkpoint?.choice || '') || answer !== (session?.checkpoint?.answer || '') || (choice === 'help' && focus !== (session?.checkpoint?.focus || 'concept')) || (resource.quizzes && JSON.stringify(answers) !== JSON.stringify(persistedAnswers)) || (!done && (step !== (session?.step || 0) || workIndex !== (session?.workIndex || 0) || scopeStart !== (session?.scopeStart || 0))));
  const draftData = { step, workIndex, minutes, scopeStart, fields, form, answers, choice, answer, focus };
  const latestDraft = useRef(null); latestDraft.current = JSON.stringify(draftData);
  useEffect(() => {
    if (readOnly || recovery) return;
    if (dirty) { const at = writeLearningDraft(plan.id, task.id, draftData, learningSavedAt(session, evidence), draftId.current); setBackupAt(at || ''); setBackupFailed(!at); }
    else { removeLearningDraft(plan.id, task.id, draftId.current); setBackupAt(''); }
  }, [step, workIndex, minutes, scopeStart, fields, form, answers, choice, answer, focus, dirty, recovery, readOnly]);
  function restoreDraft() {
    const data = recovery.data;
    setStep(data.step); setWorkIndex(data.workIndex); setMinutes(data.minutes); setScopeStart(data.scopeStart); setFields(data.fields); setForm(data.form); setAnswers(data.answers.length === (resource.quizzes?.length || 0) ? data.answers : persistedAnswers); setChoice(data.choice || ''); setAnswer(data.answer); setFocus(data.focus || 'concept'); setRecovery(null); setError('');
  }
  useEffect(() => { if (!readOnly && !recovery) { memory.learning[task.id] = { step, workIndex, minutes, fields, choice, answer, focus, scopeStart, draftId: draftId.current }; memory.evidence[task.id] = form; memory.quizzes[task.id] = answers; } }, [step, workIndex, minutes, fields, choice, answer, focus, scopeStart, form, answers, readOnly, recovery]);
  useEffect(() => {
    memory.dirtyLearning ||= {}; memory.dirtyLearning[task.id] = dirty;
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { delete memory.dirtyLearning[task.id]; window.removeEventListener('beforeunload', warn); };
  }, [dirty, task.id]);
  useEffect(() => { if (evidence.at && evidence.at !== savedAt.current) { savedAt.current = evidence.at; if (!dirty) setForm({ artifactText: evidence.artifactText || '', reflection: evidence.reflection || '', confidence: evidence.confidence || 3 }); } }, [evidence.at]);
  const update = patch => { setFields(current => ({ ...current, ...patch })); setError(''); };
  const changeStep = value => { setStep(value); setError(''); };
  function save(nextStep = step, nextWork = workIndex, checkpoint = false, nextScope = scopeStart, after) {
    const requestedDraft = latestDraft.current;
    const draftForm = nextStep === 2 && !form.artifactText ? { ...form, artifactText: compiledLearning(resource, fields) } : form;
    const payload = { taskId: task.id, step: nextStep, workIndex: nextWork, minutes, fields, scopeStart: nextScope, draftForm, ...(resource.quizzes && (!done || evidence.quiz) ? { quizAnswers: answers } : {}), ...(checkpoint ? { checkpoint: { choice, answer, focus } } : {}) };
    onSave(payload, result => { acknowledgeLearningDrafts(plan.id, task.id, JSON.parse(requestedDraft)); if (latestDraft.current !== requestedDraft) { setError('上次请求已保存；你随后修改的内容仍在草稿中，请再次保存。'); return; } const saved = result.result; changeStep(nextStep); setWorkIndex(nextWork); setScopeStart(nextScope); setFields(saved.fields); setForm(saved.draftForm || draftForm); if (saved.quizAnswers) setAnswers(saved.quizAnswers); if (checkpoint && saved.checkpoint) { setAnswer(saved.checkpoint.answer); setFocus(saved.checkpoint.focus || 'concept'); } after?.(); });
  }
  const studyTopic = resource.studyTopic;
  function forward() {
    const block = resource.workshop.blocks[workIndex], missing = block.fields.filter(spec => spec.required && !fields[spec.id]?.trim());
    if (missing.length) { setError('请先完成：' + missing.map(spec => spec.label).join('、') + '。也可以先保存草稿。'); return; }
    if (task.topicRef && block.topicLab === 'diagnosis' && (!roboticsSession?.diagnosis || roboticsSession.diagnosis.correct !== roboticsSession.diagnosis.total || roboticsSession.diagnosis.answers.some((answer, index) => fields['diag' + index] !== undefined && answer !== Number(fields['diag' + index])))) { setError('请按提示完成当前先修检查，再进入算例验证。输入可先保存。'); return; }
    if (task.topicRef && block.topicLab === 'workbench' && ['zero', 'right', 'custom'].some(kind => !roboticsSession?.trials.some(trial => trial.kind === kind && trial.passed))) { setError('请在专用工作台保存零角度、直角和自选输入的正确算例，再整理报告。'); return; }
    if (block.studyLab === 'diagnosis' && (studySession?.diagnosis?.correct !== 3 || studySession.diagnosis.answers.some((answer, index) => fields['studyDiag' + index] !== undefined && answer !== Number(fields['studyDiag' + index])))) { setError('请完成并保存当前先修检查，再进入专题验证。'); return; }
    if (block.studyLab === 'trials' && ['basic', 'reference', 'custom'].some(kind => !studySession?.trials.some(item => item.kind === kind && item.passed))) { setError('请保存基础、参考和自选三个验证记录。'); return; }
    if (task.resourceId === 'sorting-cell' && workIndex === 1 && fields.exceptionA === fields.exceptionB) { setError('请为两种不同的异常设计处理方法。'); return; }
    if (block.lab === 'kinematics' && !fields.comparison) { setError('先写下预测并比较位置，再进入特例检验。'); return; }
    if (['quiz', 'course-quiz'].includes(block.lab) && (!evidence.quiz || JSON.stringify(evidence.quiz.answers) !== JSON.stringify(answers))) { setError('先检查当前练习答案，再整理成果。'); return; }
    if (block.lab === 'classification' && [1, 2, 3].some(index => !fields['class' + index])) { setError('先为三张信息卡选择分工。'); return; }
    save(workIndex === 2 || workIndex >= scopeEnd ? 2 : 1, Math.min(2, workIndex + 1));
  }
  const block = resource.workshop.blocks[workIndex];
  const purposeQuestion = choice === 'enough' ? '这个成果现在能帮你完成什么具体事情？' : choice === 'deepen' ? '下一步，你希望能独立做到什么？为什么值得投入？' : '卡在哪一步？你最需要怎样的帮助？';
  return h('section', { className: 'mg-learning-studio mg-task-detail', 'aria-label': '学习任务详情' },
    h('header', { className: 'mg-studio-header' }, h('div', null, badge(areaNames[task.area] + ' · ' + depthNames[task.depth]), h('h1', null, resource.workshop.title), h('p', null, task.title)), button('← 返回培养方案', onBack, { className: 'mg-text-button', disabled: busy })),
    h('nav', { className: 'mg-studio-steps', 'aria-label': '学习过程' }, ...[['准备', 0], ['动手学习', 1], ['成果与反馈', 2], ['选择下一步', 3]].map(([label, index]) => button(h('span', null, h('small', null, '0' + (index + 1)), label), () => changeStep(index), { key: index, className: step === index ? 'is-selected' : '', 'aria-current': step === index ? 'step' : undefined, disabled: busy }))),
    !readOnly && h('div', { className: 'mg-save-state', role: 'status', 'aria-live': 'polite' }, h('div', null, h('strong', null, busy ? '正在处理，请等待保存结果…' : dirty ? backupAt ? '浏览器已备份 · 尚未保存到成长记录' : '有未保存的内容' : session ? '成长记录已保存 · ' + new Date(session.at).toLocaleString('zh-CN') : '随时保存过程，下次继续'), h('small', null, backupFailed ? '浏览器备份失败，请手动保存或导出草稿。' : '浏览器备份用于当前地址的刷新恢复；点击保存后，退出重开也能继续。')), button('保存当前过程与草稿', () => save(step, workIndex, Boolean(choice && answer.trim())), { className: 'mg-secondary', disabled: busy || Boolean(recovery) }), button('导出当前草稿', () => exportLearningDraft({ taskId: task.id, title: task.title, data: recovery?.data || draftData }), { className: 'mg-text-button' })),
    recovery && h('section', { className: 'mg-draft-recovery', role: 'status', 'aria-label': '恢复学习草稿' }, h('h3', null, '找到一份未保存的浏览器草稿'), h('p', null, '备份时间：' + new Date(recovery.at).toLocaleString('zh-CN') + ' · ' + LEARNING_STEPS[recovery.data.step]), h('p', null, recovery.baseAt !== learningSavedAt(session, evidence) ? '成长记录在备份后有更新。先回看保存内容，再决定是否恢复这份草稿。' : '当前展示成长记录中的内容；恢复后可继续编辑，再点击保存。'), h('details', null, h('summary', null, '预览浏览器草稿'), h('pre', { className: 'mg-pre-wrap' }, compiledLearning(resource, recovery.data.fields) + '\n\n' + recovery.data.form.artifactText + '\n' + recovery.data.form.reflection)), button('恢复浏览器草稿', restoreDraft, { className: 'mg-primary', disabled: busy }), button('保留已保存内容', () => { removeLearningDraft(plan.id, task.id, recovery.id); setRecovery(readLearningDraft(plan.id, task.id)); }, { className: 'mg-secondary', disabled: busy })),
    isCourse && h('div', { className: 'mg-course-source' }, badge('明确来源 · ' + resource.course.provider), resource.course.url && h('a', { href: resource.course.url, target: '_blank', rel: 'noopener noreferrer' }, resource.studyTopic?.custom ? '打开我的来源 ↗' : '打开这门公开课 ↗'), h('small', null, '下方导学与练习由 MIMIR 原创编写，来源在链接中打开。')),
    previousEvidence?.artifactText && h('details', { className: 'mg-previous-work' }, h('summary', null, '回看上一项学习的成果'), h('pre', { className: 'mg-pre-wrap' }, previousEvidence.artifactText)),
    error && h('p', { className: 'mg-inline-error', role: 'alert' }, error),
    h('div', { className: 'mg-studio-body', key: step }, step === 0 ? h('section', null,
      h('h2', null, '先决定这一次做到哪里'), h('p', { className: 'mg-task-purpose' }, task.objective), h('p', null, '本次产出：' + ({ paper: '问题、方法与原文证据卡', project: '模块接口、异常恢复与验证方案', lesson: '连杆观察、特例练习与解释', course: '课程判断、检查解释与迁移记录', explore: '场景分工、小问题与验证方法' })[resource.kind]),
      h('div', { className: 'mg-option-grid' }, ...[10, 20, 40].map(value => h(Choice, { key: value, title: value + ' 分钟', subtitle: learningScope(resource.workshop.blocks, workIndex, value).map(item => item.title).join(' → ') + ' · 保存小步成果', selected: minutes === value, onClick: () => setMinutes(value), disabled: locked }))),
      h('h3', null, '做到什么，就可以停下来'), h('ul', null, ...task.criteria.map((criterion, index) => h('li', { key: index }, criterion))),
      h('p', { className: 'mg-muted' }, '时间是本次安排，不会自动修改培养方案。随时保存草稿，下次继续。'),
      h('div', { className: 'mg-course-scope' }, h('strong', null, '这次从实践 ' + (workIndex + 1) + ' 开始，最多做 ' + learningScope(resource.workshop.blocks, workIndex, minutes).length + ' 个小步'), h('p', null, learningScope(resource.workshop.blocks, workIndex, minutes).map(item => item.title).join(' → ')), h('small', null, '完成本次小步后整理并保存；时间是学习安排，不是倒计时，也不会自动标记完整目标完成。')),
      resource.kind === 'paper' && button('进入论文导读 ↗', () => save(step, workIndex, Boolean(choice && answer.trim()), scopeStart, () => setTimeout(() => onModule('mimir-paper-guide'), 100)), { className: 'mg-text-button', disabled: locked }),
      button(session ? '继续这次学习 →' : '开始这次学习 →', () => save(1, workIndex, false, workIndex), { className: 'mg-primary', disabled: locked })) :
    step === 1 ? h('section', null, h('div', { className: 'mg-section-heading' }, h('span', null, '实践 ' + (workIndex + 1) + ' / 3'), button('保存学习草稿', () => save(), { className: 'mg-text-button', disabled: locked })),
      h('h2', null, block.title), h('p', null, block.hint),
      block.guide && h('div', { className: 'mg-course-guide' }, h('small', null, 'MIMIR 小段导学'), h('p', null, block.guide)),
      studyTopic && block.studyLab === 'diagnosis' && h(StudyPrerequisites, { task, topic: studyTopic, session: studySession, fields, update, disabled: locked, onRun: onStudy }),
      studyTopic && block.studyLab === 'trials' && h(StudyWorkbench, { topic: studyTopic, session: studySession, fields, update, disabled: locked, onRun: onStudy }),
      task.topicRef && block.topicLab === 'diagnosis' && h(RobotPrerequisites, { taskId: task.id, topic: roboticsTopic, fields, update, session: roboticsSession, disabled: locked, onRun: onRobotics }),
      task.topicRef && block.topicLab === 'workbench' && h(RobotWorkbench, { fields, update, session: roboticsSession, disabled: locked, onRun: onRobotics, report: roboticsReport(task, resource, roboticsSession), onExport: exportRoboticsReport }),
      ...block.fields.map(spec => spec.options ? field(spec.label, h('select', { value: fields[spec.id] || '', disabled: locked, 'data-learning-field': spec.id, onChange: event => update({ [spec.id]: event.target.value }) }, h('option', { value: '' }, '请选择'), ...spec.options.map(option => h('option', { key: option }, option)))) : field(spec.label, textArea(fields[spec.id] || '', value => update({ [spec.id]: value }), { rows: 2, maxLength: 1800, placeholder: spec.placeholder, disabled: locked, 'data-learning-field': spec.id }))),
      block.lab === 'kinematics' && h(KinematicsLab, { fields, update, disabled: locked }), block.lab === 'classification' && h(ClassificationLab, { fields, update, disabled: locked }),
      ['quiz', 'course-quiz'].includes(block.lab) && h('section', { className: 'mg-quiz' }, ...resource.quizzes.map((quiz, index) => h('fieldset', { key: quiz.id || index }, h('legend', null, quiz.question), ...quiz.options.map((option, optionIndex) => h('label', { key: optionIndex }, h('input', { type: 'radio', name: task.id + '-quiz-' + index, checked: answers[index] === optionIndex, disabled: locked, onChange: () => setAnswers(current => current.map((value, i) => i === index ? optionIndex : value)) }), option)))),
        button('检查答案并获得提示', () => onQuiz(answers), { className: 'mg-secondary', disabled: locked || answers.some(value => value < 0) }), evidence.quiz && h('div', { className: 'mg-quiz-feedback', role: 'status' }, h('strong', null, evidence.quiz.correct + '/' + evidence.quiz.total + ' 题正确'), ...evidence.quiz.feedback.map(item => h('p', { key: item.id }, (item.passed ? '✓ ' : '再想想：') + item.text)))),
      h('div', { className: 'mg-studio-controls' }, button('← 上一步', () => workIndex ? setWorkIndex(workIndex - 1) : changeStep(0), { className: 'mg-secondary', disabled: busy }), button(workIndex >= scopeEnd ? '保存本次小步并整理 →' : '保存并继续 →', forward, { className: 'mg-primary', disabled: locked }))) :
    step === 2 ? h('section', null, h('h2', null, '让这次学习留下可回看的成果'),
      studyTopic && h('section', { className: 'mg-robot-report' }, h('h3', null, '从保存的验证记录整理专题报告'), h('p', null, studyTopic.boundary), !locked && button('把专题记录加入成果草稿', () => { const report = studyReport(task, studyTopic, studySession); if (report) setForm(current => ({ ...current, artifactText: (current.artifactText ? current.artifactText + '\n\n' : '') + report })); else setError('先保存专题验证记录。'); }, { className: 'mg-secondary' }), studySession?.trials.length > 0 && button('导出专题分析报告', () => exportStudyReport(studyReport(task, studyTopic, studySession) + '\n\n' + form.artifactText, studyTopic.title), { className: 'mg-text-button' })),
      task.topicRef && h('section', { className: 'mg-robot-report' }, h('h3', null, '从已保存的验证记录整理分析报告'), h('p', null, '报告注明公式、输入、预测、后台计算、误差与仿真边界；可以在下方继续编辑自己的分析。'), !locked && button('把验证记录加入成果草稿', () => { const report = roboticsReport(task, resource, roboticsSession); if (report) setForm(current => ({ ...current, artifactText: (current.artifactText ? current.artifactText + '\n\n' : '') + report })); else setError('先在专用工作台保存至少一条算例。'); }, { className: 'mg-secondary' }), roboticsSession?.trials.length > 0 && button('导出运动学分析报告', () => exportRoboticsReport(roboticsReport(task, resource, roboticsSession) + '\n\n## 我的成果与分析\n' + form.artifactText + '\n\n## 收获与困难\n' + form.reflection), { className: 'mg-text-button' })),
      !locked && button('从工作坊记录生成成果草稿', () => { const result = compiledLearning(resource, fields); if (result) setForm(current => ({ ...current, artifactText: current.artifactText ? current.artifactText + '\n\n' + result : result })); else setError('先在动手学习中留下记录，再整理成果。'); }, { className: 'mg-secondary', disabled: busy }),
      field('成果文字', textArea(form.artifactText, value => setForm(current => ({ ...current, artifactText: value })), { rows: 6, maxLength: 20000, disabled: locked, placeholder: '可编辑工作坊草稿，或粘贴已有成果。保存后再确认完成。' })),
      field('我的收获与困难', textArea(form.reflection, value => setForm(current => ({ ...current, reflection: value })), { rows: 3, maxLength: 4000, disabled: locked })),
      field('理解程度自评 · ' + form.confidence + '/5', h('input', { type: 'range', min: 1, max: 5, value: form.confidence, disabled: locked, onChange: event => setForm(current => ({ ...current, confidence: Number(event.target.value) })) }), '这是你的自评，不是客观能力分数。'),
      !readOnly && !done && h('div', { className: 'mg-actions' }, button('获取 AI 成果反馈', () => onEvidence(form, 'model'), { className: 'mg-primary', disabled: busy || !(form.artifactText.trim() || form.reflection.trim()) }), button('仅保存成果与自评', () => onEvidence(form, 'record'), { className: 'mg-secondary', disabled: busy || !(form.artifactText.trim() || form.reflection.trim()) })),
      evidence.assessment && h('section', { className: 'mg-assessment' }, h('h3', null, 'MIMIR 的反馈'), h('p', null, evidence.assessment.summary), ...evidence.assessment.checks.map((check, index) => h('div', { key: index }, badge(check.status === 'supported' ? '有成果支持' : '需要补充'), h('strong', null, check.criterion), h('p', null, check.feedback))), h('p', null, evidence.assessment.nextStep)),
      evidence.status && h('div', { className: 'mg-completion' }, badge(done ? '已确认完成' : '已保存 · 请对照完成标准'), !readOnly && button(done ? '撤回完成标记' : '我确认完成这项目标', () => onComplete(!done, () => { if (!done) changeStep(3); }), { className: 'mg-primary', disabled: busy || Boolean(recovery) })),
      !done && h('div', { className: 'mg-course-scope' }, h('p', null, '小步成果可以保存；继续下一小步时，可重新选择这次的时间。'), button('继续剩余实践 →', () => changeStep(0), { className: 'mg-secondary', disabled: busy })),
      h('div', { className: 'mg-studio-controls' }, button('← 返回实践', () => changeStep(1), { className: 'mg-text-button', disabled: busy }), button('选择下一步 →', () => changeStep(3), { className: 'mg-secondary', disabled: busy }))) :
    h('section', { className: 'mg-learning-checkpoint' }, h('h2', null, '对于你的目的，现在到哪里就够了？'), h('p', null, done ? '成果已经保留。接下来由你决定投入的深度。' : '可以先表达偏好；这个选择不会把目标标记为完成。'),
      h('div', { className: 'mg-option-grid' }, ...LEARNING_CHOICES.map(([id, title, subtitle]) => h(Choice, { key: id, title, subtitle, selected: choice === id, onClick: () => { setChoice(id); setAnswer(''); if (id === 'help' && !focus) setFocus('concept'); }, disabled: busy || readOnly || Boolean(recovery) }))),
      choice && h('div', null, choice === 'help' && h('div', { className: 'mg-obstacle-options' }, ...JOURNEY_OBSTACLES.map(([id, title]) => button(title, () => setFocus(id), { key: id, className: focus === id ? 'is-selected' : '', 'aria-pressed': focus === id, disabled: busy || readOnly || Boolean(recovery) }))),
        field(purposeQuestion, textArea(answer, setAnswer, { rows: 3, maxLength: 1200, disabled: busy || readOnly || Boolean(recovery), placeholder: choice === 'enough' ? '例如：能解释课程作业中的公式，这次先到这里。' : choice === 'deepen' ? '例如：想把公式用于自己的机械臂运动，并检查误差。' : '说清你卡住的步骤或时间限制。' })),
        button('保存目的选择', () => save(3, workIndex, true), { className: 'mg-primary', disabled: busy || readOnly || Boolean(recovery) || !answer.trim() })),
      session?.checkpoint && h('div', { className: 'mg-checkpoint-saved' }, badge('已记录 · ' + LEARNING_CHOICES.find(([id]) => id === session.checkpoint.choice)?.[1]), h('p', null, session.checkpoint.answer), h('p', null, session.checkpoint.choice === 'enough' ? '回望时保留当前成果，重新分配后续投入。' : session.checkpoint.choice === 'deepen' ? '回望时明确下一项应用或验证目标，再预览新方案。' : '卡点已进入任务记录，可以带着具体问题继续练习或向 MIMIR 求助。'),
        h('div', { className: 'mg-actions' }, !readOnly && button('带着这个问题与 MIMIR 交流', () => onCoach('目标「' + task.title + '」：' + session.checkpoint.answer + '。请帮助我澄清目的和下一步。'), { className: 'mg-secondary', disabled: busy }), !readOnly && button('把选择带入阶段回望 →', onReview, { className: 'mg-secondary', disabled: busy }))),
      isCourse && !readOnly && session?.checkpoint && button('预览课程下一步候选 →', onCourseNext, { className: 'mg-primary', disabled: busy || dirty || Boolean(recovery) || (!done && session.checkpoint.choice !== 'help') }),
      !readOnly && done && button('查看可开始的下一个目标 →', onNext, { className: 'mg-primary', disabled: busy }), readOnly && h('p', { className: 'mg-muted' }, '历史学习记录仅供回看。'))));
}

function CoachPrompts({ disabled, onChoose }) {
  return h('div', { className: 'mg-coach-prompts' }, h('h2', null, '先选这次想解决的事'), h('div', { className: 'mg-option-grid' }, ...[
    ['概念没理解', '我卡在概念理解上。请先问我卡住的具体步骤，再给一个小练习。'], ['时间不够', '当前计划的时间不够。请帮我判断哪些任务最接近当前目的，哪些可以推迟。'], ['想换方向', '我想调整成长方向。请先追问原因、预期成果和愿意投入的时间。'], ['已经够用了', '我觉得当前深度已经够用。请帮我判断已有成果是否能支撑原来的目的。'],
  ].map(([title, message]) => h(Choice, { key: title, title, subtitle: '选择后可在下方补充具体情况', selected: false, onClick: () => onChoose(message), disabled }))));
}
function ReviewDialogue({ plan, sessions, disabled, onSave, onConfigure, onDepth }) {
  memory.reviewDialogues ||= {};
  const cached = memory.reviewDialogues[plan.id] || {};
  const [page, setPage] = useState(cached.page || 0), [purpose, setPurpose] = useState(cached.purpose || ''), [effort, setEffort] = useState(cached.effort || ''), [note, setNote] = useState(cached.note || '');
  useEffect(() => { memory.reviewDialogues[plan.id] = { page, purpose, effort, note }; }, [page, purpose, effort, note, plan.id]);
  const checkpoints = plan.tasks.filter(task => sessions[task.id]?.checkpoint);
  const deepenAreas = [...new Set(checkpoints.filter(task => sessions[task.id].checkpoint.choice === 'deepen').map(task => task.area))];
  return h('section', { className: 'mg-review-dialogue' }, h('small', null, '阶段对话 ' + (page + 1) + ' / 3'),
    page === 0 ? h('div', null, h('h2', null, '最初的目的，现在还成立吗？'), h('p', null, plan.profile.purpose || plan.profile.goal), h('div', { className: 'mg-option-grid' }, ...['仍然成立', '目的没变，想调整方法', '已经有新的目标'].map(title => h(Choice, { key: title, title, selected: purpose === title, onClick: () => setPurpose(title), disabled }))), button('确认，继续 →', () => setPage(1), { className: 'mg-primary', disabled: disabled || !purpose })) :
    page === 1 ? h('div', null, h('h2', null, '这个阶段的投入是否合适？'), h('div', { className: 'mg-option-grid' }, ...['刚好能推进', '时间或难度超出预期', '还有余力继续深入'].map(title => h(Choice, { key: title, title, selected: effort === title, onClick: () => setEffort(title), disabled }))), h('div', { className: 'mg-actions' }, button('← 回退', () => setPage(0), { className: 'mg-secondary' }), button('确认，查看选择 →', () => setPage(2), { className: 'mg-primary', disabled: disabled || !effort }))) :
    h('div', null, h('h2', null, '把学习中的选择带到下一阶段'), checkpoints.length ? h('div', { className: 'mg-checkpoint-summary' }, ...checkpoints.map(task => h('article', { key: task.id }, h('strong', null, task.title), badge(LEARNING_CHOICES.find(([id]) => id === sessions[task.id].checkpoint.choice)?.[1]), h('p', null, sessions[task.id].checkpoint.answer)))) : h('p', null, '还没有目的选择。也可以直接结合成果和时间进行回顾。'),
      field('补充你想改变的一件事（可选）', textArea(note, setNote, { rows: 3, maxLength: 1200, disabled, placeholder: '例如：减少论文精读时间，增加课程练习。' })),
      h('div', { className: 'mg-actions' }, button('← 回退', () => setPage(1), { className: 'mg-secondary', disabled }), button('保存回顾，选择下一步 →', () => onSave(`目的：${purpose}。投入：${effort}。${note ? '希望改变：' + note : ''}`), { className: 'mg-primary', disabled })),
      deepenAreas.length > 0 && h('div', { className: 'mg-course-next' }, h('p', null, '你希望继续深入学习：' + deepenAreas.map(area => areaNames[area]).join('、') + '。可以先预览更深入的配置，再决定是否重设任务。'), button('预览我想深耕的方向 →', () => onDepth(deepenAreas), { className: 'mg-secondary', disabled })),
      h('details', null, h('summary', null, '试演一个时间变化'), h('p', null, '只修改待设计配置，原方案继续有效。'), ...[3, 6, 10].map(hours => button('每周 ' + hours + ' 小时', () => onConfigure(hours), { key: hours, className: 'mg-secondary', disabled })))));
}
