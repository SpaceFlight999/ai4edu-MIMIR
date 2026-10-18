function ModelIdentity({ model, showProvider = false, plain = false }) {
  const effort = model.reasoningEffort || model.reasoning?.defaultEffort;
  const effortName = model.reasoning?.efforts.find(item => item.id === effort)?.name || effort;
  return h('span', { className: 'mimir-model-identity' },
    h('span', { className: 'mimir-model-name' }, model.name || model.model || model.id),
    model.version && h('span', { className: plain ? 'mimir-model-version-text' : 'mimir-model-badge', 'aria-label': '模型版本 ' + model.version }, model.version),
    effortName && h('span', { className: 'mimir-model-effort' }, effortName),
    showProvider && h('small', { className: 'mimir-model-provider' }, model.provider));
}
function ModelControls({ selection, disabled, onSaved, onConfigureProviders }) {
  const [catalog, setCatalog] = useState(null), [providerId, setProviderId] = useState(''), [modelId, setModelId] = useState('');
  const [keyValue, setKeyValue] = useState(''), [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [detail, setDetail] = useState(null), [detailPending, setDetailPending] = useState(false), [detailError, setDetailError] = useState(''), [effort, setEffort] = useState('');
  const request = useRef(null), saving = useRef(false);
  async function refresh() {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setPending(true); setError('');
    try {
      const value = await api('models', null, controller.signal);
      if (controller.signal.aborted) return;
      setCatalog(value); setProviderId(value.selection.provider); setModelId(value.selection.model); setEffort(value.selection.reasoningEffort || ''); setKeyValue('');
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (request.current === controller) { request.current = null; setPending(false); } }
  }
  useEffect(() => { void refresh(); const changed = () => { if (!saving.current) void refresh(); }; window.addEventListener('mimir-model-changed', changed); return () => { request.current?.abort(); window.removeEventListener('mimir-model-changed', changed); }; }, []);
  useEffect(() => {
    setDetail(null); setDetailError('');
    if (!providerId || !modelId) { setDetailPending(false); return; }
    const controller = new AbortController(); setDetailPending(true);
    api('model-info', { provider: providerId, model: modelId }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDetail(value); })
      .catch(failure => { if (!controller.signal.aborted) setDetailError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailPending(false); });
    return () => controller.abort();
  }, [providerId, modelId, catalog]);
  const provider = catalog?.providers.find(item => item.id === providerId), locked = disabled || pending;
  const active = catalog?.selection || selection || {};
  async function save() {
    if (saving.current || locked || detailPending || !detail) return;
    saving.current = true; setPending(true); setError(''); setMessage('');
    const controller = new AbortController(); request.current = controller;
    const payload = { provider: providerId, model: modelId, reasoningEffort: effort || null, ...(keyValue ? { apiKey: keyValue } : {}) };
    try {
      const value = await api('model-settings', payload, controller.signal);
      if (controller.signal.aborted) return;
      setCatalog(value); setProviderId(value.selection.provider); setModelId(value.selection.model); setEffort(value.selection.reasoningEffort || ''); setKeyValue('');
      setMessage('已保存默认模型。论文、文稿、成长任务和新会话使用此设置；已有研究会话可在输入框模型菜单中切换。');
      window.dispatchEvent(new CustomEvent('mimir-model-changed')); onSaved?.();
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { payload.apiKey = undefined; saving.current = false; if (request.current === controller) { request.current = null; setPending(false); } }
  }
  return h('section', { className: 'mg-model-settings', 'aria-label': '模型与API Key配置' },
    h('div', { className: 'mg-model-heading' }, h('div', null, h('strong', null, '默认模型'), h('p', { 'data-current-model': true }, active.model ? h(ModelIdentity, { model: active, showProvider: true, plain: true }) : '尚未选择模型')), button('刷新模型目录', refresh, { className: 'mg-secondary', disabled: locked })),
    h('div', { className: 'mg-form-pair' }, field('模型供应商', h('select', { value: providerId, disabled: locked, 'data-model-provider': true, onChange: event => { const next = catalog.providers.find(item => item.id === event.target.value); setProviderId(event.target.value); setModelId(next?.models[0]?.id || ''); setEffort(''); setKeyValue(''); setMessage(''); } }, h('option', { value: '' }, '请选择供应商'), ...(catalog?.providers || []).map(item => h('option', { key: item.id, value: item.id }, item.name)))),
      field('选择模型', h('select', { value: modelId, disabled: locked, 'data-model-id': true, onChange: event => { setModelId(event.target.value); setEffort(''); setMessage(''); } }, h('option', { value: '' }, '请选择模型'), modelId && !provider?.models.some(item => item.id === modelId) && h('option', { value: modelId, disabled: true }, modelId + '（当前目录不可用）'), ...(provider?.models || []).map(item => h('option', { key: item.id, value: item.id }, item.name + (item.version ? ' · ' + item.version : '') + (item.name !== item.id ? ' · ' + item.id : '')))))),
    detail && h('div', { className: 'mimir-model-preview', 'data-model-preview': true }, h(ModelIdentity, { model: { ...detail, reasoningEffort: effort }, plain: true }),
      h('small', null, [detail.contextWindow && '上下文 ' + detail.contextWindow.toLocaleString() + ' tokens', detail.maxOutputTokens && '默认输出上限 ' + detail.maxOutputTokens.toLocaleString() + ' tokens', detail.inputModalities?.includes('image') ? '支持图片' : '文本输入'].filter(Boolean).join(' · '))),
    field('推理强度', h('select', { value: effort, disabled: locked || detailPending || (!detail?.reasoning && !effort), 'data-model-effort': true, onChange: event => { setEffort(event.target.value); setMessage(''); } },
      h('option', { value: '' }, detail?.reasoning ? '模型默认' : detailPending ? '正在读取能力…' : '模型默认（无可调档位）'),
      effort && !detail?.reasoning?.efforts.some(item => item.id === effort) && h('option', { value: effort, disabled: true }, effort + '（当前不可用）'),
      ...(detail?.reasoning?.efforts || []).map(item => h('option', { key: item.id, value: item.id }, item.name))), '仅显示此模型支持的档位；选择模型默认可清除旧的强度设置。'),
    field('API Key', textInput(keyValue, setKeyValue, { type: 'password', autoComplete: 'new-password', maxLength: 4096, disabled: locked || !provider?.credential?.writable, 'data-model-key': true, placeholder: provider?.credential?.configured ? '已配置；留空保留，输入新 Key 可更换' : '输入此供应商的 API Key' }), provider?.credential ? (provider.credential.configured ? '已配置凭据' : '尚未配置凭据') + (provider.credential.writable ? '；仅保存在本机 DSH 凭据服务。' : '；当前来源只读，请修改对应供应商配置。') : '此供应商未提供可编辑的 Key 入口。'),
    h('div', { className: 'mg-actions' }, button(pending ? '正在处理…' : '保存模型与 Key', save, { className: 'mg-primary', disabled: locked || detailPending || !detail || !modelId || !provider?.models.some(item => item.id === modelId) }), onConfigureProviders && button('配置提供商', onConfigureProviders, { className: 'mg-secondary', disabled: locked, 'data-configure-providers': true })),
    h('small', null, '论文、文稿、成长任务和新会话使用默认模型；已有会话可单独选择。Key 需来自所选供应商。'),
    (error || detailError) && h('p', { className: 'mg-inline-error', role: 'alert' }, error || detailError), message && h('p', { role: 'status' }, message));
}
function ResearchModelEntry(props) {
  const NativeSelect = require('@deepseek-ai/dsh-client-ui-model-selection').ModelSelect;
  useEffect(() => { if (props.available) props.load(); }, [props.directory, props.available]);
  const renderModelLabel = (label, selection, surface) => {
    if (!selection) return label;
    const dated = label.match(/^(.*?)[-\s]((?:20\d{2}[-]?\d{2}[-]?\d{2})|(?:\d{4}))$/);
    return h(ModelIdentity, { model: { name: dated?.[1] || label, ...(dated ? { version: dated[2] } : {}) }, plain: surface !== 'trigger' });
  };
  return h('span', { className: 'mimir-session-model', 'data-research-model': true },
    h(NativeSelect, { ...props, renderModelLabel }),
    button(h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true }, h('path', { d: 'M4 7h6m4 0h6M4 17h10m4 0h2', strokeLinecap: 'round' }), h('circle', { cx: 12, cy: 7, r: 2 }), h('circle', { cx: 16, cy: 17, r: 2 })), () => window.dispatchEvent(new CustomEvent('mimir:settings', { detail: 'models' })), { className: 'mimir-model-configure', title: '配置全局默认模型与 API Key；当前会话用旁边的模型菜单切换', 'aria-label': '默认模型与 API 设置', disabled: props.locked || !props.available }));
}
// The product has its own Settings dialog rather than rendering DSH's section slot.
// Extend its model section through a portal; the original appearance page stays owned by the product.
function NativeModelBridge({ renderSlot }) {
  const [target, setTarget] = useState(null), [configureProviders, setConfigureProviders] = useState(false);
  useEffect(() => {
    const frames = () => [...document.querySelectorAll('.mimir-reading-panel iframe[title="论文阅读"]')];
    const notifyReaders = () => { for (const frame of frames()) { const url = new URL(frame.src, location.href); if (url.hostname === '127.0.0.1') frame.contentWindow?.postMessage({type:'mimir-model-changed'},url.origin); } };
    const fromReader = event => { if (event.data?.type === 'mimir-model-changed' && frames().some(frame => frame.contentWindow === event.source && new URL(frame.src,location.href).origin === event.origin)) window.dispatchEvent(new CustomEvent('mimir-model-changed')); };
    window.addEventListener('mimir-model-changed',notifyReaders); window.addEventListener('message',fromReader);
    return () => {window.removeEventListener('mimir-model-changed',notifyReaders);window.removeEventListener('message',fromReader);};
  }, []);
  useEffect(() => {
    let node;
    const sync = () => {
      const section = document.querySelector('.mimir-settings-dialog .mimir-preferences[aria-label="模型选择"]');
      if (section && node?.parentElement === section) return;
      node?.remove(); node = null; setConfigureProviders(false);
      if (section) { node = document.createElement('div'); node.dataset.mimirModelControls = 'true'; section.appendChild(node); }
      setTarget(node);
    };
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true }); sync();
    return () => { observer.disconnect(); node?.remove(); };
  }, []);
  const returnToModels = () => { setConfigureProviders(false); window.dispatchEvent(new CustomEvent('mimir-model-changed')); };
  return target ? createPortal(configureProviders
    ? h('section', { 'aria-label': '提供商配置', 'data-native-provider-settings': true },
      h('div', { className: 'mg-actions' }, button('返回模型选择', returnToModels, { className: 'mg-secondary' })),
      h('p', { className: 'mg-provider-protocol-help' }, 'API 地址随协议填写：OpenAI Chat / Responses 通常以 /v1 结尾；Anthropic Messages 填服务根地址，例如 https://api.anthropic.com 或 https://api.deepseek.com/anthropic，勿重复添加 /v1/messages。'),
      renderSlot('settings.section', { close: returnToModels }, { only: 'models' }))
    : h(ModelControls, { onConfigureProviders: () => setConfigureProviders(true) }), target) : null;
}
