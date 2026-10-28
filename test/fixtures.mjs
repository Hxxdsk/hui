// Small deterministic documents for integration testing, generated without external files.
export function pdfFixture() {
  const content = 'BT /F1 18 Tf 60 740 Td (Lantern PDF attachment) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let raw = '%PDF-1.4\n', offsets = [0];
  for (let i=0;i<objects.length;i++) { offsets.push(Buffer.byteLength(raw)); raw += `${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(raw);
  raw += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(raw);
}
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for(let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
export function docxFixture() {
  const entries = {
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>灯下 Word attachment</w:t></w:r></w:p></w:body></w:document>'
  };
  const locals=[], directories=[]; let offset=0;
  for(const [name,text] of Object.entries(entries)) {
    const filename=Buffer.from(name), data=Buffer.from(text), crc=crc32(data);
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(filename.length,26);
    const central=Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt32LE(crc,16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(filename.length,28); central.writeUInt32LE(offset,42);
    locals.push(local,filename,data); directories.push(central,filename); offset+=local.length+filename.length+data.length;
  }
  const directory=Buffer.concat(directories), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(3,8); end.writeUInt16LE(3,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
