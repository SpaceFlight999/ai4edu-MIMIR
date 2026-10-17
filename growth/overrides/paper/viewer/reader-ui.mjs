let sectionSequence=0;

export function disclosure(el,title,render,{className='reader-disclosure',open=false}={}) {
  const box=el('details',undefined,className);box.append(el('summary',title));box.open=open;render?.(box);return box;
}

export function headingTarget(node,prefix='reader-section') {
  node.id ||= prefix+'-'+(++sectionSequence);
  return node;
}

export function jumpToSection(node) {
  if(node.tagName==='DETAILS')node.open=true;
  for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  node.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  node.tabIndex=-1;node.focus({preventScroll:true});
}

export function titleNavigation(el,button,items,label='标题导航') {
  if(!items.length)return null;
  const nav=el('nav',undefined,'result-titles');nav.setAttribute('aria-label',label);
  const append=(target,rows)=>{for(const {title,node} of rows){headingTarget(node);const control=button(title,()=>jumpToSection(node),'result-title-link');control.setAttribute('aria-controls',node.id);target.append(control);}};
  append(nav,items.slice(0,3));
  if(items.length>3)nav.append(disclosure(el,'展开全部标题 · '+items.length,box=>append(box,items.slice(3)),{className:'title-overflow'}));
  return nav;
}

// All reading tasks share one visible region, even when tasks overlap or tabs change.
export function thinkingRegion(root,el) {
  const rows=new Map();let timer=null;
  const tick=()=>{for(const row of rows.values())row.time.textContent='MIMIR 已经思考 '+Math.max(0,Math.floor((Date.now()-row.started)/1000))+' 秒';};
  return {
    start(key,label,startedAt=Date.now()) {
      let row=rows.get(key);
      if(!row){const node=el('section',undefined,'thinking-task'),caption=el('strong',label),time=el('span',undefined,'thinking-time'),status=el('small','模型正在处理');time.dataset.mimirProcessing='true';status.setAttribute('role','status');node.append(caption,time,status);root.append(node);row={node,time,status,started:startedAt};rows.set(key,row);}
      row.started=Number.isFinite(startedAt)?startedAt:Date.now();root.hidden=false;tick();timer ||= setInterval(tick,1000);
    },
    status(key,text){const row=rows.get(key);if(row)row.status.textContent=text;},
    stop(key){const row=rows.get(key);row?.node.remove();rows.delete(key);if(!rows.size){clearInterval(timer);timer=null;root.hidden=true;}},
  };
}
