// Included in the existing workbench React bundle by build-growth.mjs.
const MIMIR_DOCUMENT_INTRO = '在这里记录研究问题、实验方法和证据。选中一段，可以提出局部修改建议。';
function mimirProposalOrder(rows) {
  return rows.filter(row => row.status === 'proposed').reverse().sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}
function mimirProposalParts(row) {
  const before = row.before || '', after = row.after || '';
  const appended = before && after.startsWith(before + '\n\n');
  return {before: appended || before.trim() === MIMIR_DOCUMENT_INTRO ? '' : before,
    after: appended ? after.slice(before.length).trimStart() : after};
}
function mimirProposalTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '时间未记录';
  return new Date(value).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
}
function MimirProposalCard({proposal, disabled, onReject, onAccept}) {
  const parts = mimirProposalParts(proposal);
  const title = proposal.after.includes('研究草稿') ? '研究草稿' : '修改建议';
  return w.jsxs('details', {className:'mimir-review-card', 'data-proposal-id':proposal.changeSetId, children:[
    w.jsxs('summary', {className:'mimir-review-summary', children:[
      w.jsx('strong', {children:title}),
      w.jsxs('span', {className:'mimir-review-meta', children:['收到时间：',
        w.jsx('time', {dateTime:proposal.createdAt, title:proposal.createdAt, children:mimirProposalTime(proposal.createdAt)})]})]}),
    w.jsxs(MimirProposalContent, {proposal, parts, disabled, onReject, onAccept})
  ]});
}
function MimirProposalContent({proposal, parts, disabled, onReject, onAccept}) {
  // Keep large imported drafts out of the DOM until the user expands the card.
  const [expanded, setExpanded] = q.useState(false), ref = q.useRef(null);
  q.useEffect(() => {
    const details = ref.current?.parentElement;
    if (!details) return;
    const update = () => setExpanded(details.open);
    details.addEventListener('toggle', update); update();
    return () => details.removeEventListener('toggle', update);
  }, []);
  return w.jsx('div', {ref, className:'mimir-review-body', children:expanded ? w.jsxs(w.Fragment, {children:[
    w.jsxs('p', {className:'mimir-review-meta', children:['基于版本 ',proposal.baseVersion, proposal.reason ? ' · '+proposal.reason : '']}),
    parts.before && w.jsx('div', {className:'mimir-diff-before', children:parts.before}),
    w.jsx('div', {className:'mimir-diff-after', children:parts.after}),
    w.jsxs('div', {className:'mimir-card-actions', children:[
      w.jsx('button', {onClick:()=>onReject(proposal), children:'拒绝'}),
      w.jsx('button', {className:'primary', disabled, onClick:()=>onAccept(proposal), children:'接受修改'})]})
  ]}) : null});
}
