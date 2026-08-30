import { describe, expect, it } from 'vitest';
import {
  extensionOf, parseDocx, parsePdfText, parseTextTable, readImportFile, UnsupportedImportFile
} from '../../src/data/importParsing';

/** Builds a ZIP with stored (uncompressed) entries — enough for the reader under test. */
function buildZip(files: { name: string; content: string }[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const table = (() => {
    const values = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      values[index] = value >>> 0;
    }
    return values;
  })();
  const crc32 = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 0xff]! ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);

    const entry = new Uint8Array(46 + nameBytes.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(10, 0, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, nameBytes.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += local.length;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const all = [...chunks, ...central, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) { output.set(part, cursor); cursor += part.length; }
  return output.buffer;
}

/**
 * A stand-in for File. jsdom's own File has no text() or arrayBuffer(), and the reader is only ever
 * handed a name and some bytes, so this supplies exactly that.
 */
function fileOf(name: string, content: string | ArrayBuffer): File {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  return {
    name,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as unknown as File;
}

describe('reading plain text rosters', () => {
  it('splits columns held apart by tabs', () => {
    const table = parseTextTable('25690001\tธนกร\tศรีสุวรรณ\n25690002\tพิมพ์ชนก\tใจดี');
    expect(table.columns).toEqual(['25690001', 'ธนกร', 'ศรีสุวรรณ']);
    expect(table.rows).toEqual([['25690002', 'พิมพ์ชนก', 'ใจดี']]);
  });

  it('splits columns held apart by runs of spaces', () => {
    const table = parseTextTable('25690001   ธนกร   ศรีสุวรรณ\n25690002   พิมพ์ชนก   ใจดี');
    expect(table.rows[0]).toEqual(['25690002', 'พิมพ์ชนก', 'ใจดี']);
  });

  it('keeps a one-name-per-line list as a single column', () => {
    const table = parseTextTable('ธนกร ศรีสุวรรณ\nพิมพ์ชนก ใจดี');
    expect(table.rows).toEqual([['ธนกร ศรีสุวรรณ'], ['พิมพ์ชนก ใจดี']]);
  });

  it('falls back to the delimiter when the file has one', () => {
    const table = parseTextTable('code,name\n001,ก ข');
    expect(table.columns).toEqual(['code', 'name']);
  });
});

describe('reading a Word document', () => {
  it('reads the rows of its table', async () => {
    const xml = `<w:document><w:body><w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>รหัสนักเรียน</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ชื่อ</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>25690001</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>ธนกร ศรีสุวรรณ</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl></w:body></w:document>`;
    const table = await parseDocx(buildZip([{ name: 'word/document.xml', content: xml }]));
    expect(table.columns).toEqual(['รหัสนักเรียน', 'ชื่อ']);
    expect(table.rows).toEqual([['25690001', 'ธนกร ศรีสุวรรณ']]);
  });

  it('falls back to paragraphs when the document holds no table', async () => {
    const xml = `<w:document><w:body>
      <w:p><w:r><w:t>25690001\tธนกร\tศรีสุวรรณ</w:t></w:r></w:p>
      <w:p><w:r><w:t>25690002\tพิมพ์ชนก\tใจดี</w:t></w:r></w:p>
    </w:body></w:document>`;
    const table = await parseDocx(buildZip([{ name: 'word/document.xml', content: xml }]));
    expect(table.rows[0]).toEqual(['25690002', 'พิมพ์ชนก', 'ใจดี']);
  });
});

describe('reading a PDF that has text in it', () => {
  const pdf = [
    '%PDF-1.4',
    '4 0 obj', '<< /Length 120 >>', 'stream',
    'BT /F1 12 Tf 72 720 Td (25690001 Thanakorn Srisuwan) Tj T* (25690002 Pimchanok Jaidee) Tj ET',
    'endstream', 'endobj', '%%EOF'
  ].join('\n');

  it('pulls the lines out of the content stream', async () => {
    const text = await parsePdfText(new TextEncoder().encode(pdf).buffer as ArrayBuffer);
    expect(text).toContain('25690001 Thanakorn Srisuwan');
    expect(text).toContain('25690002 Pimchanok Jaidee');
  });

  it('marks everything read from a PDF as uncertain', async () => {
    const parsed = await readImportFile(fileOf('roster.pdf', new TextEncoder().encode(pdf).buffer as ArrayBuffer));
    expect(parsed.kind).toBe('pdf');
    expect(parsed.confidence).toBe('low');
    expect(parsed.notes.join(' ')).toContain('ตรวจสอบ');
  });
});

describe('refusing what it cannot read, by name', () => {
  it('says so for a photo of a list rather than returning nothing', async () => {
    for (const name of ['roster.png', 'roster.jpg', 'roster.jpeg', 'roster.webp']) {
      await expect(readImportFile(fileOf(name, 'not really an image'))).rejects.toThrow(UnsupportedImportFile);
    }
    await expect(readImportFile(fileOf('roster.png', 'x'))).rejects.toThrow(/รูปภาพ/);
  });

  it('says so for a scanned PDF with no text layer', async () => {
    await expect(readImportFile(fileOf('scan.pdf', '%PDF-1.4\n%%EOF'))).rejects.toThrow(/ภาพสแกน/);
  });

  it('points the old Office formats at their modern replacements', async () => {
    await expect(readImportFile(fileOf('roster.xls', 'x'))).rejects.toThrow(/\.xlsx/);
    await expect(readImportFile(fileOf('roster.doc', 'x'))).rejects.toThrow(/\.docx/);
  });

  it('reads a CSV as the ordinary case', async () => {
    const parsed = await readImportFile(fileOf('roster.csv', 'รหัสนักเรียน,ชื่อ\n25690001,ธนกร ศรีสุวรรณ'));
    expect(parsed.kind).toBe('delimited');
    expect(parsed.confidence).toBe('high');
    expect(parsed.table.rows).toEqual([['25690001', 'ธนกร ศรีสุวรรณ']]);
  });

  it('knows an extension from a name', () => {
    expect(extensionOf('Roster 2569.XLSX')).toBe('.xlsx');
    expect(extensionOf('roster')).toBe('');
  });
});
