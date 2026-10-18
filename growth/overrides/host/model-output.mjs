export const RESEARCH_OUTPUT_INSTRUCTION = `CONCISE_RESULT: Return one complete JSON object only, with no preface, reasoning transcript or repeated evidence text.
For each paper use at most 3 claims, 2 methods, 2 limitations and 2 critical questions. Each statement at most 120 Chinese characters (or 70 English words), and at most 2 citationIds. Conditions are short phrases, not essays.
Synthesis: at most 3 comparisons, 3 gaps and 6 draft paragraphs; each draft paragraph at most 180 Chinese characters (or 100 English words). Present the most relevant findings first; this is display order, not scientific ranking. Preserve qualifications, uncertainty and applicability conditions. comparable=true is allowed only for the exact same non-null dataset, metric and protocol in comparisonPolicy; qualitative discussion of different methods uses comparable=false.
Review only claims and references actually used in the draft: at most 6 issues and 8 semanticAssessments; each reason at most 100 characters. Never enumerate all source evidence. Do not request additional pages already read.`;

export function conciseResearchChoice(choice) {
  // Concise output must not silently lower either explicit or model-default effort.
  return { ...choice };
}

// Remove only exact duplicates. Unique conclusions, qualifications and errors survive.
export function compactResearchOutput(stage, value) {
  const lists = new Set(['claims','methods','limitations','criticalQuestions','draft','gaps','comparisons','issues','semanticAssessments','evidenceIds']);
  function walk(row, field='') {
    if (Array.isArray(row)) {
      const items = row.map(item=>walk(item));
      if (!lists.has(field)) return items;
      const seen = new Set();
      return items.filter(item=>{const key=JSON.stringify(item);if(seen.has(key))return false;seen.add(key);return true;});
    }
    if (!row || typeof row !== 'object') return row;
    return Object.fromEntries(Object.entries(row).map(([key,item])=>[key,walk(item,key)]));
  }
  // Stage scope prevents accidental use on source pages or source evidence.
  return ['analysis','synthesis','review','repair'].includes(stage) ? walk(value) : value;
}

export function compactResearchResult(result) {
  if (!result) return null;
  const used = new Set();
  function collect(row) {
    if (Array.isArray(row)) {row.forEach(collect);return;}
    if (!row || typeof row !== 'object') return;
    for (const [key,value] of Object.entries(row)) {
      if (key==='evidenceIds' && Array.isArray(value)) value.forEach(id=>used.add(id));
      else if (key==='evidenceId') used.add(value);
      else collect(value);
    }
  }
  collect(result.analysis);collect(result.synthesis);collect(result.review);
  return {...result,evidenceManifest:result.evidenceManifest.filter(item=>used.has(item.citationId))};
}
