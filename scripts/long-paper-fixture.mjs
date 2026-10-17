// Local PDF fixtures with searchable text on every page; no learner material.
export function longPaperFixture(pageCount, label) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const children = [];
  for (let page = 1; page <= pageCount; page++) {
    const pageId = objects.length + 1, streamId = pageId + 1;
    children.push(pageId + ' 0 R');
    const lines = Array.from({length:44}, (_, row) => `This synthetic paper studies a simple measurement system. Fixture ${label} page ${page} row ${row}: method evidence.`);
    const stream = 'BT /F1 9 Tf 50 750 Td ' + lines.map((line, row) => (row ? '0 -15 Td ' : '') + '(' + line + ') Tj').join(' ') + ' ET';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + streamId + ' 0 R >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  }
  objects[1] = '<< /Type /Pages /Kids [' + children.join(' ') + '] /Count ' + pageCount + ' >>';
  let pdf = '%PDF-1.4\n'; const offsets = [];
  for (const [i, object] of objects.entries()) {offsets.push(Buffer.byteLength(pdf));pdf += (i+1) + ' 0 obj\n' + object + '\nendobj\n';}
  const xref = Buffer.byteLength(pdf), size = objects.length+1;
  pdf += 'xref\n0 ' + size + '\n0000000000 65535 f \n' + offsets.map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(pdf);
}
