function ModelControls({ selection, disabled, onSaved }) {
  const [catalog, setCatalog] = useState(null), [providerId, setProviderId] = useState(''), [modelId, setModelId] = useState('');
  const [keyValue, setKeyValue] = useState(''), [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const request = useRef(null), saving = useRef(false);
  async function refresh() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setPending(true); setError('');
    try {
      const value = await api('models', null, controller.signal);
      if (controller.signal.aborted) return;
      setCatalog(value); setProviderId(value.selection.provider); setModelId(value.selection.model);
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  useEffect(() => { void refresh(); const changed = () => { if (!saving.current) void refresh(); }; window.addEventListener('mimir-model-changed', changed); return () => { request.current?.abort(); window.removeEventListener('mimir-model-changed', changed); }; }, []);
  const provider = catalog?.providers.find(item => item.id === providerId), locked = disabled || pending;
  const active = catalog?.selection || selection || {};
  async function save() {
    if (saving.current || locked) return;
    saving.current = true; setPending(true); setError(''); setMessage('');
    const controller = new AbortController(); request.current = controller;
    const payload = { provider: providerId, model: modelId, ...(keyValue ? { apiKey: keyValue } : {}) };
    try {
      const value = await api('model-settings', payload, controller.signal);
      setCatalog(value); setProviderId(value.selection.provider); setModelId(value.selection.model); setKeyValue('');
      setMessage('已保存。下一次 DSH 任务使用此模型；可用性以实际任务结果为准。');
      window.dispatchEvent(new CustomEvent('mimir-model-changed')); onSaved?.();
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { payload.apiKey = undefined; saving.current = false; if (request.current === controller) { request.current = null; setPending(false); } }
  }
  return h('section', { className: 'mg-model-settings', 'aria-label': '模型与API Key配置' },
    h('div', { className: 'mg-model-heading' }, h('div', null, h('strong', null, '当前模型'), h('p', { 'data-current-model': true }, active.model ? active.model + ' · ' + active.provider : '尚未选择模型')), button('刷新模型目录', refresh, { className: 'mg-secondary', disabled: locked })),
    h('div', { className: 'mg-form-pair' }, field('模型供应商', h('select', { value: providerId, disabled: locked, 'data-model-provider': true, onChange: event => { const next = catalog.providers.find(item => item.id === event.target.value); setProviderId(event.target.value); setModelId(next?.models[0]?.id || ''); setKeyValue(''); setMessage(''); } }, h('option', { value: '' }, '请选择供应商'), ...(catalog?.providers || []).map(item => h('option', { key: item.id, value: item.id }, item.name)))),
      field('选择模型', h('select', { value: modelId, disabled: locked, 'data-model-id': true, onChange: event => { setModelId(event.target.value); setMessage(''); } }, h('option', { value: '' }, '请选择模型'), modelId && !provider?.models.some(item => item.id === modelId) && h('option', { value: modelId, disabled: true }, modelId + '（当前目录不可用）'), ...(provider?.models || []).map(item => h('option', { key: item.id, value: item.id }, item.name + (item.name !== item.id ? ' · ' + item.id : '')))))),
    field('API Key', textInput(keyValue, setKeyValue, { type: 'password', autoComplete: 'new-password', maxLength: 4096, disabled: locked || !provider?.credential?.writable, 'data-model-key': true, placeholder: provider?.credential?.configured ? '已配置；留空保留，输入新 Key 可更换' : '输入此供应商的 API Key' }), provider?.credential ? (provider.credential.configured ? '已配置凭据' : '尚未配置凭据') + (provider.credential.writable ? '；仅保存在本机 DSH 凭据服务。' : '；当前来源只读，请修改对应供应商配置。') : '此供应商未提供可编辑的 Key 入口。'),
    h('div', { className: 'mg-actions' }, button(pending ? '正在处理…' : '保存模型与 Key', save, { className: 'mg-primary', disabled: locked || !modelId || !provider?.models.some(item => item.id === modelId) })),
    h('small', null, '研究、成长方案和学习反馈共用此模型。Key 需来自所选供应商。'),
    error && h('p', { className: 'mg-inline-error', role: 'alert' }, error), message && h('p', { role: 'status' }, message));
}
function ResearchModelEntry() {
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () => api('model-selection').then(value => { if (active) setSelection(value); }).catch(() => {});
    void refresh(); window.addEventListener('mimir-model-changed', refresh);
    return () => { active = false; window.removeEventListener('mimir-model-changed', refresh); };
  }, []);
  return button(selection?.model ? '模型：' + selection.model + ' ▾' : '选择模型 ▾', () => window.dispatchEvent(new CustomEvent('mimir:settings', { detail: 'models' })), { className: 'mimir-model-entry mg-research-model-entry', title: '当前默认模型；点击选择模型和配置API Key', 'data-research-model': true });
}
// The product has its own Settings dialog rather than rendering DSH's section slot.
// Extend its model section through a portal; the original appearance page stays owned by the product.
function NativeModelBridge() {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    let node;
    const sync = () => {
      const section = document.querySelector('.mimir-settings-dialog .mimir-preferences[aria-label="模型选择"]');
      if (section && node?.parentElement === section) return;
      node?.remove(); node = null;
      if (section) { node = document.createElement('div'); node.dataset.mimirModelControls = 'true'; section.appendChild(node); }
      setTarget(node);
    };
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true }); sync();
    return () => { observer.disconnect(); node?.remove(); };
  }, []);
  return target ? createPortal(h(ModelControls), target) : null;
}
