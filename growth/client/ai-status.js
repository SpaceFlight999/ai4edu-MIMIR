let nativeAiSequence = 0;
function observeNativeAiRequests(environment, report) {
  const original = environment.fetch, activeIds = new Set(); let alive = true;
  const wrapped = async function (...args) {
    const request = args[0], options = args[1]; let url;
    try { url = new URL(typeof request === 'string' || request instanceof URL ? request : request.url, environment.location.href); }
    catch { return original.apply(this, args); }
    const method = (options?.method || request?.method || 'GET').toUpperCase();
    if (url.origin !== environment.location.origin || method !== 'POST' || !['/api/mimir/ai/suggest', '/api/mimir/ai/assist'].includes(url.pathname)) return original.apply(this, args);
    const id = ++nativeAiSequence; if (alive) { activeIds.add(id); report({ type: 'start', id }); }
    try {
      const response = await original.apply(this, args);
      if (!response.ok && alive) report({ type: 'error', id, status: response.status });
      return response;
    } catch (error) { if (alive) report({ type: error.name === 'AbortError' ? 'cancelled' : 'error', id }); throw error; }
    finally { activeIds.delete(id); if (alive) report({ type: 'end', id }); }
  };
  environment.fetch = wrapped;
  return () => { for (const id of activeIds) report({ type: 'end', id }); activeIds.clear(); alive = false; if (environment.fetch === wrapped) environment.fetch = original; };
}
const nativeAiStatus = { pending: new Map(), errors: [], listeners: new Set() };
function reportNativeAi(event) {
  if (event.type === 'start') nativeAiStatus.pending.set(event.id, performance.now());
  if (event.type === 'end') nativeAiStatus.pending.delete(event.id);
  if (event.type === 'error') nativeAiStatus.errors = [...nativeAiStatus.errors.slice(-7), { id: event.id, text: 'AI 处理失败' + (event.status ? '（HTTP ' + event.status + '）' : '：连接中断') + '。请查看模块内的错误原因后重试。' }];
  for (const listener of nativeAiStatus.listeners) listener();
}
function NativeAiStatus() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1); nativeAiStatus.listeners.add(update);
    const timer = setInterval(() => { if (nativeAiStatus.pending.size) update(); }, 1000);
    return () => { nativeAiStatus.listeners.delete(update); clearInterval(timer); };
  }, []);
  const running = [...nativeAiStatus.pending.values()], errors = nativeAiStatus.errors;
  if (!running.length && !errors.length) return null;
  return h('aside', { className: 'mg-native-ai-status', 'aria-label': '文稿AI处理状态', 'data-native-ai-status': true },
    running.length > 0 && h('p', { role: 'status', 'data-mimir-processing': true }, 'MIMIR 已处理 ' + Math.max(0, Math.floor((performance.now() - Math.min(...running)) / 1000)) + ' 秒' + (running.length > 1 ? ' · ' + running.length + ' 项任务处理中' : '')),
    ...errors.map(row => h('p', { key: row.id, role: 'alert' }, row.text)),
    errors.length > 0 && button('关闭错误提示', () => { nativeAiStatus.errors = []; for (const listener of nativeAiStatus.listeners) listener(); }, { className: 'mg-text-button' }));
}
