function CurriculumExplorer({ curriculum, courses, busy, onViewCourse, onCourse, onRun, customItems, customSelections, onManage, onAdd, onCustomGoal }) {
  const [selected, setSelected] = useState(memory.coreCourse || curriculum.recommendedIds[0]);
  const [keyword, setKeyword] = useState(''), [results, setResults] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const request = useRef(null);
  const core = curriculum.cores.find(item => item.id === selected) || curriculum.cores[0], locked = busy || loading;
  useEffect(() => { memory.coreCourse = core.id; setKeyword(core.search); setResults(null); setError(''); }, [core.id]);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setLoading(true); setError(''); setResults(null);
    try { const value = await api('materials?core=' + encodeURIComponent(core.id) + '&keyword=' + encodeURIComponent(keyword) + '&count=5', null, controller.signal); if (!controller.signal.aborted) setResults(value); }
    catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }
  return h('section', { className: 'mg-curriculum', 'aria-label': '核心课程与学习推荐' },
    h('p', { className: 'mg-curriculum-note' }, curriculum.note),
    h(LearningSection, { id: 'core-recommendations', level: 3, title: '推荐与补充', description: '从适合当前基础的核心课开始，也可以补充自己的课程。', initialOpen: true },
    h('div', { className: 'mg-core-recommendations' }, ...curriculum.recommendedIds.map(id => { const item = curriculum.cores.find(core => core.id === id); return button(h('span', null, h('small', null, '推荐先看 · ' + item.stage), h('strong', null, item.title), h('p', null, item.reason)), () => setSelected(id), { key: id, disabled: locked, 'aria-pressed': selected === id, className: selected === id ? 'is-selected' : '', 'data-core-recommendation': id }); })),
    h('h3', null, '8 门核心课 · 建议先修路线'),
    h(MoreChoices, { customItems, customSelections, onManage, onAdd, onUse: onCustomGoal, label: '核心课', items: curriculum.cores, limit: 8, className: 'mg-core-route', disabled: locked, searchText: item => [item.title, item.stage, item.search, item.outcome, ...item.courseIds.map(id => courses.find(course => course.id === id)?.title || '')].join(' '), renderItem: item => button(h('span', null, h('small', null, item.stage), h('strong', null, item.title), h('small', null, ({ new: '尚未开始', learning: '正在学习', familiar: '自报已有基础', recorded: '已有学习成果' })[item.status])), () => setSelected(item.id), { key: item.id, disabled: locked, 'aria-pressed': core.id === item.id, className: core.id === item.id ? 'is-selected' : '', 'data-core-id': item.id }) }),
    ),
    h(LearningSection, { key: core.id, id: 'core-detail-' + core.id, level: 3, title: core.title, description: '学习目标、先修建议与配套资源', initialOpen: true },
    h('article', { className: 'mg-core-detail', 'data-core-detail': core.id }, h('p', null, '可以检查的知识点：' + core.outcome),
      h('p', { className: 'mg-muted' }, core.prerequisites.length ? '建议先修：' + core.prerequisites.map(id => curriculum.cores.find(item => item.id === id).title).join('、') : '可以从基础开始，不需要先完成其他核心课。'),
      h('p', { className: 'mg-core-reason', role: 'status' }, core.reason),
      h('div', { className: 'mg-actions' }, ...[['new', '尚未开始'], ['learning', '我要学习'], ['familiar', '我已有基础']].map(([status, label]) => button(label, () => onRun('content-concept', { conceptId: 'core:' + core.id, status }, '正在保存核心课基础'), { key: status, disabled: locked, 'aria-pressed': core.status === status, className: core.status === status ? 'is-selected' : '' }))),
      h(LearningSection, { id: 'core-resources-' + core.id, level: 4, title: '推荐公开课与课程资料', description: '查看配套课程、讲义与官方来源。' }, h('div', { className: 'mg-core-course-links' }, ...core.courseIds.map(id => { const course = courses.find(item => item.id === id); return h('div', { key: id }, button(h('span', null, h('strong', null, course.title), h('small', null, course.provider + ' · ' + course.language), h('p', null, course.start)), () => onViewCourse(id), { className: 'mg-library-course-link', disabled: locked }), h('a', { href: course.url, target: '_blank', rel: 'noopener noreferrer' }, '课程资料、讲义与原站习题 ↗')); }))),
      h(LearningSection, { id: 'core-practice-' + core.id, level: 4, className: 'mg-core-practice', title: '推荐习题 · ' + core.practiceTitle, description: 'MIMIR 原创配套练习，保存你的解释和反馈。' },
        h('ol', null, ...core.practice.questions.map((question, index) => h('li', { key: index }, h('strong', null, question.question), h('ul', null, ...question.options.map((option, choice) => h('li', { key: choice }, String.fromCharCode(65 + choice) + '. ' + option)))))),
        button('进入推荐练习 →', () => onCourse(core.recommendedCourseId, core.recommendedVariant), { className: 'mg-primary', disabled: locked })),
      h(LearningSection, { id: 'core-materials-' + core.id, level: 4, className: 'mg-core-materials', title: '扩展资料检索', description: '围绕具体问题检索 arXiv，结果包含预印本。' },
        h('form', { className: 'mg-materials-form', onSubmit: event => { event.preventDefault(); void search(); } }, field('想查的问题或关键词', textInput(keyword, value => { setKeyword(value); setResults(null); setError(''); }, { maxLength: 120, disabled: locked, 'data-materials-keyword': true })), h('button', { type: 'submit', className: 'mg-secondary', disabled: locked || !keyword.trim() }, loading ? '正在查找资料…' : '检索本课资料'), loading && button('取消检索', () => request.current?.abort(), { className: 'mg-text-button' })),
        h('a', { href: 'https://arxiv.org/search/?searchtype=all&query=' + encodeURIComponent(keyword), target: '_blank', rel: 'noopener noreferrer' }, '打开官方检索页 ↗'),
        error && h('p', { className: 'mg-inline-error', role: 'alert' }, error),
        results && h('div', { className: 'mg-materials-results', role: 'status' }, h('small', null, results.source + ' · 获取 ' + new Date(results.fetchedAt).toLocaleString('zh-CN') + (results.cached ? ' · 一小时内缓存' : ' · 本次联网') + ' · ' + results.ranking),
          !results.items.length && h('p', null, '这组关键词没有返回资料，可减少关键词或打开官方检索。'),
          ...results.items.map(item => h('article', { key: item.id }, h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.title + ' ↗'), h('small', null, '首次提交 ' + item.published.slice(0, 10) + ' · ' + item.publication), h('p', null, item.abstract))))))));
}
