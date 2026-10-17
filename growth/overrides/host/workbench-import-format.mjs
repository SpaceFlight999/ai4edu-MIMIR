// 程序 A：所有论文内容进入工作台建议前必须经过的确定性格式清理。
// Only the newly imported fragment is processed; existing document text and
// structured citation identities remain unchanged.
const timestamp = String.raw`\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?`;
const generatedTime = new RegExp(String.raw`^\s*(?:[-*+]\s+)?(?:生成时间|草稿生成时间)\s*[:：]\s*${timestamp}(?=$|\s|[·|｜;；])`, 'i');
const hashField = String.raw`SHA[-\s]?256(?:\s*[:：]\s*|\s+)[a-f\d]{64}`;
const evidenceField = String.raw`(?:证据(?:编号)?|evidence(?:[ _-]?id)?)(?:\s*[:：]\s*|\s+)[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}`;
const technicalField = new RegExp(String.raw`(?:[ \t]*[·|｜;；][ \t]*)?(?:${hashField}|${evidenceField})(?=$|[ \t]*[·|｜;；])`, 'gi');
const standaloneTechnical = new RegExp(String.raw`^\s*(?:${hashField}|${evidenceField})(?:\s*[·|｜;；]\s*(?:${hashField}|${evidenceField}))*\s*$`, 'i');

export function normalizeWorkbenchImport(text) {
  if (typeof text !== 'string') throw new TypeError('工作台导入内容必须是文字。');
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let fence = null, inQuote = false;
  for (let line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      output.push(line); continue;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) { output.push(line); continue; }
    if (!inQuote) {
      const time = line.match(generatedTime);
      if (time) {
        const tail = line.slice(time[0].length);
        if (!tail.trim()) line = '';
        else if (/^[ \t]*[·|｜;；][ \t]*(?:来源|source)\s*[:：]/i.test(tail)) {
          line = tail.replace(/^[ \t]*[·|｜;；][ \t]*/, '');
        }
      }
    }
    const source = /^\s*(?:来源|source)\s*[:：]/i.test(line);
    if (source) {
      inQuote = false;
      line = line.replace(technicalField, '').replace(/[ \t]*[·|｜;；][ \t]*$/, '').trimEnd();
    } else if (/^\s*原文引文(?:（节选）)?\s*[:：]/.test(line)) {
      inQuote = true;
    } else if (!inQuote) {
      // Standalone generated technical fields are metadata, not prose about SHA-256.
      if (standaloneTechnical.test(line)) line = '';
    }
    if (!inQuote) line = line.trimEnd();
    if (inQuote || line || output.at(-1) !== '') output.push(line);
  }
  let first = 0, last = output.length;
  while (first < last && !output[first].trim()) first++;
  while (last > first && !output[last - 1].trim()) last--;
  return output.slice(first, last).join('\n');
}
