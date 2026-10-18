// Narrow, repeatable overlay for the bundled MIT-licensed DeepSeek adapter.
// Source: api-docs.deepseek.com/zh-cn/updates/ (2026-10-17) and /api/list-models/.
export function applyDeepSeekCompatibility(source) {
  const oldCatalog = `const DEFAULT_MODELS = [{
\tid: "deepseek-flash",
\tname: "DeepSeek-V41-Flash",
\tcontextWindow: DEFAULT_CONTEXT_WINDOW,
\tinputModalities: ["text", "image"],
\tsystemPromptUpdate: "in-history",
\ttoolUpdate: "addition-only"
}, {
\tid: "deepseek-v4-pro",
\tname: "DeepSeek-V4-Pro",
\tdescription: "Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.",
\tcontextWindow: DEFAULT_CONTEXT_WINDOW
}];`;
  const newCatalog = oldCatalog.replace('DeepSeek-V41-Flash', 'DeepSeek-V4.1-Flash-1017')
    .replace('name: "DeepSeek-V4-Pro"', 'name: "DeepSeek-V4-Pro-0813"')
    .replaceAll('contextWindow: DEFAULT_CONTEXT_WINDOW', 'contextWindow: 1048576');
  const previousOverlay = newCatalog.replaceAll('contextWindow: 1048576', 'contextWindow: 1048576,\n\tmaxTokens: 393216');
  const baseline = [oldCatalog, newCatalog, previousOverlay].find(catalog => source.includes(catalog));
  if (!baseline) throw new Error('Unexpected DeepSeek catalog baseline; refusing to replace custom configuration.');
  // Set the fallback only. Provider-level and per-model budgets keep their precedence.
  return source.replace(baseline, newCatalog)
    .replace('const DEFAULT_MAX_TOKENS = 256e3;', 'const DEFAULT_MAX_TOKENS = 393216;')
    .replace('maxTokens: config.maxTokens ?? 256e3,', 'maxTokens: config.maxTokens ?? 393216,');
}

export function applyModelSelectorCompatibility(source) {
  const original = 'function ModelSelect({ locked, available, directory, load, select, t }) {';
  const patched = 'function ModelSelect({ locked, available, directory, load, select, t, renderModelLabel = label => label }) {';
  if (!source.includes(patched)) {
    if (!source.includes(original) || !source.includes('exports.ModelDirectory = ModelDirectory;') || (source.match(/children: modelLabel\n/g) || []).length !== 2) throw new Error('Unexpected native model selector baseline.');
    source = source.replace(original, patched)
    .replaceAll('children: modelLabel\n', 'children: renderModelLabel(modelLabel, state.current)\n')
    .replace('children: model.name\n', 'children: renderModelLabel(model.name, { provider: group.id, model: model.id })\n')
    .replace('exports.ModelDirectory = ModelDirectory;', 'exports.ModelSelect = ModelSelect;\n\t\texports.ModelDirectory = ModelDirectory;');
  }
  // The first modelLabel is the compact trigger; subsequent labels are menu rows.
  if (source.includes('children: renderModelLabel(modelLabel, state.current)\n')) source = source
    .replace('children: renderModelLabel(modelLabel, state.current)\n', 'children: renderModelLabel(modelLabel, state.current, "trigger")\n')
    .replace('children: renderModelLabel(modelLabel, state.current)\n', 'children: renderModelLabel(modelLabel, state.current, "menu")\n');
  return source.replace('children: renderModelLabel(model.name, { provider: group.id, model: model.id })\n', 'children: renderModelLabel(model.name, { provider: group.id, model: model.id }, "menu")\n');
}
