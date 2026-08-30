/**
 * Reads tabular imports without any third-party dependency.
 *
 * CSV/TSV are parsed directly. XLSX is a ZIP of XML parts, so the reader walks the central
 * directory, inflates the entries it needs with DecompressionStream('deflate-raw'), and pulls the
 * shared strings plus the first worksheet. Anything unsupported fails with a readable message
 * instead of a silent empty import.
 */
export interface SheetTable { columns: string[]; rows: string[][] }

export function parseDelimited(input: string, delimiter = ','): SheetTable {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { row.push(value.trim()); value = ''; continue; }
    if (char === '\n') { row.push(value.trim()); rows.push(row); row = []; value = ''; continue; }
    value += char;
  }
  row.push(value.trim());
  rows.push(row);

  const filled = rows.filter((entry) => entry.some((cell) => cell.length > 0));
  const [header = [], ...body] = filled;
  return { columns: header, rows: body };
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

export interface ZipEntry { name: string; data: Uint8Array }

function readUint16(view: DataView, offset: number): number { return view.getUint16(offset, true); }
function readUint32(view: DataView, offset: number): number { return view.getUint32(offset, true); }

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal ZIP reader: enough of the format to open an .xlsx workbook. */
export async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let endOffset = -1;
  for (let offset = buffer.byteLength - 22; offset >= 0; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error('ไฟล์ไม่ใช่ .xlsx ที่อ่านได้');

  const entryCount = readUint16(view, endOffset + 10);
  let cursor = readUint32(view, endOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, cursor) !== 0x02014b50) break;
    const method = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const nameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localOffset = readUint32(view, cursor + 42);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    entries.push({ name, data: method === 0 ? raw : await inflateRaw(raw) });

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function columnIndexOf(reference: string): number {
  const letters = reference.replace(/\d+/g, '');
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<SheetTable> {
  const entries = await readZip(buffer);
  const decoder = new TextDecoder();
  const sheetEntry = entries.find((entry) => /^xl\/worksheets\/sheet1\.xml$/i.test(entry.name))
    ?? entries.find((entry) => /^xl\/worksheets\/.*\.xml$/i.test(entry.name));
  if (!sheetEntry) throw new Error('ไม่พบ worksheet ในไฟล์');

  const sharedEntry = entries.find((entry) => entry.name === 'xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedEntry) {
    const xml = decoder.decode(sharedEntry.data);
    for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const text = [...(match[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1] ?? '').join('');
      shared.push(decodeXml(text));
    }
  }

  const sheetXml = decoder.decode(sheetEntry.data);
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? '';
      const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? '';
      const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        ?? [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1] ?? '').join('');
      let value = decodeXml(rawValue ?? '');
      if (type === 's') value = shared[Number(value)] ?? '';
      const target = reference ? columnIndexOf(reference) : cells.length;
      while (cells.length < target) cells.push('');
      cells[target] = value.trim();
    }
    rows.push(cells);
  }

  const filled = rows.filter((row) => row.some((cell) => cell.length > 0));
  const [header = [], ...body] = filled;
  return { columns: header, rows: body };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/** Reads any supported import file into a table. */
export async function readSheetFile(file: File): Promise<SheetTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return parseXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls')) throw new Error('รองรับเฉพาะ .xlsx กรุณาบันทึกไฟล์เป็น .xlsx หรือ .csv');
  const text = await file.text();
  return parseDelimited(text, detectDelimiter(text));
}

/** Maps loosely-named header cells to the field a screen expects. */
export function matchColumn(columns: string[], candidates: string[]): number {
  const normalized = columns.map((column) => column.toLowerCase().replace(/[\s_-]/g, ''));
  for (const candidate of candidates) {
    const target = candidate.toLowerCase().replace(/[\s_-]/g, '');
    const index = normalized.indexOf(target);
    if (index >= 0) return index;
  }
  return -1;
}
