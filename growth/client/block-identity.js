// Keep existing block owners through splits and paste; only new duplicates get IDs.
function mimirBlockIdentityTransaction(transactions, previous, next, types, createId = () => crypto.randomUUID()) {
  const supported = node => types.includes(node.type.name);
  const owners = new Map();
  previous.doc.descendants((node, position) => {
    const id = node.attrs.blockId;
    if (!supported(node) || typeof id !== 'string' || !id) return;
    let mapped = position, deleted = false;
    for (const transaction of transactions) {
      const result = transaction.mapping.mapResult(mapped, 1);
      mapped = result.pos;
      deleted ||= result.deleted;
    }
    const current = deleted ? null : next.doc.nodeAt(mapped);
    if (current && supported(current) && current.attrs.blockId === id && !owners.has(id)) owners.set(id, mapped);
  });
  const reserved = new Set();
  next.doc.descendants(node => {
    if (supported(node) && typeof node.attrs.blockId === 'string' && node.attrs.blockId) reserved.add(node.attrs.blockId);
  });
  const seen = new Set(), repairs = [];
  next.doc.descendants((node, position) => {
    if (!supported(node)) return;
    const id = node.attrs.blockId;
    const valid = typeof id === 'string' && id.length > 0;
    const owner = owners.get(id);
    if (valid && (owner === undefined ? !seen.has(id) : owner === position)) {
      seen.add(id);
      return;
    }
    let replacement;
    do { replacement = createId(); } while (reserved.has(replacement));
    reserved.add(replacement);
    repairs.push({ position, id: replacement });
  });
  if (!repairs.length) return null;
  const transaction = next.tr;
  for (const repair of repairs) {
    const node = transaction.doc.nodeAt(repair.position);
    transaction.setNodeMarkup(repair.position, undefined, { ...node.attrs, blockId: repair.id });
  }
  return transaction;
}
