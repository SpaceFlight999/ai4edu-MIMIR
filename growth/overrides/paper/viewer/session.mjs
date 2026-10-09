export const FAILED_RUN_RETENTION_MS = 60 * 60 * 1000;
export const RESEARCH_TIMEOUT_MS = 15 * 60 * 1000;
export function chronological(rows) {
  return [...(rows ?? [])].sort((a,b) => (Date.parse(a.createdAt) || Number(a.createdAt) || 0) - (Date.parse(b.createdAt) || Number(b.createdAt) || 0));
}
export function displayTime(value) {
  if (!value) return '时间未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false});
}
export function chineseError(error) {
  const code = String(error?.code ?? '').toUpperCase();
  if (/TIMEOUT|TIMED_OUT/.test(code) || error?.name === 'TimeoutError') return '处理超时，请稍后重试或减少所选论文。';
  if (/CANCEL/.test(code) || error?.name === 'AbortError') return '任务已取消。';
  if (/AUTH|CREDENTIAL|KEY/.test(code) || [401,403].includes(error?.status)) return '模型授权不可用，请在设置中检查模型和密钥。';
  if (/STALE|VERSION/.test(code)) return '论文或文稿版本已变化，请刷新后重新核对。';
  if (code === 'MODEL_CONTEXT_LIMIT') return '原文超出所选模型的上下文容量，请更换容量更大的模型或减少所选论文。';
  if (code === 'MODEL_OUTPUT_LIMIT') return '模型输出达到长度上限，结果未完整生成，请缩小写作范围。';
  if (code === 'INSUFFICIENT_EVIDENCE') return '所选论文缺少可定位的原文证据，请检查 PDF 解析结果。';
  if (code === 'QUOTE_LOCATION_INVALID') return '引用无法在对应原文中定位，请重新核对论文解析结果。';
  if (code === 'MODEL_OUTPUT_INVALID') return '模型返回内容格式不符合要求，请重新生成。';
  if (code === 'INCOMPARABLE_RANKING') return '论文的数据集、评价指标或实验协议不同或未确认，模型的直接排名未通过校验。请重新生成带条件说明的草稿。';
  if (code === 'SCOPE_DENIED') return '模型返回了未选择的论文或越界来源，结果未通过研究范围校验，请重新生成。';
  if (code === 'INVALID_ARGUMENT') return '任务参数或模型返回的结构不符合要求，请核对所选论文后重新生成。';
  if (code === 'INTERRUPTED') return '应用关闭中断了任务，请重新生成；原文和笔记仍保留。';
  if (/BUSY|RATE|LIMIT/.test(code) || error?.status === 429) return '当前任务或调用额度受限，请稍后重试。';
  if (/CITATION|EVIDENCE/.test(code)) return '模型结果未通过证据校验，请重新生成。';
  const text = String(error?.message ?? '').replace(/https?:\/\/\S+|(?:sk-|Bearer\s+)\S+/gi, '').trim();
  if (/[\u3400-\u9fff]/.test(text) && !/[A-Za-z]{12,}/.test(text)) return text.replace(/\s*\([A-Z_\d]+\)/g,'').slice(0,140);
  return '任务未完成，未能识别具体原因；请保留任务记录以便排查。';
}
export function guideReady(record) {
  return (record.analysis ?? []).some(row => row.sourceSha256 === record.paper.sourceSha256 && row.parserVersion === record.paper.parserVersion);
}
export function expiredFailure(run, now=Date.now()) {
  return ['failed','timed_out','interrupted'].includes(run.status) && now - Date.parse(run.finishedAt ?? run.createdAt) >= FAILED_RUN_RETENTION_MS;
}
export class PaperTabs {
  constructor(storage, projectId) {
    this.storage=storage;this.key='mimir-paper-tabs:'+projectId;
    try {const saved=JSON.parse(storage.getItem(this.key) ?? 'null');this.ids=Array.isArray(saved)?saved.filter(id=>typeof id==='string'):null;} catch {this.ids=null;}
  }
  persist(){this.storage.setItem(this.key,JSON.stringify(this.ids??[]));}
  reconcile(rows){const available=new Set(rows.map(row=>row.paperId));this.ids=this.ids===null?rows.map(row=>row.paperId):this.ids.filter(id=>available.has(id));this.persist();return this.ids;}
  open(id){this.ids??=[];if(!this.ids.includes(id))this.ids.push(id);this.persist();}
  close(id){this.ids=(this.ids??[]).filter(value=>value!==id);this.persist();return this.ids.at(-1)??null;}
}
export const CRITICAL_POINTS = [
  ['assumptions','假设与适用边界','核对核心假设、适用条件和未验证的外推，区分未报告与已证实缺陷。'],
  ['evidence','证据强度','检查证据是否支持每一项结论，标注不确定性、样本规模和替代解释。'],
  ['comparison','比较是否公平','核对数据集、指标、实验协议与基线；条件不一致时避免直接排名。'],
  ['reproduction','复现与反例','识别复现所缺的信息、可能反例及可检验的补充实验。'],
  ['synthesis','分歧与研究空白','比较不同论文的共识、分歧与空白，将推断明确标为待验证观点。'],
];
