function MimirEditableDocumentTitle({title,pendingTitle,onRename,disabled,heading=false,className=''}) {
  const [editing,setEditing]=q.useState(false),[draft,setDraft]=q.useState(title),[pending,setPending]=q.useState(false),[error,setError]=q.useState('');
  const input=q.useRef(null),trigger=q.useRef(null),saving=q.useRef(false);
  q.useEffect(()=>{if(editing){input.current?.focus();input.current?.select();}},[editing]);
  q.useEffect(()=>{if(editing&&!saving.current)setDraft(title);},[title]);
  function close(){setEditing(false);setError('');requestAnimationFrame(()=>trigger.current?.focus());}
  async function save(event){
    event.preventDefault();if(saving.current||disabled)return;
    const next=draft.trim();if(!next||next.length>200||/[\u0000-\u001f\u007f]/.test(next)){setError('请输入1至200个字符的单行标题。');return;}
    saving.current=true;setPending(true);setError('');
    try{if(await onRename(next))close();else setError('标题未保存，请查看文稿提示后重试。');}
    catch{setError('标题暂未保存，请重试。');}
    finally{saving.current=false;setPending(false);}
  }
  if(editing)return w.jsxs('form',{className:'mimir-title-edit '+className,onSubmit:save,onKeyDown:event=>{if(event.key==='Escape'&&!pending){event.preventDefault();event.stopPropagation();close();}},'aria-label':'修改文稿标题',children:[
    w.jsx('input',{ref:input,value:draft,maxLength:200,disabled:pending,'aria-label':'文稿标题','aria-invalid':!!error,onChange:event=>{setDraft(event.target.value);setError('');}}),
    w.jsx('button',{type:'submit',disabled:pending||disabled||!draft.trim(),children:pending?'保存中…':'保存标题'}),
    w.jsx('button',{type:'button',disabled:pending,onClick:close,children:'取消'}),
    error&&w.jsx('small',{role:'alert',children:error})]});
  return w.jsx(heading?'h1':'span',{className:'mimir-editable-title '+className,children:w.jsxs('button',{type:'button',ref:trigger,className:'mimir-title-trigger',disabled,onClick:()=>{setDraft(pendingTitle||title);setError('');setEditing(true);},title:'修改文稿标题','aria-label':'修改文稿标题：'+title,children:[
    w.jsx('span',{children:title}),
    !disabled&&w.jsx('svg',{width:14,height:14,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,'aria-hidden':true,children:w.jsx('path',{d:'m15 5 4 4M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15v5Z',strokeLinecap:'round',strokeLinejoin:'round'})})]})});
}
