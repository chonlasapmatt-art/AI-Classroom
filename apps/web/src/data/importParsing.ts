/**
 * Turns whatever file a school actually has into a table of cells.
 *
 * Schools do not keep their roster in one tidy format. It arrives as a spreadsheet, as a Word table
 * a secretary typed, as a PDF printed from an old system, or as a photo of a printed list. This
 * module reads the ones that can be read locally and says plainly which ones cannot, because an
 * import that silently produces nothing is worse than one that refuses.
 *
 * Nothing here decides what a column means or writes a student — that is the planner's job and the
 * repository's. This layer only answers: what cells are in this file, and how sure are we?
 */

import { detectDelimiter, parseDelimited, parseXlsx, readZip, type SheetTable } from './spreadsheet';

export type ImportSourceKind = 'spreadsheet' | 'delimited' | 'document' | 'pdf' | 'image';

export interface ParsedImportFile {
  table: SheetTable;
  kind: ImportSourceKind;
  /** How much the reader trusts the cells. Anything but 'high' sends every row through review. */
  confidence: 'high' | 'low';
  /** Human-readable notes for the screen: what was read, and anything the teacher should check. */
  notes: string[];
}

export class UnsupportedImportFile extends Error {
  readonly kind: ImportSourceKind | 'unknown';
  constructor(message: string, kind: ImportSourceKind | 'unknown') {
    super(message);
    this.name = 'UnsupportedImportFile';
    this.kind = kind;
  }
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.heic'];

export function extensionOf(fileName: string): string {
  const match = /\.[a-z0-9]+$/i.exec(fileName.trim().toLowerCase());
  return match ? match[0] : '';
}

/** Every extension the reader will attempt, for the file picker's accept list. */
export const acceptedImportExtensions = '.csv,.tsv,.txt,.xlsx,.docx,.pdf';

/**
 * Splits plain text into a table. A roster pasted from a document rarely has commas; it has runs of
 * spaces or tabs holding the columns apart, so those count as separators when nothing else does.
 */
export function parseTextTable(text: string): SheetTable {
  const cleaned = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const lines = cleaned.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  const firstLine = lines[0]!;
  const hasDelimiter = /[,;\t]/.test(firstLine);
  if (hasDelimiter) return parseDelimited(cleaned, detectDelimiter(cleaned));

  const grid = lines.map((line) => line.split(/\s{2,}|\t/).map((cell) => cell.trim()).filter((cell) => cell.length > 0));
  const wide = grid.filter((row) => row.length > 1);
  // A list with one value per line is a column of names, not a table with one row per column.
  if (wide.length === 0) return { columns: [], rows: lines.map((line) => [line.trim()]) };
  const [header = [], ...body] = grid;
  return { columns: header, rows: body };
}

/** Reads the tables, then the paragraphs, out of a .docx. */
export async function parseDocx(buffer: ArrayBuffer): Promise<SheetTable> {
  const entries = await readZip(buffer);
  const documentEntry = entries.find((entry) => entry.name === 'word/document.xml');
  if (!documentEntry) throw new UnsupportedImportFile('ไฟล์ .docx นี้อ่านไม่ได้', 'document');
  const xml = new TextDecoder().decode(documentEntry.data);

  const rows: string[][] = [];
  for (const tableMatch of xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    for (const rowMatch of (tableMatch[1] ?? '').matchAll(/<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g)) {
      const cells: string[] = [];
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
        const text = [...(cellMatch[1] ?? '').matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
          .map((part) => part[1] ?? '').join('');
        cells.push(decodeXmlEntities(text).trim());
      }
      if (cells.some((cell) => cell.length > 0)) rows.push(cells);
    }
  }
  if (rows.length > 0) {
    const [header = [], ...body] = rows;
    return { columns: header, rows: body };
  }

  // No table in the document: fall back to its paragraphs, which is how a typed list usually looks.
  const paragraphs: string[] = [];
  for (const paragraphMatch of xml.matchAll(/<w:p[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const text = [...(paragraphMatch[1] ?? '').matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((part) => part[1] ?? '').join('');
    const line = decodeXmlEntities(text).trim();
    if (line.length > 0) paragraphs.push(line);
  }
  return parseTextTable(paragraphs.join('\n'));
}

async function inflate(bytes: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Undoes the two escapes a PDF string can carry that matter for a name. */
function decodePdfString(value: string): string {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\([0-7]{1,3})/g, (_match, code: string) => String.fromCharCode(parseInt(code, 8)));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/**
 * Pulls the text out of a PDF that has text in it.
 *
 * A PDF stores its page content as compressed streams of drawing operators; the ones that matter
 * here are Tj and TJ, which show a string. This walks the Flate-compressed streams, collects those
 * strings and treats a line-positioning operator as a line break. It deliberately does not attempt
 * to reconstruct columns — a name and a number that sat in separate table cells arrive as one line,
 * which is what the header-less planner is for.
 *
 * A scanned PDF holds pictures rather than text, so this finds nothing and says so.
 */
export async function parsePdfText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const latin = new TextDecoder('latin1').decode(bytes);
  const pieces: string[] = [];

  for (const match of latin.matchAll(/stream\r?\n?/g)) {
    const start = match.index! + match[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) continue;
    const slice = bytes.subarray(start, end);
    let text = '';
    try {
      const first = slice[0] ?? 0;
      const second = slice[1] ?? 0;
      // A zlib stream starts 0x78; anything else is either raw deflate or already plain text.
      const inflated = first === 0x78 && (((first << 8) + second) % 31 === 0)
        ? await inflate(slice, 'deflate')
        : await inflate(slice, 'deflate-raw').catch(() => slice);
      text = new TextDecoder('utf-8', { fatal: false }).decode(inflated);
    } catch {
      text = new TextDecoder('latin1').decode(slice);
    }
    if (!/(Tj|TJ)/.test(text)) continue;

    let line = '';
    for (const operator of text.matchAll(/\((?:[^()\\]|\\.)*\)\s*Tj|\[(?:[^\][\\]|\\.)*\]\s*TJ|T\*|\bTd\b|\bTD\b|\bET\b/g)) {
      const token = operator[0];
      if (/^(T\*|Td|TD|ET)$/.test(token.trim())) {
        if (line.trim().length > 0) { pieces.push(line.trim()); line = ''; }
        continue;
      }
      for (const literal of token.matchAll(/\((?:[^()\\]|\\.)*\)/g)) {
        line += decodePdfString(literal[0].slice(1, -1));
      }
    }
    if (line.trim().length > 0) pieces.push(line.trim());
  }

  return pieces.join('\n');
}

/**
 * Reads any file the importer accepts.
 *
 * Formats that need a service this app does not have — a photo of a list, a PDF that is only
 * pictures — are refused by name rather than returned empty, so the teacher knows to export the
 * data instead of wondering why nothing appeared.
 */
export async function readImportFile(file: File): Promise<ParsedImportFile> {
  const extension = extensionOf(file.name);

  if (IMAGE_EXTENSIONS.includes(extension)) {
    throw new UnsupportedImportFile(
      'ยังอ่านรายชื่อจากรูปภาพไม่ได้ กรุณาบันทึกเป็นไฟล์ Excel, CSV หรือ Word แล้วอัปโหลดใหม่',
      'image'
    );
  }

  if (extension === '.xlsx') {
    return { table: await parseXlsx(await file.arrayBuffer()), kind: 'spreadsheet', confidence: 'high', notes: [] };
  }
  if (extension === '.xls') {
    throw new UnsupportedImportFile('รองรับเฉพาะ .xlsx กรุณาบันทึกไฟล์เป็น .xlsx หรือ .csv', 'spreadsheet');
  }
  if (extension === '.docx') {
    const table = await parseDocx(await file.arrayBuffer());
    if (table.columns.length === 0 && table.rows.length === 0) {
      throw new UnsupportedImportFile('ไม่พบรายชื่อในไฟล์ Word นี้', 'document');
    }
    return { table, kind: 'document', confidence: 'high', notes: ['อ่านจากไฟล์ Word — ตรวจสอบการแบ่งคอลัมน์ก่อนบันทึก'] };
  }
  if (extension === '.doc') {
    throw new UnsupportedImportFile('รองรับเฉพาะ .docx กรุณาบันทึกไฟล์เป็น .docx', 'document');
  }
  if (extension === '.pdf') {
    const text = await parsePdfText(await file.arrayBuffer());
    if (text.trim().length === 0) {
      throw new UnsupportedImportFile(
        'PDF นี้เป็นภาพสแกน ยังอ่านตัวอักษรไม่ได้ กรุณาใช้ไฟล์ Excel, CSV หรือ Word แทน',
        'pdf'
      );
    }
    return {
      table: parseTextTable(text),
      kind: 'pdf',
      confidence: 'low',
      notes: ['อ่านจาก PDF ตัวอักษรอาจคลาดเคลื่อน — ทุกแถวถูกตั้งเป็น “ตรวจสอบ” ให้ตรวจก่อนบันทึก']
    };
  }

  const text = await file.text();
  if (extension === '.txt') {
    return { table: parseTextTable(text), kind: 'delimited', confidence: 'high', notes: [] };
  }
  return { table: parseDelimited(text, detectDelimiter(text)), kind: 'delimited', confidence: 'high', notes: [] };
}

