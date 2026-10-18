import {chronological,displayTime,chineseError,CRITICAL_POINTS,RESEARCH_TIMEOUT_MS} from './session.mjs';
import {disclosure as makeDisclosure,titleNavigation,scrollWithinAnalysis} from './reader-ui.mjs';
const kinds={original_fact:'原文事实（需复核语义）',author_conclusion:'作者结论',model_inference:'模型推断',unknown:'待核实'};
const statuses={running:'处理中',succeeded:'草稿已完成',failed:'失败',cancelled:'已取消',timed_out:'超时',interrupted:'运行中断'};
export function installResearchUi({$,api,el,button,message,error,state,openPaper,locate,thinking}) {
  const selected=new Set(),publishing=new Set();let library=[],revision=0,active=null,pollTimer=null;
  for(const [id,title,prompt] of CRITICAL_POINTS){const chip=button(title,()=>{const active=chip.getAttribute('aria-pressed')!=='true';chip.setAttribute('aria-pressed',String(active));},'critical-chip');chip.setAttribute('aria-pressed','false');chip.dataset.prompt=prompt;chip.dataset.criticalPoint=id;$('critical-options').append(chip);}
  const failure=el('p',undefined,'research-error');failure.hidden=true;failure.setAttribute('role','alert');$('research-status').after(failure);
  const showError=e=>{failure.textContent=chineseError(e);failure.hidden=false;};
  function stopTimers(){clearTimeout(pollTimer);pollTimer=null;}
  function showTime(run){if(run.status!=='running'){thinking.stop('research');return;}thinking.start('research','研究写作',Date.parse(run.createdAt));thinking.status('research',run.metrics?.outputRetries?'模型正在简化输出并继续生成':'模型正在处理所选论文');}
  const bind=(id,action)=>$(id).addEventListener('click',()=>Promise.resolve().then(()=>{failure.hidden=true;return action();}).catch(showError));
  function updateLibrary(rows) {
    library=rows;$('research-papers').replaceChildren();
    for(const paper of rows) {
      const ready=paper.guideReady&&paper.parseStatus==='ready'&&paper.researchToolsEnabled;
      if(!ready)selected.delete(paper.paperId);
      const card=el('article',undefined,'research-paper'+(ready?'':' is-unready'));
      const choice=button(paper.title,()=>{if(!paper.guideReady){showError(new Error('请先打开这篇论文并生成导读，再选择研究。'));return;}if(!paper.researchToolsEnabled){showError(new Error('请先打开这篇论文，在上方允许研究工具读取。'));return;}if(!ready){showError(new Error('论文解析尚未完成，请稍后重试。'));return;}selected.has(paper.paperId)?selected.delete(paper.paperId):selected.add(paper.paperId);choice.setAttribute('aria-pressed',String(selected.has(paper.paperId)));},'research-paper-choice');
      choice.setAttribute('aria-pressed',String(selected.has(paper.paperId)));choice.setAttribute('aria-disabled',String(!ready));choice.append(el('small',ready?'已导读 · 可参与写作':!paper.guideReady?'需先进行导读':'需允许研究工具读取'));
      card.append(choice,button('打开论文',()=>openPaper(paper.paperId)));$('research-papers').append(card);
    }
  }
  async function history() {
    const rows=await api('research-history');$('research-history').replaceChildren();
    for(const row of chronological(rows).reverse()){const item=el('article',undefined,'research-history-item');item.dataset.runId=row.runId;const open=button(`写作任务 · ${statuses[row.status]??row.status} · ${displayTime(row.createdAt)}`,()=>openRun(row.runId));if(['failed','timed_out','interrupted'].includes(row.status))open.classList.add('research-error');item.append(open,button('删除任务',async()=>{if(!window.confirm(row.status==='running'?'取消并删除此任务？':'删除此研究任务？已提交的工作台建议会保留。'))return;await api('research-delete',{runId:row.runId});if(active===row.runId){stopTimers();++revision;active=null;thinking.stop('research');$('research-result').replaceChildren();$('research-status').textContent='任务已删除';$('research-publish').disabled=true;$('research-export').disabled=true;$('research-cancel').hidden=true;}await history();}));$('research-history').append(item);}
    if(!rows.length)$('research-history').append(el('p','尚无研究任务。任务与结果保存在本机，重启后可恢复。'));
  }
  function cite(container,ids,manifest,sources=[]) {
    for(const id of ids??[]) {
      const evidence=manifest.find(e=>e.citationId===id);if(!evidence)continue;
      const name=sources.find(p=>p.paperId===evidence.paperId)?.title??library.find(p=>p.paperId===evidence.paperId)?.title??evidence.paperId;
      const excerpt=[...evidence.quote];
      const link=button(`PDF 页 ${evidence.page} · ${excerpt.slice(0,64).join('')}${excerpt.length>64?'…':''}`,async()=>{
        const record=await api('paper',{paperId:evidence.paperId});
        if(record.paper.version!==evidence.paperVersion)throw new Error('原文解析版本已变化，此草稿引用需重新核对。');
        if(state.id!==evidence.paperId)await openPaper(evidence.paperId);
        await locate(evidence.evidenceId);
      },'citation');link.title=name+'\n'+evidence.quote;container.append(link);
    }
  }
  function result(run) {
    const output=$('research-result');output.replaceChildren();
    $('research-publish').disabled=run.status!=='succeeded'||publishing.has(run.runId);$('research-export').disabled=run.status!=='succeeded';$('research-start').disabled=run.status==='running';$('research-cancel').hidden=run.status!=='running';
    $('research-status').textContent=`${statuses[run.status]??run.status} · 模型 ${run.model?.provider??'未确认'}/${run.model?.model??'未确认'}`;
    showTime(run);failure.hidden=!run.error;if(run.error)showError(run.error);
    const sections=[];
    const disclosure=(title,render,options={})=>{const box=makeDisclosure(el,title,render,{className:'research-output-details reader-disclosure',...options});output.append(box);sections.push({title,node:box});return box;};
    disclosure('生成信息',box=>box.append(el('small','创建时间：'+displayTime(run.createdAt)+(run.finishedAt?' · 生成时间：'+displayTime(run.finishedAt):'')+' · 来源：'+(run.sources??[]).map(p=>p.title).join('、'))),{className:'compact-metadata'});sections.pop();
    const cover=run.coverage??[];
    if(cover.length){disclosure('读取范围与解析限制',box=>{for(const coverage of cover)box.append(el('p',`论文 ${run.sources?.find(p=>p.paperId===coverage.paperId)?.title??coverage.paperId}：已读取 ${coverage.readPages.length} 页；截断页 ${coverage.truncatedPages.join(', ')||'无'}；未读取页 ${[...coverage.missingPages,...coverage.excludedPages].join(', ')||'无'}。${coverage.warnings.join('；')}`));},{className:'compact-metadata'});sections.pop();}
    const draft=run.result;if(!draft)return;
    const statement=(title,row,target)=>{const card=el('section',undefined,'claim');card.append(el('h3',title+' · '+(kinds[row.kind]??row.kind)),el('p',row.text));cite(card,row.evidenceIds,draft.evidenceManifest,run.sources);target.append(card);return card;};
    disclosure('综合写作草稿',box=>{const titles=[];for(const [index,row] of (draft.synthesis?.draft??[]).entries()){const title='草稿段落 '+(index+1),node=statement(title,row,box);titles.push({title:row.text.slice(0,36)||title,node});}const nav=titleNavigation(el,button,titles,'草稿段落导航');if(nav)box.insertBefore(nav,box.children[1]??null);});
    if(draft.synthesis?.comparisons?.length)disclosure('比较与分析',box=>{for(const comparison of draft.synthesis.comparisons){const card=el('section',undefined,'claim');card.append(el('h3',comparison.comparable?'声明条件匹配，仍需核对科学可比性':'条件不明或不同，不能无条件排名'),el('p',comparison.reason),el('p',comparison.conclusion));cite(card,comparison.evidenceIds,draft.evidenceManifest,run.sources);box.append(card);}});
    if(draft.synthesis?.gaps?.length)disclosure('研究空白与问题',box=>{for(const row of draft.synthesis.gaps)statement('研究空白/问题',row,box);});
    const analysis=disclosure('展开论文分析 · '+draft.analysis.papers.length+' 篇',box=>{for(const paper of draft.analysis.papers){box.append(el('h3',run.sources?.find(p=>p.paperId===paper.paperId)?.title??paper.paperId));for(const [key,title] of [['claims','主张'],['methods','方法'],['limitations','限制'],['criticalQuestions','待研究问题']])for(const row of paper[key])statement(title,row,box);for(const [key,row] of Object.entries(paper.conditions)){const card=el('div');card.append(el('p',`${({dataset:'数据集',metric:'评价指标',protocol:'实验协议'})[key]??key}：${row.value??'本次范围未确认；不表示论文存在缺陷'}`));cite(card,row.evidenceIds,draft.evidenceManifest,run.sources);box.append(card);}}});analysis.dataset.researchAnalysis='true';
    disclosure('复核与使用限制',box=>{box.append(el('p','研究草稿尚未经人工确认，引用定位不证明语义支持或结论正确。'));for(const issue of draft.review.issues)box.append(el('p',issue.message));for(const text of draft.limitations)box.append(el('p',text));});
    const nav=titleNavigation(el,button,sections,'研究结果标题导航');if(nav)output.prepend(nav);
    if(run.status==='succeeded')scrollWithinAnalysis(output);
  }
  async function openRun(runId) {
    stopTimers();active=runId;const rev=++revision;let failures=0;
    $('research-result').replaceChildren();
    $('research-status').textContent='正在读取所选研究任务…';
    $('research-publish').disabled=true;$('research-export').disabled=true;
    $('research-cancel').hidden=true;
    const poll=async()=>{
      try {
        const status=await api('research-get',{runId},AbortSignal.timeout(15000));if(rev!==revision)return;
        const row=status.status==='succeeded'?await api('research-get',{runId,view:'result'},AbortSignal.timeout(15000)):status;
        if(rev!==revision)return;failures=0;result(row);
        if(row.status==='running')pollTimer=setTimeout(poll,900);else {stopTimers();await history();}
      } catch(e) {
        if(rev!==revision)return;
        if((!e.status||e.status>=500)&&++failures<=3){pollTimer=setTimeout(poll,failures*1500);return;}
        stopTimers();thinking.stop('research');showError(e);
        $('research-result').append(button('重新连接此研究任务',()=>openRun(runId)));
      }
    };
    await poll();
  }
  bind('research-start',async()=>{
    const workflow='synthesis-writing',ids=[...selected];
    if(!ids.length)throw new Error('请至少选择一篇已导读并允许研究工具读取的论文。');
    const papers=[];
    for(const paperId of ids) {
      const record=await api('paper',{paperId});
      if(!record.reading.enableTools)throw new Error('请打开每篇论文，并明确启用研究工具访问。');
      if(!record.guideReady)throw new Error('请先完成每篇所选论文的导读。');
      if(!record.report)throw new Error('论文解析尚未完成。');
      const pages=Array.from({length:record.report.pageCount},(_,index)=>index+1);
      papers.push({paperId,version:record.paper.version,pages,authorizedPages:pages});
    }
    const goal=$('research-question').value.trim(),points=[...$('critical-options').querySelectorAll('[aria-pressed="true"]')].map(node=>node.dataset.prompt),custom=$('critical-custom').value.trim();if(!goal&&!points.length&&!custom)throw new Error('请输入写作目标，或选择、编写批判性思考点。');
    const question=[goal,...points,custom].filter(Boolean).join('\n');
    thinking.start('research','研究写作');$('research-start').disabled=true;let run;try{run=await api('research-start',{workflow,question,papers,consent:true,budget:{timeoutMs:RESEARCH_TIMEOUT_MS,maxOutputChars:60000}});}catch(e){thinking.stop('research');$('research-start').disabled=false;throw e;}
    message('写作任务已启动，读取所选论文可提取的全文。');await openRun(run.runId);void history().catch(showError);
  });
  bind('research-cancel',async()=>{const runId=active;await api('research-cancel',{runId});if(active===runId)await openRun(runId);});
  bind('research-history-refresh',history);
  bind('research-publish',async()=>{
    const runId=active;
    if(!runId||publishing.has(runId)||!window.confirm('提交精简的研究正文到工作台建议？生成信息、原文引文及覆盖限制保留在论文页。接受建议后才写入正文。'))return;
    publishing.add(runId);$('research-publish').disabled=true;
    try {
      const proposal=await api('research-publish',{runId});
      if(!proposal?.changeSetId||!proposal?.documentId||!['proposed','applied'].includes(proposal.status))throw new Error('草稿建议未返回有效保存凭据，请重新导入。');
      message(proposal.status==='applied'?'该草稿建议已接受并写入工作台正文。':'已导入到工作台「项目文稿 → 修改建议」。建议列表会自动更新，展开核对后接受。');
    } catch(e) {e.workbenchImport=true;throw e;}
    finally {publishing.delete(runId);if(active===runId)$('research-publish').disabled=false;}
  });
  bind('research-export',async()=>{
    const runId=active;
    const run=await api('research-get',{runId,view:'full'});const blob=new Blob([JSON.stringify(run,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='研究草稿-'+runId+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  return {updateLibrary,history};
}
