const CONFIG_STEPS = ['关于你', '目的与目标', '成长侧重', '目标深度', '时间与基础', '确认配置'];
const GOAL_CHOICES = [
  { title: '做成一个项目', subtitle: '机器人与智能产线', value: '围绕机器人与智能产线，建立课程基础，完成一个机械臂分拣单元方案。', mark: '01' },
  { title: '迈出科研第一步', subtitle: '读懂问题、方法与证据', value: '读懂一篇机器人论文，明确研究问题、方法与局限，找到可以继续探索的小问题。', mark: '02' },
  { title: '把课程学扎实', subtitle: '理解公式，迁移到场景', value: '掌握机器人运动学基础，能解释公式、完成练习，并迁移到自己的专业场景。', mark: '03' },
  { title: '探索适合的方向', subtitle: '感知、控制、设计与实践', value: '通过机器人小任务比较感知、控制与机械设计，判断自己想继续深入的方向。', mark: '04' },
];
const PURPOSE_CHOICES = [
  ['找到喜欢的方向', '希望通过小项目判断自己更喜欢控制、机械设计还是感知方向。'],
  ['留下一个作品', '希望把学习变成一份能说明我的思考与实践能力的作品。'],
  ['为后续科研打基础', '希望建立阅读、求证和提出问题的基础，为后续研究做好准备。'],
  ['解决眼前的课程困难', '希望先解决课程理解上的困难，能独立解题和解释原理。'],
];
const WEIGHT_BUILDS = [
  { title: '均衡成长', weights: { research: 25, competition: 25, gpa: 25, interest: 25 } },
  { title: '项目实践', weights: { research: 20, competition: 45, gpa: 25, interest: 10 } },
  { title: '科研起步', weights: { research: 45, competition: 15, gpa: 25, interest: 15 } },
  { title: '课程优先', weights: { research: 15, competition: 15, gpa: 55, interest: 15 } },
];
const DEPTH_DESCRIPTIONS = { intro: '说清概念与核心问题', apply: '在自己的案例中运用', deep: '比较方案并设计验证' };

function Choice({ title, subtitle, selected, onClick, disabled, mark }) {
  return button(h('span', null, mark && h('small', { className: 'mg-choice-mark' }, mark), h('strong', null, title), subtitle && h('small', null, subtitle), h('i', { 'aria-hidden': true }, selected ? '✓' : '↗')), onClick,
    { className: 'mg-choice' + (selected ? ' is-selected' : ''), 'aria-pressed': selected, disabled });
}
function Configuration({ profile, onChange, step, setStep, areas, busy, onExit, onGenerate, onSave, intent, customItems, customSelections, onManage, onAdd }) {
  const [mode, setMode] = useState(memory.generationMode || 'model'), [problem, setProblem] = useState('');
  useEffect(() => { memory.generationMode = mode; }, [mode]);
  const direction = useRef('forward');
  const goals = profile.goals || [profile.goal];
  function changeGoals(next) { onChange({ goals: next, goal: next.join('\n') }); }
  function addGoal(value) { if (goals.includes(value)) return; if (goals.length >= 12) { setProblem('最多添加12个目标。'); return; } changeGoals([...goals.filter(item => item.trim()), value]); setProblem(''); }
  function toggleGoal(value) { if (goals.includes(value)) changeGoals(goals.filter(item => item !== value)); else addGoal(value); }
  function move(next) {
    let error = '';
    if (next > step) {
      if (step === 0 && (!profile.major.trim() || !profile.year.trim())) error = '请选择专业和年级，或补充自己的信息。';
      if (step === 1 && (!goals.length || goals.some(value => !value.trim()) || !profile.purpose.trim())) error = '请填写每一个目标和学习目的，或移除空白目标。';
      if (step === 4 && (!Number.isFinite(profile.weeklyHours) || profile.weeklyHours < 1 || profile.weeklyHours > 40 || !Number.isInteger(profile.horizonWeeks) || profile.horizonWeeks < 2 || profile.horizonWeeks > 24)) error = '每周投入需为1至40小时，路径需为2至24个整周。';
    }
    setProblem(error); if (error) return;
    direction.current = next < step ? 'back' : 'forward'; setStep(next);
  }
  const optional = (title, content) => h('details', { className: 'mg-custom-option' }, h('summary', null, title, h('span', null, '+')), content);
  const choices = (rows, value, change) => typeof rows[0][1] === 'number' ? h('div', { className: 'mg-option-grid' }, ...rows.map(([title, option, subtitle]) => h(Choice, { key: title, title, subtitle, selected: value === option, onClick: () => change(option), disabled: busy }))) : h(MoreChoices, { customItems, customSelections, onManage, onAdd, onUse: item => onChange({ major: item.title }), label: '专业方向', items: rows, limit: rows.length, disabled: busy, className: 'mg-option-grid', searchText: row => row.join(' '), renderItem: ([title, option, subtitle]) => h(Choice, { key: title, title, subtitle, selected: value === option, onClick: () => change(option), disabled: busy }) });
  const customProps = { disabled: busy };
  let content;
  if (step === 0) content = h('div', null,
    h('p', { className: 'mg-step-prompt' }, '你正在学习哪个专业方向？'),
    choices([['智能制造', '智能制造', '首个完整示范场景'], ['机械设计', '机械设计', '从结构到系统'], ['自动化', '自动化', '从控制到协作'], ['机器人', '机器人', '从感知到行动']], profile.major, major => onChange({ major })),
    h('p', { className: 'mg-step-prompt' }, '你现在处于哪个阶段？'),
    h('div', { className: 'mg-choice-chips' }, ...['大一', '大二', '大三', '大四', '专科阶段'].map(year => button(year, () => onChange({ year }), { key: year, className: profile.year === year ? 'is-selected' : '', 'aria-pressed': profile.year === year, disabled: busy }))),
    optional('补充自己的信息', h('div', { className: 'mg-form-pair' }, field('称呼（可选）', textInput(profile.name, name => onChange({ name }), { ...customProps, maxLength: 60 })), field('其他专业', textInput(profile.major, major => onChange({ major }), { ...customProps, maxLength: 80 })), field('其他年级', textInput(profile.year, year => onChange({ year }), { ...customProps, maxLength: 40 })) )));
  if (step === 1) content = h('div', null,
    h('p', { className: 'mg-step-prompt' }, '这段时间，你最想完成什么？'),
    h(MoreChoices, { customItems, customSelections, onManage, onAdd, onUse: item => addGoal((item.title + (item.detail ? '：' + item.detail : '')).slice(0, 1200)), label: '学习目标', items: GOAL_CHOICES, limit: GOAL_CHOICES.length, disabled: busy, className: 'mg-option-grid', searchText: choice => choice.title + ' ' + choice.subtitle + ' ' + choice.value, renderItem: choice => h(Choice, { key: choice.mark, ...choice, selected: goals.includes(choice.value), onClick: () => toggleGoal(choice.value), disabled: busy }) }),
    h('p', { className: 'mg-step-prompt' }, '这件事为什么对你重要？'),
    h(MoreChoices, { customItems, customSelections, onManage, onAdd, onUse: item => onChange({ purpose: (item.title + (item.detail ? '：' + item.detail : '')).slice(0, 1200) }), label: '学习目的', items: PURPOSE_CHOICES, limit: PURPOSE_CHOICES.length, disabled: busy, className: 'mg-choice-chips', searchText: row => row.join(' '), renderItem: ([title, value]) => button(title, () => onChange({ purpose: value }), { key: title, className: profile.purpose === value ? 'is-selected' : '', 'aria-pressed': profile.purpose === value, disabled: busy }) }),
    optional('用自己的话描述目标与目的', h('div', { className: 'mg-custom-fields' }, h('div', { className: 'mg-goal-list' }, ...goals.map((goal, index) => h('div', { key: index, className: 'mg-goal-row' }, field('我的目标 ' + (index + 1), textArea(goal, value => changeGoals(goals.map((item, i) => i === index ? value : item)), { ...customProps, rows: 2, maxLength: 1200, 'data-personal-goal': index })), button('移除目标 ' + (index + 1), () => changeGoals(goals.filter((_, i) => i !== index)), { className: 'mg-text-button', disabled: busy || goals.length <= 1 }))), button('＋ 添加一个目标', () => { if (goals.length < 12) changeGoals([...goals, '']); }, { className: 'mg-secondary', disabled: busy || goals.length >= 12 }), h('small', null, '可添加多个目标；每项最多1200字，最多12项。')), field('我的目的', textArea(profile.purpose, purpose => onChange({ purpose }), { ...customProps, rows: 2, maxLength: 1200 })) )));
  if (step === 2) content = h('div', null,
    h('p', { className: 'mg-step-prompt' }, '从一个构建风格出发，再调成自己的配比。'),
    h('div', { className: 'mg-choice-chips mg-build-presets' }, ...WEIGHT_BUILDS.map(build => button(build.title, () => onChange({ weights: { ...build.weights } }), { key: build.title, disabled: busy, className: JSON.stringify(build.weights) === JSON.stringify(profile.weights) ? 'is-selected' : '' }))),
    h('section', { className: 'mg-build-board mg-build-only' }, h('div', { className: 'mg-section-heading' }, h('h2', null, '你的成长构建'), badge('总计 100%')),
      h('div', { className: 'mg-spectrum', 'aria-hidden': true }, ...areas.map(area => h('span', { key: area.id, style: { width: profile.weights[area.id] + '%', background: area.color } }))),
      ...areas.map(area => h('div', { key: area.id, className: 'mg-axis', style: { '--area-color': area.color } }, h('div', { className: 'mg-axis-label' }, h('span', { className: 'mg-area-dot' }), h('strong', null, area.name), h('small', null, area.verb), h('span', { className: 'mg-axis-value' }, profile.weights[area.id], h('small', null, '%'))),
        h('input', { type: 'range', min: 0, max: 100, step: 1, value: profile.weights[area.id], disabled: busy, 'aria-label': area.name + '成长侧重', style: { '--range-value': profile.weights[area.id] + '%' }, onChange: event => onChange({ weights: redistribute(profile.weights, area.id, Number(event.target.value)) }) })))),
    h('p', { className: 'mg-step-help' }, '侧重表达学习优先级；能力与成绩需要通过学习成果判断。'));
  if (step === 3) content = h('div', null,
    h('p', { className: 'mg-step-prompt' }, '每个方向，学到怎样的程度才够用？'),
    h('div', { className: 'mg-depth-grid' }, ...areas.map(area => h('section', { key: area.id, className: 'mg-depth-card', style: { '--area-color': area.color } }, h('div', { className: 'mg-section-heading' }, h('h2', null, area.name), badge(profile.weights[area.id] + '%')),
      h('div', { className: 'mg-depth-options' }, ...Object.entries(DEPTH_DESCRIPTIONS).map(([id, description]) => button(h('span', null, h('strong', null, depthNames[id]), h('small', null, description)), () => onChange({ depths: { ...profile.depths, [area.id]: id } }), { key: id, className: profile.depths[area.id] === id ? 'is-selected' : '', 'aria-pressed': profile.depths[area.id] === id, disabled: busy }))),
      profile.weights[area.id] === 0 && h('small', null, '此方向当前不安排任务，深度偏好为你保留。')))));
  if (step === 4) content = h('div', null,
    h('p', { className: 'mg-step-prompt' }, '每周，你愿意留多少时间给成长？'),
    choices([['轻量起步', 3, '每周 3 小时'], ['稳定投入', 8, '每周 8 小时'], ['集中实践', 12, '每周 12 小时']], profile.weeklyHours, weeklyHours => onChange({ weeklyHours })),
    h('p', { className: 'mg-step-prompt' }, '先看多远？'),
    h('div', { className: 'mg-choice-chips' }, ...[4, 8, 12].map(weeks => button(weeks + ' 周概览', () => onChange({ horizonWeeks: weeks }), { key: weeks, disabled: busy, className: profile.horizonWeeks === weeks ? 'is-selected' : '', 'aria-pressed': profile.horizonWeeks === weeks }))),
    h('p', { className: 'mg-step-prompt' }, '你现在的基础更接近哪一种？'),
    h('div', { className: 'mg-choice-chips' }, ...[['刚开始接触', '刚开始接触机器人与智能制造，需要从基础概念建立理解。'], ['学过基础课程', '接触过专业基础课程，希望将知识用于机器人项目。'], ['已有项目经验', '已有机器人或产线项目经验，希望进一步比较方案和设计验证。']].map(([title, baseline]) => button(title, () => onChange({ baseline }), { key: title, disabled: busy, className: profile.baseline === baseline ? 'is-selected' : '', 'aria-pressed': profile.baseline === baseline }))),
    optional('自定义时间、基础与约束', h('div', { className: 'mg-custom-fields' }, h('div', { className: 'mg-form-pair' }, field('每周小时数', textInput(profile.weeklyHours, value => onChange({ weeklyHours: Number(value) }), { ...customProps, type: 'number', min: 1, max: 40 })), field('路径周数', textInput(profile.horizonWeeks, value => onChange({ horizonWeeks: Number(value) }), { ...customProps, type: 'number', min: 2, max: 24, step: 1 }))), field('当前基础', textArea(profile.baseline, baseline => onChange({ baseline }), { ...customProps, rows: 2, maxLength: 2000 })), field('时间约束或截止日期', textArea(profile.constraints, constraints => onChange({ constraints }), { ...customProps, rows: 2, maxLength: 1200 })) )));
  if (step === 5) content = h('div', null,
    h('div', { className: 'mg-build-summary' }, h('section', null, h('small', null, '我的方向'), h('strong', null, profile.major + ' · ' + profile.year), h('ul', { className: 'mg-goal-summary' }, ...goals.map((goal, index) => h('li', { key: index }, goal)))), h('section', null, h('small', null, '为什么出发'), h('p', null, profile.purpose)), h('section', null, h('small', null, '成长构建'), ...areas.map(area => h('div', { key: area.id, className: 'mg-summary-axis' }, h('span', null, area.name), h('strong', null, profile.weights[area.id] + '%'), h('small', null, depthNames[profile.depths[area.id]])))), h('section', null, h('small', null, '时间与基础'), h('strong', null, `每周 ${profile.weeklyHours} 小时 · ${profile.horizonWeeks} 周概览`), h('p', null, profile.baseline), profile.constraints && h('p', null, profile.constraints))),
    h('p', { className: 'mg-step-prompt' }, '选择本次生成方式'),
    h('div', { className: 'mg-option-grid' }, h(Choice, { title: 'MIMIR 为我设计', subtitle: '使用已连接的模型，结合目标与反馈生成', selected: mode === 'model', onClick: () => setMode('model'), disabled: busy }), h(Choice, { title: '先体验本地示例', subtitle: '规则示例，无需模型连接', selected: mode === 'template', onClick: () => setMode('template'), disabled: busy })),
    h('p', { className: 'mg-step-help' }, '下一页先预览方案与每项目标。确认方案后，才开始当前阶段。'));
  return h('section', { className: 'mg-wizard', 'aria-label': '成长方案分步配置' },
    h('header', { className: 'mg-wizard-heading' }, button('← 智慧之泉', onExit, { className: 'mg-text-button', disabled: busy }), h('div', null, h('small', null, 'YOUR GROWTH BUILD'), h('span', null, intent === 'review' ? '为下一步重新选择' : '构建属于你的成长路径')), h('small', null, String(step + 1).padStart(2, '0') + ' / 06')),
    h('ol', { className: 'mg-step-track', 'aria-label': '配置进度' }, ...CONFIG_STEPS.map((title, index) => h('li', { key: title, className: index === step ? 'is-current' : index < step ? 'is-done' : '' }, button(h('span', null, h('i', null, index < step ? '✓' : String(index + 1).padStart(2, '0')), title), () => move(index), { disabled: busy || index > step, 'aria-current': index === step ? 'step' : undefined })))),
    h('div', { className: 'mg-step-body' }, h('div', { key: step, className: 'mg-step-content ' + direction.current }, h('div', { className: 'mg-step-title' }, h('span', { className: 'mg-eyebrow' }, 'STEP ' + String(step + 1).padStart(2, '0')), h('h1', { tabIndex: -1 }, CONFIG_STEPS[step])), content)),
    h('footer', { className: 'mg-step-controls' }, h('div', null, step > 0 ? button('← 上一步', () => move(step - 1), { disabled: busy, className: 'mg-secondary' }) : button('退出配置', onExit, { disabled: busy, className: 'mg-text-button' }), problem && h('span', { role: 'alert' }, problem)), step === 5 ? h('div', { className: 'mg-actions' }, button('保存配置', onSave, { disabled: busy, className: 'mg-text-button' }), button('确认配置并生成方案 →', () => onGenerate(mode), { disabled: busy, className: 'mg-primary' })) : button('确认并继续 →', () => move(step + 1), { disabled: busy, className: 'mg-primary' })));
}
