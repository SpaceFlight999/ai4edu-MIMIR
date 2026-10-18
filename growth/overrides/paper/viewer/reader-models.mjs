// The standalone reader uses the same validated model settings as the main app.
async function request(path, input, signal) {
  const response = await fetch(new URL('api/' + path, window.location.href), { method: 'POST', credentials: 'same-origin', signal,
    headers: { 'content-type': 'application/json', 'X-Paper-Guide': '1' }, body: JSON.stringify(input || {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '无法读取模型配置，请重新连接 MIMIR。');
  return result;
}
function identity(model, element, plain = false) {
  element.replaceChildren();
  const name = document.createElement('span'); name.className = 'reader-model-name'; name.textContent = model.name || model.model || model.id;
  element.append(name);
  if (model.version) {
    const badge = document.createElement('span'); badge.className = plain ? 'reader-model-version-text' : 'reader-model-badge'; badge.textContent = model.version;
    badge.setAttribute('aria-label','模型版本 ' + model.version); element.append(badge);
  }
  const level = model.reasoningEffort || model.reasoning?.defaultEffort;
  if (level) { const effort = document.createElement('small'); effort.textContent = model.reasoning?.efforts.find(item => item.id === level)?.name || level; element.append(effort); }
}
export function installReaderModels({ notify, onError }) {
  const $ = id => document.getElementById(id), provider = $('provider'), model = $('model'), effort = $('model-effort'), save = $('model-save');
  let catalog, detail, loading = false, generation = 0, controller, queuedRefresh = false, parentOrigin;
  function option(value, text) { const node = document.createElement('option'); node.value = value; node.textContent = text; return node; }
  function busy(value) {
    loading = value; provider.disabled = model.disabled = save.disabled = value; effort.disabled = value || (!detail?.reasoning && !effort.value);
    if (!value && queuedRefresh) { queuedRefresh = false; queueMicrotask(() => void refresh().catch(onError)); }
  }
  function preview() { if (detail) identity({ ...detail, reasoningEffort: effort.value }, $('model-preview'), true); }
  async function loadDetail(selectedEffort = '') {
    const revision = ++generation; controller?.abort(); controller = new AbortController(); detail = null; busy(true);
    $('model-preview').textContent = '正在读取模型能力…';
    try {
      const value = await request('model-info', { provider: provider.value, model: model.value }, controller.signal);
      if (revision !== generation) return;
      detail = value;
      effort.replaceChildren(option('', value.reasoning ? '模型默认' : '模型默认（无可调档位）'), ...(value.reasoning?.efforts || []).map(item => option(item.id, item.name)));
      if (selectedEffort && !value.reasoning?.efforts.some(item => item.id === selectedEffort)) effort.append(option(selectedEffort, selectedEffort + '（当前不可用）'));
      effort.value = selectedEffort; preview();
    } catch (error) { if (revision === generation && error.name !== 'AbortError') { $('model-preview').textContent = '模型能力暂不可用，请刷新模型目录。'; onError(error); } }
    finally { if (revision === generation) { busy(false); effort.disabled = !detail?.reasoning && !effort.value; save.disabled = !detail; } }
  }
  async function models(selected, selectedEffort) {
    const rows = catalog.providers.find(item => item.id === provider.value)?.models || [];
    model.replaceChildren(option('', '选择模型'), ...rows.map(item => option(item.id, item.name + (item.version ? ' · ' + item.version : ''))));
    model.value = selected || rows[0]?.id || '';
    if (model.value) await loadDetail(selectedEffort);
    else { ++generation; controller?.abort(); detail = null; busy(false); save.disabled = true; $('model-preview').textContent = '当前提供商没有可用的文本模型。'; effort.replaceChildren(option('', '模型默认')); effort.disabled = true; }
  }
  async function refresh() {
    if (loading) return;
    busy(true);
    try {
      catalog = await request('model-catalog');
      provider.replaceChildren(option('', '选择提供商'), ...catalog.providers.map(item => option(item.id, item.name)));
      provider.value = catalog.selection.provider;
      if (catalog.selection.model) identity(catalog.selection, $('settings-toggle'));
      await models(catalog.selection.model, catalog.selection.reasoningEffort || '');
    } catch (error) { busy(false); save.disabled = true; throw error; }
  }
  provider.addEventListener('change', () => void models().catch(onError));
  model.addEventListener('change', () => { if (model.value) void loadDetail().catch(onError); else { ++generation; controller?.abort(); detail = null; save.disabled = effort.disabled = true; $('model-preview').replaceChildren(); } });
  effort.addEventListener('change', preview);
  $('model-refresh').addEventListener('click', () => void refresh().catch(onError));
  save.addEventListener('click', async () => {
    if (loading || !detail) return;
    busy(true);
    try {
      const result = await request('model-settings', { provider: provider.value, model: model.value, reasoningEffort: effort.value || null });
      identity(result.selection, $('settings-toggle'));
      notify('已保存模型与推理强度。');
      // Same-origin parent owns the shared settings event.
      if (window.parent !== window && parentOrigin) window.parent.postMessage({type:'mimir-model-changed'},parentOrigin);
    } catch (error) { onError(error); }
    finally { busy(false); }
  });
  const changed = event => {
    if (event.source !== window.parent || !/^http:\/\/127\.0\.0\.1:\d+$/.test(event.origin)) return;
    parentOrigin = event.origin;
    if (event.data?.type !== 'mimir-model-changed') return;
    if (loading) queuedRefresh = true; else void refresh().catch(onError);
  };
  window.addEventListener('message',changed);
  window.addEventListener('pagehide',()=>{window.removeEventListener('message',changed);controller?.abort();},{once:true});
  return { refresh };
}
