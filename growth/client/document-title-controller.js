async function mimirRenameDocument(title) {
  if(!s||p||Ze.current||mimirRenameBusy.current)return false;
  if(title===mimirDocumentTitle&&!mimirPendingRename.current)return true;
  mimirRenameBusy.current=true;mimirSetRenaming(true);
  const commit=async input=>{
    const saved=await e.rename(input);
    st.current=saved.version;mimirPendingRename.current=null;
    if(!Ge.current){mimirSetDocumentTitle(saved.title);o(saved.version);u('标题已保存。');}
    return saved;
  };
  const queued=async work=>{
    const previous=Fe.current;
    const operation=(async()=>{if(previous)await previous;return work();})();
    Fe.current=operation;
    try{return await operation;}finally{if(Fe.current===operation)Fe.current=null;}
  };
  try{
    // A lost response may have committed on the host. Settle that exact request
    // before resuming content saves or submitting a different title.
    if(mimirPendingRename.current){
      const saved=await queued(()=>commit(mimirPendingRename.current));
      if(saved.title===title)return true;
    }
    if(!await gn()){if(!Ze.current)u('请先完成正文保存，再修改标题。');return false;}
    const input={documentId:r.documentId,expectedVersion:st.current,title,requestId:crypto.randomUUID(),idempotencyKey:crypto.randomUUID()};
    mimirPendingRename.current=input;
    await queued(()=>commit(input));
    return true;
  }catch(error){
    if(!(error instanceof Zt)||error.code!=='UPSTREAM_UNAVAILABLE')mimirPendingRename.current=null;
    if(error instanceof Zt&&error.code==='VERSION_CONFLICT'){Ze.current=true;if(!Ge.current)c('conflict');}
    if(!Ge.current)u(mimirPendingRename.current?'标题保存结果尚未确认，正文暂时只读。请重新打开标题并保存以确认结果，或重新载入文稿。':Hi(error));return false;
  }finally{mimirRenameBusy.current=false;if(!Ge.current)mimirSetRenaming(false);}
}
