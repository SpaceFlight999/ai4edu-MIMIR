// Saved annotations and temporary evidence locations have separate paint layers.
export function paintHighlights(layer, annotations, page, paper, onSelect) {
  layer.replaceChildren();
  const rows=[...(annotations??[])].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  for (const [index,note] of rows.entries()) {
    if (note.page !== page || note.sourceSha256 !== paper?.sourceSha256 || note.parserVersion !== paper?.parserVersion) continue;
    const box = note.bbox;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) continue;
    const [left, top, right, bottom] = box.map(value => Math.max(0, Math.min(1, value)));
    if (right <= left || bottom <= top) continue;
    const mark = layer.ownerDocument.createElement(note.kind==='highlight'?'div':'button');
    mark.className = note.kind==='highlight'?'saved-highlight':'annotation-start';
    if(note.kind!=='highlight'){mark.type='button';mark.textContent=String(index+1);mark.setAttribute('aria-label','跳到批注 '+(index+1));mark.style.setProperty('--note-color',['#486a9d','#9b5c69','#53816c','#8c6caa'][index%4]);mark.addEventListener('click',()=>onSelect?.(note.id));}
    mark.dataset.annotationId = note.id;
    Object.assign(mark.style, { left:left*100+'%', top:top*100+'%', ...(note.kind==='highlight'?{width:(right-left)*100+'%',height:(bottom-top)*100+'%'}:{}) });
    layer.append(mark);
  }
}

export function paintQuestionSelection(layer,anchor,paperId,page) {
  layer.replaceChildren();layer.hidden=!(anchor?.pending&&anchor.quote&&anchor.paperId===paperId&&anchor.page===page);
  if(layer.hidden)return;
  for(const box of anchor.rects?.length?anchor.rects:[anchor.bbox]){
    if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite))continue;
    const [left,top,right,bottom]=box.map(v=>Math.max(0,Math.min(1,v)));
    if(right<=left||bottom<=top)continue;
    const mark=layer.ownerDocument.createElement('span');mark.className='question-selection-mark';
    Object.assign(mark.style,{left:left*100+'%',top:top*100+'%',width:(right-left)*100+'%',height:(bottom-top)*100+'%'});layer.append(mark);
  }
}
