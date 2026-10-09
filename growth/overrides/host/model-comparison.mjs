const labels={dataset:'数据集',metric:'评价指标',protocol:'实验协议'};

export function comparisonPolicy(analysis) {
  return {
    rule:'comparable=true means numerical results can be directly ranked: every participating paper must have the exact same non-null dataset, metric and protocol below. Otherwise comparable=false. Qualitative discussion is still allowed; never change analysis conditions to make a ranking pass.',
    papers:(Array.isArray(analysis?.papers)?analysis.papers:[]).map(p=>({paperId:p?.paperId??null,conditions:Object.fromEntries(Object.keys(labels).map(key=>[key,p?.conditions?.[key]?.value??null]))}))
  };
}

// Input has already passed all structure, scope and citation checks. Replace
// unsafe cross-paper prose, rather than merely switching the comparable flag.
export function conservativeSynthesis(value,analysis,snapshot,indexes) {
  const blocked=new Set(indexes),issues=[];
  const comparisons=value.comparisons.map((row,index)=>{
    if(!blocked.has(index))return row;
    const fields=Object.keys(labels).filter(key=>{
      const values=row.paperIds.map(id=>analysis.papers.find(p=>p.paperId===id).conditions[key].value);
      return values.some(v=>v===null)||new Set(values).size!==1;
    }).map(key=>labels[key]);
    const message=`${fields.join('、')}不同或尚未确认，不能直接比较数值优劣。已按各篇论文分别陈述，原跨论文排名草稿未采用。`;
    issues.push({code:'INCOMPARABLE_RANKING',message,evidenceIds:[...row.evidenceIds]});
    return {...row,comparable:false,reason:message,conclusion:'可讨论研究目标与方法差异；现有条件不足以得出谁优于谁的直接排名。'};
  });
  const draft=analysis.papers.flatMap(p=>{
    const source=['claims','methods','limitations','criticalQuestions'].flatMap(key=>p[key]).find(row=>row.evidenceIds.length);
    const name=snapshot.find(row=>row.paperId===p.paperId)?.title??p.paperId;
    return source
      ?[{text:`论文「${name}」的单篇分析记录如下，仅在该论文所述条件下解读。`,kind:'model_inference',evidenceIds:[...source.evidenceIds]},{...source}]
      :[{text:`论文「${name}」本次分析未提供可引用的单篇结论，需回到原文核对。`,kind:'unknown',evidenceIds:[]}];
  });
  draft.push({text:'以上按各篇论文分别陈述。数据集、评价指标或实验协议不同或未确认，不能据此直接排名；仍需人工核对每项引用与结论。',kind:'model_inference',evidenceIds:[...new Set(issues.flatMap(row=>row.evidenceIds))]});
  return {synthesis:{...value,comparisons,draft,gaps:[]},issues};
}
