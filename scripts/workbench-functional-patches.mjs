// Narrow, idempotent patches to the partner bundle; no visual layout replacement.
import { readFileSync } from 'node:fs'
function replaceOnce(source, before, after) {
  if (source.includes(before)) {
    if (source.split(before).length !== 2) throw new Error('Ambiguous workbench functional patch')
    return source.replace(before, after)
  }
  if (!source.includes(after)) throw new Error('Workbench functional patch insertion point changed')
  return source
}
export function patchWorkbenchFunctions(source) {
  if (!source.includes('/* MIMIR_DOCUMENT_TITLE_STATE */')) {
    const start = source.indexOf('function Fhe('), end = source.indexOf('function Bhe(', start);
    if (start < 0 || end < start) throw new Error('Document title scope not found');
    let scope = source.slice(start, end);
    if ((scope.match(/r\.title/g) || []).length !== 7) throw new Error('Document title references changed');
    scope = scope.replaceAll('r.title', 'mimirDocumentTitle');
    scope = replaceOnce(scope,
      'onOpenModelSettings:i}){let s=e.source',
      'onOpenModelSettings:i}){/* MIMIR_DOCUMENT_TITLE_STATE */const[mimirDocumentTitle,mimirSetDocumentTitle]=q.useState(r.title),[mimirRenaming,mimirSetRenaming]=q.useState(false),mimirRenameBusy=q.useRef(false);let s=e.source');
    scope = replaceOnce(scope,
      '(0,w.jsx)("h1",{children:mimirDocumentTitle})',
      'w.jsx(MimirEditableDocumentTitle,{heading:true,title:mimirDocumentTitle,onRename:mimirRenameDocument,disabled:!s||p||mimirRenaming||l==="conflict"})');
    scope = replaceOnce(scope,
      '(0,w.jsx)("span",{className:"mimir-topbar-location",children:J==="document"?mimirDocumentTitle:"\\u79D1\\u7814\\u5DE5\\u4F5C\\u533A"})',
      'w.jsx(MimirEditableDocumentTitle,{className:"mimir-topbar-location",title:J==="document"?mimirDocumentTitle:"科研工作区",onRename:mimirRenameDocument,disabled:J!=="document"||!s||p||mimirRenaming||l==="conflict"})');
    const rename = readFileSync(new URL('../growth/client/document-title-controller.js', import.meta.url),'utf8')+'\nlet gn=';
    scope = replaceOnce(scope, 'let gn=(0,q.useCallback)', rename+'(0,q.useCallback)');
    source = source.slice(0,start)+scope+source.slice(end);
  }
  const renameStart=source.indexOf('async function mimirRenameDocument('),renameEnd=source.indexOf('let gn=',renameStart);
  if(renameStart<0||renameEnd<renameStart)throw new Error('Document title controller not found');
  source=source.slice(0,renameStart)+readFileSync(new URL('../growth/client/document-title-controller.js',import.meta.url),'utf8')+'\n'+source.slice(renameEnd);
  source=replaceOnce(source,'mimirRenameBusy=q.useRef(false);let s=e.source','mimirRenameBusy=q.useRef(false),mimirPendingRename=q.useRef(null);let s=e.source');
  source=replaceOnce(source,'(0,q.useEffect)(()=>{_e?.setEditable(!p)},[_e,p])','(0,q.useEffect)(()=>{_e?.setEditable(!p&&!mimirRenaming&&!mimirPendingRename.current)},[_e,p,mimirRenaming,!!mimirPendingRename.current])');
  source=replaceOnce(source,'Vc=async()=>{try{let H=await e.load(r.documentId);st.current=H.version','Vc=async()=>{try{let H=await e.load(r.documentId);mimirPendingRename.current=null;mimirSetDocumentTitle(H.title);st.current=H.version');
  source=source.replaceAll('onRename:mimirRenameDocument,disabled:', 'onRename:mimirRenameDocument,pendingTitle:mimirPendingRename.current?.title,disabled:');
  source = replaceOnce(source,
    'async propose(e){if(!$he(e))',
    `async rename(input){const saved=D3(await this.request('/rename',input));if(saved.documentId!==input.documentId||this.currentDocument&&saved.projectId!==this.currentDocument.projectId)throw new Zt('UPSTREAM_UNAVAILABLE','文稿服务返回了其他文稿。');return saved}async propose(e){if(!$he(e))`);
  source = replaceOnce(source, '["/save","/propose","/apply"].includes(e)', '["/save","/rename","/propose","/apply"].includes(e)');
  source = replaceOnce(source,
    'run(e){return this.response(this.fetcher(new URL("api/mimir/tools",this.baseURI),{method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(e)}))}',
    'run(e,t){return this.response(this.fetcher(new URL("api/mimir/tools",this.baseURI),{method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(e),signal:t}))}')
  const before = 'async function Xs(j,K){if(!a){h(!0),m(""),g("");try{let ce=await r.run(j);b(n,{...ce,operation:j.operation,request:j},K(ce)),(j.operation==="figure.plot"||j.operation==="figure.diagram")&&yP(qhe(ce)),t(await r.listFiles())}catch(ce){m(hr(ce))}finally{h(!1)}}}'
  const after = `/* MIMIR_TOOL_CANCEL */
const mimirToolRun=(0,q.useRef)(null),[mimirToolStopping,mimirSetToolStopping]=(0,q.useState)(false);
async function Xs(j,K){
  if(a||mimirToolRun.current)return;
  const entry=j.operation==='runtime.run'?{id:crypto.randomUUID(),controller:new AbortController(),stopping:false,done:false}:null;
  if(entry)mimirToolRun.current=entry;
  h(true);m('');g('');
  try{
    const ce=await r.run(entry?{...j,executionId:entry.id}:j,entry?.controller.signal);
    entry?.controller.signal.throwIfAborted();
    b(n,{...ce,operation:j.operation,request:j},K(ce));
    if(j.operation==='figure.plot'||j.operation==='figure.diagram')yP(qhe(ce));
    t(await r.listFiles());
  }catch(ce){if(!entry?.stopping)m(hr(ce));}
  finally{
    if(entry)entry.done=true;
    if(!entry?.stopping){if(mimirToolRun.current===entry)mimirToolRun.current=null;h(false);}
  }
}
async function mimirStopTool(){
  const entry=mimirToolRun.current;
  if(!entry||entry.stopping)return;
  entry.stopping=true;mimirSetToolStopping(true);
  let cancelled=false;
  try{
    const result=await r.run({operation:'runtime.cancel',executionId:entry.id});
    cancelled=result.cancelled===true;
    if(cancelled){entry.controller.abort();g('脚本已停止。');m('');}
  }catch(error){m(hr(error));}
  finally{
    entry.stopping=false;mimirSetToolStopping(false);
    if(entry.done||cancelled){if(mimirToolRun.current===entry)mimirToolRun.current=null;h(false);}
  }
}`
  source = replaceOnce(source, before, after)
  const status = String.raw`a&&(0,w.jsx)("div",{className:"mimir-tool-feedback",role:"status",children:l&&l!==n?`
  const cancelStatus = String.raw`a&&(0,w.jsxs)("div",{className:"mimir-tool-feedback",role:"status",children:[mimirToolRun.current&&(0,w.jsx)("button",{type:"button",className:"mimir-tool-secondary-button",disabled:mimirToolStopping,onClick:mimirStopTool,children:mimirToolStopping?"正在停止…":"停止脚本"}),l&&l!==n?`
  // String.raw is used for the existing escaped Chinese status tail.
  source = replaceOnce(source, status, cancelStatus)
  const statusEnd = String.raw`:"\u6B63\u5728\u5904\u7406\u2026"}),p&&`
  const cancelEnd = String.raw`:"\u6B63\u5728\u5904\u7406\u2026"]}),p&&`
  source = replaceOnce(source, statusEnd, cancelEnd)
  source = replaceOnce(source,
    'e.kind==="replaceBlockText"&&kr(e.blockId)&&an(e.before)&&an(e.after)',
    '(e.kind==="replaceBlockText"||e.kind==="appendParagraph"&&e.before===""&&typeof e.after==="string"&&!!e.after.trim())&&kr(e.blockId)&&an(e.before)&&an(e.after)')
  return source
}
