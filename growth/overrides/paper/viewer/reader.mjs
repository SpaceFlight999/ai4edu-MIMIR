import * as pdfjs from './vendor/pdf.min.mjs';
import { NoteDrafts } from './drafts.mjs';
import { installResearchUi } from './research-ui.mjs';
import { installReaderMotion } from './motion.mjs';
import { paintHighlights,paintQuestionSelection } from './highlights.mjs';
import {PaperTabs,chronological,displayTime,chineseError} from './session.mjs';
import {disclosure,titleNavigation,thinkingRegion} from './reader-ui.mjs';
installReaderMotion();
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
const $ = id => document.getElementById(id);
const state = {id:null, record:null, pdf:null, page:1, zoom:1, section:'', selection:null, edit:null, offset:null, revision:0, searchRevision:0, render:Promise.resolve(), task:null, literature:null};
const el = (tag,text,className) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
function button(text,action,className) {const n=el('button',text,className);n.type='button';n.addEventListener('click',()=>Promise.resolve().then(action).catch(error));return n;}
const thinking=thinkingRegion($('thinking-panel'),el);
function message(text,bad=false) {$('status').textContent=text;$('status').classList.toggle('error',bad);$('status').setAttribute('role',bad?'alert':'status');}
function error(e) {message(chineseError(e),true);}
async function api(operation,args={},signal) {
  const response=await fetch(new URL('api/'+operation,location.href),{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Guide':'1'},body:JSON.stringify(args),signal});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(`${data.message??'请求失败'} (${data.error??response.status})`),{status:response.status,code:data.error});return data;
}
function current() {if(!state.id)throw new Error('请先导入或选择论文。');return {paperId:state.id};}
function tab(id) {for(const n of document.querySelectorAll('[data-tab]'))n.setAttribute('aria-pressed',String(n.dataset.tab===id));for(const n of document.querySelectorAll('.tab-panel'))n.hidden=n.id!==id;}
for(const n of document.querySelectorAll('[data-tab]'))n.addEventListener('click',()=>tab(n.dataset.tab));
function bind(id,fn,event='click') {$(id).addEventListener(event,()=>Promise.resolve().then(fn).catch(error));}
function resetPanels() {for(const id of ['sections','evidence-list','guide-result','answers','note-list','argument-map','reproduction','argument-map-titles','reproduction-titles','saved-literature','literature-results'])$(id).replaceChildren();state.selection=null;state.questionAnchor=null;paintPendingQuestion();state.edit=null;state.draftKey=null;$('note-selection-anchor').hidden=true;$('highlight').hidden=true;$('note-text').value='';$('note-title').value='';$('note-anchor').textContent='保存到当前页（页级批注）';$('selection-status').textContent='选中文字可添加批注；扫描页可用页级批注。';$('search').value='';$('search-count').textContent='';$('more').hidden=true;}
const statuses={queued:'等待解析',running:'正在解析（未提供逐页进度）',ready:'可阅读',failed:'解析失败'};
let librarySignature='';
async function loadPapers() {
  const rows=await api('papers');const signature=JSON.stringify([state.id,rows.map(p=>[p.paperId,p.title,p.version,p.parseStatus,p.researchToolsEnabled,p.guideReady])]);if(signature===librarySignature)return rows;librarySignature=signature;state.tabs?.reconcile(rows);renderPaperTabs(rows);researchUi.updateLibrary(rows);$('paper-list').replaceChildren();
  for(const p of rows){const n=button(p.title,()=>openPaper(p.paperId),'paper-item');n.setAttribute('aria-current',String(state.id===p.paperId));n.append(el('small',`${statuses[p.parseStatus]??p.parseStatus}${p.job?.failureCode?' · '+p.job.failureCode:''}`));$('paper-list').append(n);if(p.parseStatus==='failed')$('paper-list').append(button('重试解析',async()=>{await api('retry',{paperId:p.paperId});await loadPapers();if(state.id===p.paperId)await refreshPaper();}));if(['queued','running'].includes(p.parseStatus))$('paper-list').append(button('取消解析',async()=>{await api('cancel-parse',{paperId:p.paperId});await loadPapers();}));}
  if(!rows.length)$('paper-list').append(el('p','尚无论文。导入本地 PDF 后，原文将保存在本机。'));
  return rows;
}
async function openPaper(id) {
  rememberDraft();state.tabs?.open(id);librarySignature='';
  state.selection=null;state.questionAnchor=null;hideSelectionTools();window.getSelection()?.removeAllRanges();
  const revision=++state.revision;state.id=id;state.section='';resetPanels();$('page-surface').hidden=true;$('empty').hidden=false;$('empty').textContent='正在读取原文…';
  const record=await api('paper',{paperId:id});if(revision!==state.revision)return;state.record=record;state.page=record.reading.page;state.zoom=record.reading.zoom;$('zoom').value=String(state.zoom);$('tools-enabled').checked=record.reading.enableTools===true;
  $('paper-delete').disabled=false;
  $('paper-title').textContent=record.paper.title;$('literature-query').value=record.paper.title.slice(0,200);
  const restored=state.drafts?.list(id)[0];if(restored)restoreDraft(...restored);else state.draftKey=null;
  const previous=state.pdf;state.pdf=null;await state.render.catch(()=>{});await previous?.destroy();
  if(revision!==state.revision)return;
  const url=new URL('paper.pdf',location.href);url.searchParams.set('paperId',id);
  const pdf=await pdfjs.getDocument({url:url.href,isEvalSupported:false,cMapUrl:new URL('vendor/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/standard_fonts/',location.href).href,wasmUrl:new URL('vendor/wasm/',location.href).href}).promise;
  if(revision!==state.revision){await pdf.destroy();return;}state.pdf=pdf;$('empty').hidden=true;$('page-surface').hidden=false;
  await render(Math.min(state.page,pdf.numPages));await refreshPaper();await loadPapers();
}
async function refreshPaper() {
  if(!state.id)return;const id=state.id;const record=await api('paper',{paperId:id});if(state.id!==id)return;state.record=record;
  if(record.report){message(`已解析 ${record.report.pageCount} 页 · ${record.report.evidenceCount} 条证据`);$('limitations').textContent=`公式、表格与图像结构尚未可靠解析；${(record.report.warnings??[]).filter(w=>w!=='formula_and_table_structure_unverified').join('；')||'未发现额外解析提示'}。页码均为 PDF 页序号，印刷页码需人工核对。`;
    const sections=await api('sections',{paperId:id});if(id!==state.id)return;$('sections').replaceChildren();for(const s of sections)$('sections').append(button(s.title+' · '+s.page,async()=>{state.section=s.title;$('model-disclosure').textContent='章节精读发送范围：'+s.title+'；结果列出实际覆盖页。';await locate(s.evidenceId);$('scope').value='section';},'section-item'));await loadEvidence(true);
  }else{message(statuses[record.paper.parseStatus]+'；原文仍可阅读，解析完成后显示证据。');$('limitations').textContent='扫描页需要 OCR；当前尚未识别文字，公式和图表结构仍需人工核对。';}
  renderNotes();paintHighlights($('saved-highlights'),record.annotations,state.page,record.paper,selectNote);renderSavedLiterature();renderAnalysis(chronological(record.analysis).at(-1));renderAnswers();
  $('model-disclosure').textContent=`发送范围：当前论文可提取原文，最多 ${state.maxChars??48000} 个文字字符；长论文按页序处理并在结果中列出实际范围。仅当前论文最近四轮问答参与追问。`;
}
function highlight(box) {const n=$('highlight');n.hidden=false;n.style.left=box[0]*100+'%';n.style.top=box[1]*100+'%';n.style.width=(box[2]-box[0])*100+'%';n.style.height=(box[3]-box[1])*100+'%';}
function render(pageNumber,box) {
  const id=state.id,pdf=state.pdf;if(!pdf)return Promise.resolve();const page=Math.max(1,Math.min(pdf.numPages,Number(pageNumber)||1));state.requestedPage=page;
  const next=state.render.catch(()=>{}).then(async()=>{
    if(state.id!==id||state.pdf!==pdf)return;const p=await pdf.getPage(page);const base=p.getViewport({scale:1});const view=$('paper-view'),padding=getComputedStyle(view);const availableWidth=view.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight);const scale=Math.max(.2,availableWidth/base.width)*state.zoom;const viewport=p.getViewport({scale});const ratio=window.devicePixelRatio||1;const canvas=$('canvas');
    const previous=state.rendered;if(previous?.id===id&&previous.pdf===pdf&&previous.page===page&&Math.abs(previous.scale-scale)<.0001&&previous.ratio===ratio){if(box)highlight(box);return;}
    hideSelectionTools();
    $('highlight').hidden=true;$('page-surface').style.width=viewport.width+'px';$('page-surface').style.height=viewport.height+'px';$('page-surface').style.setProperty('--scale-factor',scale);$('page-surface').style.setProperty('--total-scale-factor',scale);$('page-surface').style.setProperty('--user-unit',1);
    canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    await p.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;if(state.id!==id)return;
    const layer=$('text-layer');layer.replaceChildren();await new pdfjs.TextLayer({textContentSource:await p.getTextContent(),container:layer,viewport}).render();
    state.rendered={id,pdf,page,scale,ratio};state.page=page;state.selection=null;$('page').value=page;$('page').max=pdf.numPages;$('pages').textContent='/ '+pdf.numPages;$('prev').disabled=page===1;$('next').disabled=page===pdf.numPages;
    $('selection-status').textContent=layer.textContent.trim()?'选中文字可高亮、批注或提问。':'此页没有可选择文字；可创建页级批注，扫描页需要 OCR。';paintHighlights($('saved-highlights'),state.record?.annotations,page,state.record?.paper,selectNote);paintNoteSelection();paintPendingQuestion();if(box)highlight(box);
    if(state.record?.report)await api('reading',{paperId:id,page,zoom:state.zoom,enableTools:$('tools-enabled').checked});
  });state.render=next;return next;
}
async function locate(id) {const paperId=state.id;const e=await api('evidence',{paperId,evidenceId:id});if(state.id!==paperId)return;state.section=e.section;await render(e.page,e.bbox);message(`已定位到 PDF 第 ${e.page} 页，黄色区域为解析证据。`);$('paper-view').focus({preventScroll:true});}
async function loadEvidence(reset) {
  if(!state.record?.report)return;const rev=++state.searchRevision,id=state.id;const page=await api('evidence',{paperId:id,query:$('search').value,offset:reset?0:state.offset??0});if(rev!==state.searchRevision||id!==state.id)return;if(reset)$('evidence-list').replaceChildren();
  for(const e of page.items){const n=button('',()=>locate(e.evidenceId),'evidence-item');n.append(el('small',`PDF 页 ${e.page} · ${e.section||'未识别章节'}`),el('span',e.quote));$('evidence-list').append(n,button('送到工作台',()=>proposeToWorkbench([e.evidenceId])));}
  state.offset=page.nextOffset;$('more').hidden=page.nextOffset===null;$('search-count').textContent=page.total?`${page.total} 条证据，已显示 ${$('evidence-list').querySelectorAll('.evidence-item').length} 条`:'没有找到原文证据。';
}
const selectionTools=el('div',undefined,'mimir-selection-tools');selectionTools.id='selection-tools';selectionTools.hidden=true;selectionTools.setAttribute('role','toolbar');selectionTools.setAttribute('aria-label','选中文字的操作');
for(const [label,id] of [['高亮','highlight-selection'],['取消高亮','remove-highlight-selection'],['批注','annotate-selection'],['提问','ask-selection'],['解释','explain-selection'],['翻译','translate-selection']])selectionTools.append(button(label,()=>{if(!state.selection)return;$(id).click();hideSelectionTools();}));
selectionTools.append(button('关闭',()=>{state.selection=null;window.getSelection()?.removeAllRanges();hideSelectionTools();}));document.body.append(selectionTools);
selectionTools.addEventListener('pointerdown',event=>event.preventDefault());
function hideSelectionTools(){selectionTools.hidden=true;}
function captureSelection() {
  const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed){state.selection=null;hideSelectionTools();return;}const range=selection.getRangeAt(0);if(!$('text-layer').contains(range.commonAncestorContainer)){state.selection=null;hideSelectionTools();return;}
  const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0),surface=$('page-surface').getBoundingClientRect(),view=$('paper-view').getBoundingClientRect();if(!rects.length)return;
  const clamp=n=>Math.max(0,Math.min(1,n));const bbox=[clamp((Math.min(...rects.map(r=>r.left))-surface.left)/surface.width),clamp((Math.min(...rects.map(r=>r.top))-surface.top)/surface.height),clamp((Math.max(...rects.map(r=>r.right))-surface.left)/surface.width),clamp((Math.max(...rects.map(r=>r.bottom))-surface.top)/surface.height)];
  state.selection={paperId:state.id,page:state.page,bbox,quote:selection.toString().slice(0,5000),rects:rects.map(r=>[clamp((r.left-surface.left)/surface.width),clamp((r.top-surface.top)/surface.height),clamp((r.right-surface.left)/surface.width),clamp((r.bottom-surface.top)/surface.height)])};
  const status='已选择 PDF 第 '+state.page+' 页：'+state.selection.quote.slice(0,100);if($('selection-status').textContent!==status)$('selection-status').textContent=status;
  const last=rects.at(-1);if(last.bottom<view.top||last.top>view.bottom){hideSelectionTools();return;}
  selectionTools.hidden=false;const size=selectionTools.getBoundingClientRect(),left=Math.max(8,Math.min(last.left,innerWidth-size.width-8)),below=last.bottom+8,top=below+size.height<Math.min(view.bottom,innerHeight)-8?below:Math.max(8,last.top-size.height-8);
  selectionTools.style.left=left+'px';selectionTools.style.top=top+'px';
}
let selectionFrame;const scheduleSelection=()=>{cancelAnimationFrame(selectionFrame);selectionFrame=requestAnimationFrame(captureSelection);};
$('text-layer').addEventListener('mouseup',scheduleSelection);document.addEventListener('selectionchange',scheduleSelection);
document.addEventListener('mouseup',event=>{if(!selectionTools.contains(event.target)&&!event.target.closest('.selection-bar'))scheduleSelection();});
$('paper-view').addEventListener('scroll',hideSelectionTools,{passive:true});
document.addEventListener('click',()=>{$('highlight').hidden=true;},true);
document.addEventListener('pointerdown',event=>{$('highlight').hidden=true;if(!selectionTools.contains(event.target)&&!$('text-layer').contains(event.target)&&!event.target.closest('.selection-bar')){state.selection=null;hideSelectionTools();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideSelectionTools();});
function anchor() {return state.selection??{paperId:state.id,page:state.page,bbox:[0,0,1,1],quote:''};}
async function addQuickNote(kind,text) {current();const a=anchor();if(!a.quote)throw new Error('请先在原文中选中文字；也可在批注页保存页级批注。');const paper=state.record?.paper;
  if(kind==='highlight'&&(state.record?.annotations??[]).some(note=>note.kind===kind&&note.page===a.page&&note.sourceSha256===paper?.sourceSha256&&note.parserVersion===paper?.parserVersion&&Array.isArray(note.bbox)&&note.bbox[0]<=a.bbox[0]+.001&&note.bbox[1]<=a.bbox[1]+.001&&note.bbox[2]>=a.bbox[2]-.001&&note.bbox[3]>=a.bbox[3]-.001)){message('所选区域已有高亮，颜色保持不变。');return;}
  await api('annotations',{paperId:state.id,action:'save',...a,text:text??a.quote,kind});await refreshPaper();message('已保存到本机。');}
async function removeSelectedHighlights(){
  const selected=state.selection;if(!selected?.quote)return;
  const paper=state.record?.paper,box=selected.bbox;
  const rows=(state.record?.annotations??[]).filter(note=>note.kind==='highlight'&&note.page===selected.page&&note.sourceSha256===paper?.sourceSha256&&note.parserVersion===paper?.parserVersion&&Array.isArray(note.bbox)&&note.bbox[0]<box[2]&&note.bbox[2]>box[0]&&note.bbox[1]<box[3]&&note.bbox[3]>box[1]);
  if(!rows.length){message('所选文字没有高亮，无需取消。');return;}
  for(const note of rows)await api('annotations',{paperId:selected.paperId,id:note.id,action:'delete',expectedVersion:note.version??1,idempotencyKey:crypto.randomUUID()});
  if(state.id===selected.paperId)await refreshPaper();message('已取消所选文字覆盖的 '+rows.length+' 处高亮。');
}
const removeHighlightButton=button('取消高亮',removeSelectedHighlights);removeHighlightButton.id='remove-highlight-selection';$('highlight-selection').after(removeHighlightButton);
function newNote(a=anchor()) {current();rememberDraft();state.draftKey=crypto.randomUUID();state.edit={...a};$('note-text').value='';$('note-title').value='';$('note-anchor-details').open=false;$('note-anchor').textContent=`PDF 第 ${a.page} 页 · ${a.quote?'选区：'+a.quote:'页级批注'}`;tab('notes');paintNoteSelection();$('note-title').focus();}
function noteTitle(note) {return note.title?.trim()||note.text?.split('\n')[0].slice(0,50)||'未命名批注';}
function renderNotes() {
  renderDrafts();
  $('note-list').replaceChildren();const rows=chronological(state.record.annotations);
  for(const n of rows){const card=el('article',undefined,'note');card.id='note-'+n.id;
    const box=disclosure(el,noteTitle(n),body=>{body.append(el('pre',n.text));body.append(disclosure(el,'生成信息与引文',info=>{info.append(el('small','生成时间：'+displayTime(n.createdAt)+' · 来源：'+state.record.paper.title),el('small',`PDF 页 ${n.page} · ${({highlight:'高亮',annotation:'批注',answer:'问答笔记'})[n.kind]??'笔记'} · 修改时间：${displayTime(n.updatedAt)}`));if(n.quote)info.append(el('p','引文：'+n.quote));if(n.sourceSha256!==state.record.paper.sourceSha256||n.parserVersion!==state.record.paper.parserVersion)info.append(el('small','旧文件或解析版本：定位需要核对。'));},{className:'compact-metadata'}));
      body.append(button('回跳原文',()=>render(n.page,n.bbox)),button('编辑',()=>{rememberDraft();state.draftKey=n.id;const draft=state.drafts?.get(n.id);state.edit={...(draft?.edit??n)};$('note-text').value=draft?.text??n.text;$('note-title').value=draft?.title??noteTitle(n);$('note-anchor-details').open=false;$('note-anchor').textContent=`编辑批注 · PDF 页 ${n.page} · ${n.quote||n.anchor}`;paintNoteSelection();$('note-title').focus();}),button('彻底删除',async()=>{if(!window.confirm('彻底删除这条批注及其未保存的修改？'))return;const paperId=state.id;await api('annotations',{paperId,id:n.id,action:'delete',expectedVersion:n.version??1,idempotencyKey:crypto.randomUUID()});state.drafts.remove(n.id);for(const [key,draft] of state.drafts.list(paperId))if(draft.edit.id===n.id)state.drafts.remove(key);if(state.edit?.id===n.id||state.draftKey===n.id)clearNoteEditor();$('highlight').hidden=true;await refreshPaper();}));});card.append(box);$('note-list').append(card);}
  if(!rows.length)$('note-list').append(el('p','尚无批注。填写标题与内容后保存。'));
}
function citations(container,items) {for(const cite of items??[])container.append(button(`原文依据：${cite.quote}`,()=>locate(cite.evidenceId),'citation'));}
function resultCard(result,saveAnswers=false,anchorInfo) {
  const wrap=el('article'),sections=[];
  const body=disclosure(el,saveAnswers?'回答细则':'导读细则',box=>{if(result.review)box.append(el('p',result.review));if(result.sourceSha256!==state.record.paper.sourceSha256||result.parserVersion!==state.record.paper.parserVersion)box.append(el('p','此内容来自旧文件或旧解析版本，引用需重新核对。'));
    for(const c of result.claims){const card=el('section',undefined,'claim');card.append(el('h3',c.topic),el('span',c.kind,'tag'),el('span',c.support,'tag'),el('p',c.text),el('small',c.reviewReason));citations(card,c.evidence);if(c.evidence.length)card.append(button('送到工作台',()=>proposeToWorkbench(c.evidence.map(e=>e.evidenceId),c.text)));if(saveAnswers)card.append(button('保存为研究笔记',async()=>{const first=c.evidence[0]?await api('evidence',{...current(),evidenceId:c.evidence[0].evidenceId}):null;await api('annotations',{...current(),action:'save',kind:'answer',title:c.topic,text:c.text+'\n'+c.support+'：'+c.reviewReason,page:first?.page??state.page,bbox:first?.bbox??[0,0,1,1],quote:first?.quote??'',evidenceIds:c.evidence.map(e=>e.evidenceId),tags:'问答'});await refreshPaper();}));box.append(card);sections.push({title:c.topic,node:card});}});
  const nav=titleNavigation(el,button,sections);if(nav)wrap.append(nav);wrap.append(disclosure(el,'生成信息',info=>{info.append(el('small','生成时间：'+displayTime(result.createdAt)+' · 来源：'+state.record.paper.title),el('small',`PDF 页 ${result.coverage.pages.join(', ')} · ${result.coverage.evidenceCount}/${result.coverage.totalEvidence} 条证据 · ${result.coverage.partial?'部分内容':'当前范围可提取文字'} · ${result.model.provider}/${result.model.model}`));if(anchorInfo?.quote)info.append(el('p','提问选区 · PDF 第 '+anchorInfo.page+' 页：'+anchorInfo.quote));},{className:'compact-metadata'}),body);return wrap;
}
function renderAnalysis(result) {
  $('guide-result').replaceChildren();$('argument-map').replaceChildren();$('reproduction').replaceChildren();$('argument-map-titles').replaceChildren();$('reproduction-titles').replaceChildren();if(!result){$('guide-result').append(el('p','尚未生成导读。请先选择模型，再选择阅读深度。'));return;}for(const row of chronological(state.record.analysis))$('guide-result').append(resultCard(row));
  const maps=[],reproduction=[];
  for(const n of result.tools?.map.nodes??[]){const card=el('section',undefined,'claim');card.append(el('h3',n.label),el('p',n.text),el('small',n.support));citations(card,n.evidence);const send=button('送到工作台',()=>proposeToWorkbench((n.evidence??[]).map(e=>e.evidenceId),n.label+'\n'+n.text));send.disabled=!n.evidence?.length;card.append(send);$('argument-map').append(card);maps.push({title:n.label,node:card});const edge=result.tools.map.edges.find(e=>e.from===n.id);if(edge)$('argument-map').append(el('p',edge.kind+'：'+edge.label,'map-edge'));}
  for(const r of result.tools?.reproduction??[]){const n=el('section',undefined,'claim');n.append(el('h3',r.topic+' · '+r.status),el('p',r.text));citations(n,r.evidence);const send=button('送到工作台',()=>proposeToWorkbench((r.evidence??[]).map(e=>e.evidenceId),r.topic+'\n'+r.status+'：'+r.text));send.disabled=!r.evidence?.length;n.append(send);$('reproduction').append(n);reproduction.push({title:r.topic,node:n});}
  for(const [id,items] of [['argument-map',maps],['reproduction',reproduction]]){const nav=titleNavigation(el,button,items);if(nav)$(id+'-titles').append(nav);}
}
function renderAnswers() {
  const output=$('answers'),previousIds=new Set([...output.querySelectorAll('.question-details')].map(n=>n.dataset.questionId)),expanded=new Set([...output.querySelectorAll('.question-details[open]')].map(n=>n.dataset.questionId));output.replaceChildren();
  for(const r of chronological(state.record.conversations).reverse()){
    const row=el('article',undefined,'question-entry');row.dataset.questionId=r.id;
    const box=el('details',undefined,'question-details');box.dataset.questionId=r.id;
    const summary=el('summary');summary.append(el('span',r.question.split('\n用户选区')[0],'question-title'));box.append(summary);let built=false;
    box.addEventListener('toggle',()=>{if(box.open&&!built){built=true;box.append(resultCard(r,true,r.anchor));}});
    if(expanded.has(r.id)||(!previousIds.has(r.id)&&r.id===chronological(state.record.conversations).at(-1)?.id))box.open=true;
    const remove=button('删除',async()=>{if(!window.confirm('删除这条提问及其回答？'))return;const paperId=state.id;remove.disabled=true;try{await api('conversation-delete',{paperId,id:r.id});if(state.id===paperId){await refreshPaper();message('提问及回答已删除。');}}finally{remove.disabled=false;}},'question-delete');remove.setAttribute('aria-label','删除提问：'+r.question.split('\n')[0]);
    row.append(box,remove);output.append(row);
  }
  if(!state.record.conversations.length)output.append(el('p','尚无问答。切换论文时仅恢复该论文的会话。'));
}
const reconnectTask=button('重新读取任务状态',()=>state.resumeTask?.());reconnectTask.hidden=true;$('thinking-panel').append(reconnectTask);
let modelTimer;
function modelBusy(active){$('generate').disabled=active;$('ask-button').disabled=active;$('cancel').hidden=!active||!state.task;if(!active){thinking.stop('reading');modelTimer=null;state.resumeTask=null;reconnectTask.hidden=true;}}
async function modelTask(operation,args) {
  if(state.task||modelTimer)throw new Error('已有模型任务运行，请等待或取消。');
  modelBusy(true);modelTimer=true;thinking.start('reading',operation==='generate'?'论文导读':'上下文提问');
  let task;try{task=await api(operation,{...current(),consent:true,...args});state.task=task.id;$('cancel').hidden=false;}catch(e){modelBusy(false);throw e;}
  let failures=0,polling=false;
  const finish=()=>{state.task=null;modelBusy(false);modelTimer=null;};
  const poll=async()=>{
    if(polling||state.task!==task.id)return;polling=true;reconnectTask.hidden=true;
    let t;
    try{t=await api('task',{id:task.id},AbortSignal.timeout(15000));failures=0;}
    catch(e){polling=false;failures++;error(new Error('读取模型任务状态失败。'+(failures<=3?'正在重新连接，不会重复发送模型请求。':'请重新读取状态或取消任务；后台结果尚未确认。')));if(failures<=3)setTimeout(poll,1500*failures);else reconnectTask.hidden=false;return;}
    polling=false;
    if(t.status==='running'){thinking.status('reading','模型正在处理所选原文并复核证据');setTimeout(poll,900);return;}
    finish();
    if(t.status!=='succeeded'){error(new Error((t.error?.message??'模型任务未完成。')+(t.error?.code?' ('+t.error.code+')':'')));return;}
    try{if(state.id===t.paperId)await refreshPaper();message('模型处理完成，请逐项核对原文；模型复核不等于人工确认。');}catch(e){error(e);}
  };
  state.resumeTask=()=>{failures=0;return poll();};await poll();
}
async function ask() {const scope=$('scope').value,selected=state.questionAnchor??state.selection;if(scope==='section'&&!state.section)throw new Error('请先点击左侧章节。');if(scope==='selection'&&(!selected||selected.paperId!==state.id))throw new Error('请先选中原文。');if(!$('question').value.trim())throw new Error('请输入问题。');if(state.task||modelTimer)throw new Error('已有模型任务运行，请等待或取消。');const anchor=selected?{paperId:selected.paperId,page:selected.page,bbox:selected.bbox,quote:selected.quote}:undefined;if(state.questionAnchor)state.questionAnchor.pending=false;state.selection=null;paintPendingQuestion();hideSelectionTools();window.getSelection()?.removeAllRanges();await modelTask('ask',{scope,section:state.section,anchor,question:$('question').value,depth:'research'});}
const questions=['这段话是什么意思？','这个公式的符号、假设和作用是什么？','为什么采用这种方法？','这张图支持什么结论？','与基线的比较是否公平？','复现这个结果还缺什么？'];
for(const q of questions)$('quick-questions').append(button(q,()=>{$('question').value=q;}));
function paintPendingQuestion(){paintQuestionSelection($('question-selection-anchor'),state.questionAnchor,state.id,state.page);}
function pinQuestionSelection(){if(!state.selection?.quote)return;state.questionAnchor={...state.selection,pending:true};paintPendingQuestion();$('scope').value='selection';}
function selectionQuestion(q) {if(!state.selection)throw new Error('请先选中原文文字。');pinQuestionSelection();tab('ask');$('question').value=q;$('question').focus();message('提问范围：PDF 第 '+state.questionAnchor.page+' 页 · '+state.questionAnchor.quote.slice(0,100));}
document.querySelector('[data-tab="ask"]').addEventListener('pointerdown',pinQuestionSelection);
function safeLink(url) {try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function literatureCard(row,saved) {
  const n=el('article',undefined,'literature-card');n.append(el('h3',row.title),el('p',`${(row.authors??[]).join('、')} · ${row.year??'年份未知'} · ${row.venue??'出版来源未知'}`),el('small',`${row.sourceDatabase} · ${row.retrievedAt} · ${row.matchStatus} · ${row.availability}`));if(row.doi)n.append(el('p','DOI：'+row.doi));if(row.abstract)n.append(el('p',row.abstract));const url=safeLink(row.url);if(url){const a=el('a','打开原始来源');a.href=url;a.target='_blank';a.rel='noopener noreferrer';n.append(a);}if(!saved)n.append(button('保存文献',async()=>{await api('save-literature',{...current(),id:row.id});await refreshPaper();}));return n;
}
function renderSavedLiterature() {$('saved-literature').replaceChildren();for(const row of state.record.literature)$('saved-literature').append(literatureCard(row,true));if(!state.record.literature.length)$('saved-literature').append(el('p','尚未保存文献。离线时已保存的元数据仍可使用。'));}
async function searchLiterature() {
  current();state.literature?.abort();const controller=new AbortController();state.literature=controller;$('cancel-literature').hidden=false;$('literature-status').textContent='正在检索相关文献…';const id=state.id;
  try{const result=await api('literature-search',{database:$('database').value,query:$('literature-query').value},controller.signal);if(state.id!==id)return;$('literature-results').replaceChildren();for(const row of result.candidates??[])$('literature-results').append(literatureCard(row,false));$('literature-status').textContent=`${result.candidates?.length??0} 条候选${result.cached?'（十分钟缓存）':''}，需核对标题、作者和 DOI。${result.candidates?.length?'':'真实来源返回无结果，请更换标题或关键词。'}`;}catch(e){$('literature-status').textContent=controller.signal.aborted?'检索已取消。':chineseError(e);$('literature-status').classList.add('research-error');}finally{if(state.literature===controller){state.literature=null;$('cancel-literature').hidden=true;}}
}
function exportFile(bib=false) {current();const url=new URL(bib?'export.bib':'export.md',location.href);url.searchParams.set('paperId',state.id);const a=el('a');a.href=url.href;a.download='论文导读-'+state.id+(bib?'.bib':'.md');document.body.append(a);a.click();a.remove();}
async function models(provider,selected) {const rows=provider?await api('models',{provider}):[];$('model').replaceChildren(el('option','选择模型'));$('model').firstChild.value='';for(const r of rows){const id=typeof r==='string'?r:r.id??r.name??r.model;const n=el('option',typeof r==='string'?r:r.name??r.label??id);n.value=id;$('model').append(n);}if(selected)$('model').value=selected;}
async function runtime() {const s=await api('status');state.drafts=new NoteDrafts(localStorage,s.projectId);state.tabs=new PaperTabs(localStorage,s.projectId);state.maxChars=s.maxModelChars;state.restoreId=s.activePaperId;$('runtime-status').textContent=`存储：${s.storage}；解析器：${s.parser}；MCP：${s.mcp}；模型：${s.model}。`;$('data-directory').textContent='数据目录：'+s.dataDirectory;$('provider').replaceChildren(el('option','选择提供商'));$('provider').firstChild.value='';for(const r of s.providers){const id=typeof r==='string'?r:r.id??r.name;const n=el('option',typeof r==='string'?r:r.label??id);n.value=id;$('provider').append(n);}$('provider').value=s.choice.provider;await models(s.choice.provider,s.choice.model);}
bind('import-file',async()=>{const files=[...$('import-file').files];$('import-file').value='';if(!files.length)return;let last=null;const failures=[];for(const f of files){try{if(f.size>50*1024*1024)throw new Error('PDF 超过 50 MiB 限制。');message('正在导入：'+f.name);const url=new URL('api/import',location.href);url.searchParams.set('title',f.name);const response=await fetch(url,{method:'POST',headers:{'X-Paper-Guide':'1'},body:f});const data=await response.json();if(!response.ok)throw new Error(data.message);last=data.paper?.paperId??data.paperId;state.tabs.open(last);}catch(e){failures.push(f.name+'：'+chineseError(e));}}await loadPapers();if(last)await openPaper(last);if(failures.length)message(failures.join('；'),true);},'change');
$('import-button').addEventListener('click',()=>$('import-file').click());
bind('settings-toggle',()=>{if(window.parent!==window){window.parent.postMessage({type:'mimir-open-models'},'*');return;}$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));});
bind('provider',()=>models($('provider').value),'change');bind('model-save',async()=>{await api('model-choice',{provider:$('provider').value,model:$('model').value});message('已保存模型选择。');});
const toggleLibrary=()=>{const workspace=document.querySelector('.workspace');const closed=workspace.classList.toggle('library-collapsed');workspace.classList.toggle('show-library',!closed);$('paper-library').hidden=closed;$('library-toggle').setAttribute('aria-expanded',String(!closed));$('library-toggle').textContent=closed?'展开目录':'收起目录';};
bind('library-toggle',toggleLibrary);bind('library-close',toggleLibrary);
bind('analysis-toggle',()=>{const closed=document.querySelector('.workspace').classList.toggle('analysis-collapsed');$('analysis-toggle').setAttribute('aria-expanded',String(!closed));$('research-analysis').hidden=closed;$('analysis-toggle').textContent=closed?'展开助手':'收起助手';});
bind('prev',()=>render((state.requestedPage??state.page)-1));bind('next',()=>render((state.requestedPage??state.page)+1));bind('page',()=>render($('page').value),'change');bind('zoom',()=>{state.zoom=Number($('zoom').value);return render(state.requestedPage??state.page);},'change');bind('tools-enabled',async()=>{await api('reading',{...current(),page:state.page,zoom:state.zoom,enableTools:$('tools-enabled').checked});await loadPapers();},'change');
$('paper-view').addEventListener('keydown',e=>{if(e.target!==$('paper-view'))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();render((state.requestedPage??state.page)+(e.key==='ArrowRight'?1:-1)).catch(error);}});
let searchTimer;bind('search',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadEvidence(true).catch(error),200);},'input');bind('more',()=>loadEvidence(false));
bind('highlight-selection',()=>addQuickNote('highlight'));bind('annotate-selection',()=>newNote());bind('ask-selection',()=>selectionQuestion('这段话是什么意思？'));bind('explain-selection',()=>selectionQuestion('请解释选区中的术语，并区分原文定义与系统解释。'));bind('translate-selection',()=>selectionQuestion('将选区翻译为中文；保留原文证据，标明无法确认的符号。'));
bind('note-new',()=>newNote({paperId:state.id,page:state.page,bbox:[0,0,1,1],quote:''}));bind('note-save',async()=>{
  current();if(!$('note-title').value.trim())throw new Error('请先填写批注标题。');const snapshot=rememberDraft(true),key=state.draftKey,id=state.id;
  const saved=await api('annotations',{...snapshot.edit,paperId:id,action:'save',text:snapshot.text,title:snapshot.title,tags:snapshot.tags,
    expectedVersion:snapshot.edit.id?snapshot.edit.version??1:undefined,idempotencyKey:snapshot.requestKey});
  const cleared=state.drafts.complete(key,snapshot,saved);
  if(state.id===id&&state.draftKey===key){if(cleared){clearNoteEditor();}
    else state.edit={...state.drafts.get(key).edit};await refreshPaper();}
  message(cleared?'批注已保存。':'批注已保存；保存期间新增文字仍保留为草稿。');
});
bind('generate',()=>{const depth=$('depth').value;if(depth==='section'&&!state.section)throw new Error('请先点击左侧章节，再生成章节精读。');return modelTask('generate',{depth,scope:depth==='section'?'section':'paper',section:state.section});});bind('ask-button',ask);bind('cancel',async()=>{if(!state.task)return;await api('cancel',{id:state.task});await state.resumeTask?.();});
bind('verify-source',()=>{$('literature-query').value=state.record?.paper.title.slice(0,200)??'';return searchLiterature();});bind('search-literature',searchLiterature);bind('cancel-literature',()=>state.literature?.abort());bind('export-bib',()=>exportFile(true));bind('export',()=>exportFile());
let resizeTimer,lastReadingWidth=$('paper-view').clientWidth;const resizeReading=()=>{const width=$('paper-view').clientWidth;if(Math.abs(width-lastReadingWidth)<1)return;lastReadingWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(state.requestedPage??state.page).catch(error),280);};window.addEventListener('resize',resizeReading);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeReading).observe($('paper-view'));
window.addEventListener('message',event=>{if(event.source!==window.parent||event.data?.type!=='paper-guide-theme')return;const theme=event.data.dark?'dark':'light';document.documentElement.style.colorScheme=theme;document.documentElement.dataset.mimirMode=theme;for(const [key,value] of Object.entries(event.data.colors??{}))if(['bg','surface','text','muted','border','accent'].includes(key)&&CSS.supports('color',value))document.documentElement.style.setProperty('--'+key,value);});

function rememberDraft(force=false) {
  if(!state.id||!state.drafts)return;
  const text=$('note-text').value,title=$('note-title').value,tags=state.edit?.tags||'';
  if(!force&&!text&&!title)return;
  state.draftKey??=crypto.randomUUID();state.edit??={...anchor()};
  const previous=state.drafts.get(state.draftKey);
  if(previous&&previous.text===text&&previous.title===title&&previous.tags===tags)return previous;
  const row=state.drafts.save(state.draftKey,{edit:state.edit,text,title,tags,requestKey:crypto.randomUUID()});
  renderDrafts();return row;
}
function restoreDraft(key,draft) {
  rememberDraft();state.draftKey=key;state.edit={...draft.edit};$('note-text').value=draft.text;$('note-title').value=draft.title||'';
  $('note-anchor').textContent=`已恢复草稿 · PDF 第 ${draft.edit.page} 页 · ${draft.edit.quote??''}`;paintNoteSelection();renderDrafts();
}
function renderDrafts() {
  $('note-drafts').replaceChildren();
  for(const [key,draft] of state.drafts?.list(state.id)??[]){const row=el('article',undefined,'note-draft');row.append(el('small','生成时间：'+displayTime(draft.createdAt??draft.updatedAt)),button('恢复草稿：'+(draft.title||draft.text.slice(0,40)),()=>{restoreDraft(key,draft);tab('notes');}),button('彻底删除',()=>{if(!window.confirm('彻底删除这份未保存的草稿？'))return;state.drafts.remove(key);if(state.draftKey===key)clearNoteEditor();$('highlight').hidden=true;renderDrafts();}));$('note-drafts').append(row);}
}
async function proposeToWorkbench(evidenceIds,text='') {
  const id=state.id;const target=await api('workbench-target',{paperId:id});
  if(state.id!==id)return;
  if(!window.confirm(`向“${target.title}”版本 ${target.expectedVersion} 提交原文证据建议？接受建议后才写入正文。`))return;
  let proposal;
  try { proposal=await api('workbench-propose',{paperId:id,evidenceIds,text,expectedVersion:target.expectedVersion,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()}); }
  catch(e) { e.workbenchImport=true;throw e; }
  if(!proposal?.changeSetId||!proposal?.documentId||proposal.status!=='proposed')throw new Error('导入未完成：没有取得待审阅建议，请刷新后重试。');
  message('建议已提交到工作台「项目文稿 → 修改建议」。列表会自动更新，展开核对并接受后写入正文。');
}
bind('note-text',()=>rememberDraft(),'input');bind('note-title',()=>rememberDraft(),'input');
window.addEventListener('beforeunload',()=>{try{rememberDraft();}catch{}});

function clearNoteEditor(){state.edit=null;state.draftKey=null;$('note-text').value='';$('note-title').value='';$('note-selection-anchor').hidden=true;$('note-anchor').textContent='保存到当前页（页级批注）';}
function paintNoteSelection(){const a=state.edit,node=$('note-selection-anchor');node.hidden=!(a?.quote&&a.paperId===state.id&&a.page===state.page);if(node.hidden)return;const b=a.bbox;Object.assign(node.style,{left:b[0]*100+'%',top:b[1]*100+'%',width:(b[2]-b[0])*100+'%',height:(b[3]-b[1])*100+'%'});}
function selectNote(id){tab('notes');renderNotes();const card=$('note-'+id);card?.scrollIntoView({block:'nearest'});if(card){const box=card.querySelector('details');if(box)box.open=true;card.tabIndex=-1;card.focus({preventScroll:true});}}
function renderPaperTabs(rows){$('paper-tabs').replaceChildren();for(const id of state.tabs?.ids??[]){const paper=rows.find(row=>row.paperId===id);if(!paper)continue;const item=el('div',undefined,'paper-tab');const open=button(paper.title,()=>openPaper(id));open.setAttribute('aria-current',String(state.id===id));const close=button('×',()=>closePaper(id),'paper-tab-close');close.setAttribute('aria-label','关闭论文页签：'+paper.title);item.append(open,close);$('paper-tabs').append(item);}}
async function closePaper(id){rememberDraft();const next=state.tabs.close(id);librarySignature='';if(id===state.id){if(next)await openPaper(next);else{++state.revision;state.id=null;state.record=null;$('paper-delete').disabled=true;const pdf=state.pdf;state.pdf=null;await state.render.catch(()=>{});await pdf?.destroy();resetPanels();$('page-surface').hidden=true;$('empty').hidden=false;$('empty').textContent='没有打开的论文，可从目录重新打开。';$('paper-title').textContent='论文内容与工作台建议已保存在本机';$('tools-enabled').checked=false;}}await loadPapers();}
bind('paper-rename',async()=>{current();const paperId=state.id,title=window.prompt('修改论文名称（原 PDF 文件保持原样）',state.record.paper.title);if(title===null)return;await api('paper-rename',{paperId,title});librarySignature='';if(state.id===paperId)await refreshPaper();await loadPapers();$('paper-title').textContent=state.record?.paper.title??'';});
bind('paper-delete',async()=>{
  current();const paperId=state.id,version=state.record.paper.version,title=state.record.paper.title;
  if(!window.confirm('删除“'+title+'”及其本机批注、导读和导入副本？用户原始PDF保持不变；存在文稿引用或研究任务时不能删除。'))return;
  $('paper-delete').disabled=true;
  try {
    const result=await api('paper-delete',{paperId,expectedVersion:version,confirm:true});
    for(const [key] of state.drafts?.list(paperId)??[])state.drafts.remove(key);
    if(state.id===paperId)clearNoteEditor();
    await closePaper(paperId);
    message(result.cleanupComplete?'论文已删除，用户原始PDF保持不变。':'论文记录已删除，部分本机副本未清理；用户原始PDF保持不变。');
  } finally { $('paper-delete').disabled=!state.id; }
});
const researchUi=installResearchUi({$,api,el,button,message,error,state,openPaper,locate,thinking});
try {await runtime();const rows=await loadPapers();if(state.tabs.ids.length){const jump=new URL(location.href).searchParams;const requested=jump.get('paperId')??state.restoreId;await openPaper(state.tabs.ids.includes(requested)?requested:state.tabs.ids[0]);if(jump.get('evidenceId'))await locate(jump.get('evidenceId'));}else message(rows.length?'没有打开的论文，可从目录重新打开。':'业务服务已连接，请导入本地 PDF。');}catch(e){error(e);}
researchUi.history().catch(error);
setInterval(async()=>{try{const rows=await loadPapers();const p=rows.find(p=>p.paperId===state.id);if(p&&(p.version!==state.record?.paper.version||p.guideReady!==state.record?.guideReady))await refreshPaper();}catch(e){error(e);}},2500);
