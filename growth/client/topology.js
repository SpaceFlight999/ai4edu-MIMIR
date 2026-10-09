const TOPOLOGY_STATUS = { pending: '待提交', submitted: '有成果记录', completed: '关联目标完成' };
const TOPOLOGY_MARK = { pending: '○', submitted: '◐', completed: '✓' };

function KnowledgeTopology({ graph, areas = [], selectedNodeId, onSelectNode, onPreviewTask, onOpenTask, readOnly, busy }) {
  const [direction, setDirection] = useState('all'), [zoom, setZoom] = useState(null), [viewportWidth, setViewportWidth] = useState(900);
  const viewport = useRef(null);
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const links = (Array.isArray(graph?.links) ? graph.links : []).filter(link => nodes.some(node => node.id === link.from) && nodes.some(node => node.id === link.to));
  const knownAreas = ['research', 'competition', 'gpa', 'interest'];
  const areaList = [...knownAreas, ...new Set(nodes.map(node => node.area).filter(id => !knownAreas.includes(id)))].filter(id => nodes.some(node => node.area === id));
  const areaInfo = id => areas.find(area => area.id === id) || { id, name: areaNames[id] || id, color: '#8899b7' };
  const maxColumns = Math.max(3, ...areaList.map(id => nodes.filter(node => node.area === id).length));
  const canvasWidth = 1040 + (maxColumns - 3) * 244, canvasHeight = Math.max(250, areaList.length * 90 + 38);
  const scale = zoom === null ? Math.min(1, Math.max(.72, (viewportWidth - 8) / canvasWidth)) : zoom;
  const positions = new Map();
  areaList.forEach((area, branch) => nodes.filter(node => node.area === area).forEach((node, index) => positions.set(node.id, { x: 296 + index * 244, y: 50 + branch * 90, width: 224 })));
  const shownNodes = nodes.filter(node => direction === 'all' || node.area === direction);
  const selected = nodes.find(node => node.id === selectedNodeId);
  const neighbors = selected ? links.filter(link => link.from === selected.id || link.to === selected.id).map(link => ({ link, node: nodes.find(node => node.id === (link.from === selected.id ? link.to : link.from)) })) : [];
  const relatedIds = new Set(neighbors.map(item => item.node.id));
  const tasks = (Array.isArray(graph?.tasks) ? graph.tasks : []).filter(task => selected?.taskIds?.includes(task.id));

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth || 900);
    measure();
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect(); }
    window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure);
  }, [nodes.length]);
  useEffect(() => { if (direction !== 'all' && !areaList.includes(direction)) setDirection('all'); }, [areaList.join('|'), direction]);

  function selectNode(id) {
    const node = nodes.find(item => item.id === id);
    if (node && direction !== 'all' && node.area !== direction) setDirection('all');
    onSelectNode?.(id);
    const position = positions.get(id), element = viewport.current;
    if (position && element) {
      const left = position.x * scale, right = (position.x + position.width) * scale;
      if (left < element.scrollLeft + 10) element.scrollTo({ left: Math.max(0, left - 10) });
      else if (right > element.scrollLeft + element.clientWidth - 10) element.scrollTo({ left: right - element.clientWidth + 10 });
    }
  }
  function focusNeighbor(event, node) {
    if (event.key === 'Escape') { onSelectNode?.(null); return; }
    const axis = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!axis) return;
    event.preventDefault();
    const origin = positions.get(node.id);
    const next = shownNodes.filter(item => item.id !== node.id).map(item => {
      const position = positions.get(item.id), dx = position.x - origin.x, dy = position.y - origin.y;
      return { item, along: dx * axis[0] + dy * axis[1], distance: Math.hypot(dx, dy) + Math.abs(dx * axis[1] - dy * axis[0]) * .5 };
    }).filter(item => item.along > 0).sort((left, right) => left.distance - right.distance)[0];
    if (next) { viewport.current?.querySelector('[data-node-id="' + CSS.escape(next.item.id) + '"]')?.focus(); selectNode(next.item.id); }
  }
  function edgePath(link) {
    const from = positions.get(link.from), to = positions.get(link.to), dy = to.y - from.y;
    if (Math.abs(dy) < 20) {
      const right = to.x > from.x, x1 = from.x + (right ? from.width : 0), x2 = to.x + (right ? 0 : to.width), bend = (x2 - x1) * .5;
      return `M${x1} ${from.y} C${x1 + bend} ${from.y - 20} ${x2 - bend} ${to.y - 20} ${x2} ${to.y}`;
    }
    const x1 = from.x + from.width * .5, x2 = to.x + to.width * .5, y1 = from.y + (dy > 0 ? 38 : -38), y2 = to.y + (dy > 0 ? -38 : 38), bend = (y2 - y1) * .5;
    return `M${x1} ${y1} C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
  }
  function selectedDetails() {
    if (!selected) return null;
    return h('div', { className: 'mg-map-inspector', 'aria-live': 'polite' },
      h('div', { className: 'mg-map-node-explanation' },
        h('div', { className: 'mg-map-inspector-heading' }, h('h3', null, selected.label), badge(readOnly ? '历史阶段' : areaInfo(selected.area).name)),
        h('p', null, selected.description),
        neighbors.length > 0 && h('div', { className: 'mg-map-neighbors', 'aria-label': '与所选知识节点相关的节点' }, h('small', null, '知识联系'), ...neighbors.map(({ node, link }, index) => button(node.label, () => selectNode(node.id), { key: node.id + '-' + index, title: link.label ? node.label + '：' + link.label : node.label, 'aria-label': '查看相关知识：' + node.label + (link.label ? '，关系为' + link.label : '') })))),
      h('div', { className: 'mg-map-task-links' }, h('small', null, '连接到阶段目标'),
        ...(tasks.length ? tasks : (selected.taskIds || []).map((id, index) => ({ id, title: '相关目标 ' + (index + 1), status: graph.taskStatus?.[id] }))).map(task => h('div', { className: 'mg-map-task-link', key: task.id },
          h('span', null, h('strong', null, task.title), h('small', null, (task.week ? '第 ' + task.week + ' 周 · ' : '') + (TOPOLOGY_STATUS[task.status || graph.taskStatus?.[task.id]] || TOPOLOGY_STATUS.pending))),
          button('预览', () => onPreviewTask?.(task.id), { disabled: !!busy, 'aria-label': '预览目标：' + task.title }),
          button(readOnly ? '查看记录' : '进入', () => onOpenTask?.(task.id), { className: 'mg-map-task-open', disabled: !!busy, 'aria-label': (readOnly ? '查看记录：' : '进入学习目标：') + task.title })))),
      button('×', () => onSelectNode?.(null), { className: 'mg-map-inspector-close', 'aria-label': '收起知识节点详情' }));
  }

  if (!nodes.length) return h('section', { className: 'mg-knowledge-empty', 'aria-label': '阶段知识地图' },
    h('span', { 'aria-hidden': true }, '⑂'), h('h2', null, '这里将长出你的知识枝条'), h('p', null, '确认培养方案后，阶段任务会连接到可探索的知识节点。'));

  return h('section', { className: 'mg-knowledge', 'aria-label': '阶段知识地图' },
    h('div', { className: 'mg-knowledge-toolbar' },
      h('div', { className: 'mg-knowledge-heading' }, h('small', null, 'YGGDRASIL · KNOWLEDGE MAP'), h('h2', null, '把知识连成一棵树')),
      h('div', { className: 'mg-map-controls', 'aria-label': '知识地图视图控制' },
        button('−', () => setZoom(Math.max(.72, Math.round((scale - .1) * 100) / 100)), { 'aria-label': '缩小知识地图', disabled: scale <= .72 }),
        button(zoom === null ? '适应视图' : Math.round(scale * 100) + '%', () => { setZoom(null); viewport.current?.scrollTo({ left: 0, top: 0 }); }, { className: 'mg-map-fit', title: '适应视图并回到地图起点', 'aria-label': '适应知识地图视图' }),
        button('+', () => setZoom(Math.min(1.35, Math.round((scale + .1) * 100) / 100)), { 'aria-label': '放大知识地图', disabled: scale >= 1.35 }))),
    h('div', { className: 'mg-map-directions', 'aria-label': '聚焦一个成长方向' },
      button('全部枝条', () => setDirection('all'), { className: direction === 'all' ? 'is-selected' : '', 'aria-pressed': direction === 'all' }),
      ...areaList.map(id => button(areaInfo(id).name, () => { setDirection(id); if (selected && selected.area !== id) onSelectNode?.(null); }, { key: id, className: direction === id ? 'is-selected' : '', 'aria-pressed': direction === id, style: { '--map-color': areaInfo(id).color } })),
      h('span', { className: 'mg-map-explore-hint' }, '点一个节点，查看它通向哪些目标')),
    selectedDetails(),
    canvasWidth * scale > viewportWidth + 4 && h('div', { className: 'mg-map-pan-hint' }, h('span', { 'aria-hidden': true }, '↔'), '横向滑动查看其余节点'),
    h('div', { className: 'mg-map-viewport', ref: viewport, style: { height: Math.round(canvasHeight * scale) + 14 }, 'aria-label': '可交互知识地图，可横向滚动查看全部节点' },
      h('div', { className: 'mg-map-scaled-space', style: { width: canvasWidth * scale, height: canvasHeight * scale } },
        h('div', { className: 'mg-map-canvas', style: { width: canvasWidth, height: canvasHeight, transform: 'scale(' + scale + ')' } },
          h('svg', { className: 'mg-map-edges', width: canvasWidth, height: canvasHeight, viewBox: `0 0 ${canvasWidth} ${canvasHeight}`, fill: 'none', 'aria-hidden': true },
            ...areaList.map((id, index) => h('path', { key: 'branch-' + id, d: `M146 ${canvasHeight / 2} C166 ${canvasHeight / 2} 152 ${50 + index * 90} 174 ${50 + index * 90}`, className: 'mg-map-branch', style: { stroke: areaInfo(id).color, opacity: direction === 'all' || direction === id ? .35 : .07 } })),
            ...links.filter(link => direction === 'all' || (nodes.find(node => node.id === link.from).area === direction && nodes.find(node => node.id === link.to).area === direction)).map((link, index) => {
              const active = selected && (link.from === selected.id || link.to === selected.id);
              return h('path', { key: link.from + '-' + link.to + '-' + index, d: edgePath(link), className: 'mg-map-link' + (active ? ' is-highlighted' : '') + (selected && !active ? ' is-muted' : ''), style: active ? { stroke: areaInfo(selected.area).color } : undefined });
            })),
          h('div', { className: 'mg-map-root', style: { top: canvasHeight / 2 - 57 } }, h('span', { className: 'mg-map-root-symbol', 'aria-hidden': true }, '⑂'), h('small', null, '本阶段的目的'), h('strong', null, graph.goal || '让知识服务于你的目标')),
          ...areaList.map((id, index) => h('div', { key: id, className: 'mg-map-area-label' + (direction !== 'all' && direction !== id ? ' is-muted' : ''), style: { left: 174, top: 50 + index * 90 - 21, '--map-color': areaInfo(id).color } }, h('span', { 'aria-hidden': true }), h('strong', null, areaInfo(id).name), h('small', null, nodes.filter(node => node.area === id).length + ' 个节点'))),
          ...shownNodes.map(node => { const position = positions.get(node.id), status = TOPOLOGY_STATUS[node.status] || TOPOLOGY_STATUS.pending;
            return button(h('span', { className: 'mg-map-node-inner' }, h('strong', null, node.label), h('span', { className: 'mg-map-node-status' }, h('i', { 'aria-hidden': true }, TOPOLOGY_MARK[node.status] || '○'), status)), () => selectNode(node.id),
              { key: node.id, 'data-node-id': node.id, className: 'mg-map-node is-' + (node.status || 'pending') + (selected?.id === node.id ? ' is-selected' : '') + (relatedIds.has(node.id) ? ' is-related' : '') + (selected && selected.id !== node.id && !relatedIds.has(node.id) ? ' is-dimmed' : ''), style: { left: position.x, top: position.y - 38, width: position.width, '--map-color': areaInfo(node.area).color }, 'aria-label': node.label + '，' + status + '，点击查看关联目标', 'aria-pressed': selected?.id === node.id, onKeyDown: event => focusNeighbor(event, node) });
          })))),
    h('div', { className: 'mg-map-legend' },
      ...['pending', 'submitted', 'completed'].map(status => h('span', { key: status }, h('i', { className: 'is-' + status, 'aria-hidden': true }, TOPOLOGY_MARK[status]), TOPOLOGY_STATUS[status])),
      h('span', { className: 'mg-map-relation-key' }, h('i', { 'aria-hidden': true }), '曲线表示知识联系')),
    !selected && h('div', { className: 'mg-map-selection-hint' }, h('span', { 'aria-hidden': true }, '↗'), h('span', null, '从你想理解的概念出发', h('small', null, '点击节点，沿着知识联系探索，再进入对应的小目标。'))),
    h('p', { className: 'mg-map-footnote' }, '知识联系用于帮助理解，不代表任务先后约束；节点状态来自关联目标的成果记录，不代表已掌握知识。'));
}
