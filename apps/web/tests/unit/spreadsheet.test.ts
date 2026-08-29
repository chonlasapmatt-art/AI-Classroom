import { describe, expect, it } from 'vitest';
import { matchColumn, parseDelimited, parseXlsx } from '../../src/data/spreadsheet';

/** Builds a minimal but valid .xlsx in memory (stored entries, no compression). */
function buildXlsx(rows: string[][]): ArrayBuffer {
  const encoder = new TextEncoder();
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`;

  const files = [{ name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet) }];
  const chunks: number[] = [];
  const central: number[] = [];
  let offset = 0;

  const push = (target: number[], values: number[]) => { target.push(...values); };
  const uint16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
  const uint32 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];

  for (const file of files) {
    const nameBytes = [...encoder.encode(file.name)];
    const localHeader = [
      ...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(0), ...uint32(file.data.length), ...uint32(file.data.length),
      ...uint16(nameBytes.length), ...uint16(0), ...nameBytes
    ];
    push(chunks, localHeader);
    push(chunks, [...file.data]);
    push(central, [
      ...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(0), ...uint32(file.data.length), ...uint32(file.data.length),
      ...uint16(nameBytes.length), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0),
      ...uint32(offset), ...nameBytes
    ]);
    offset = chunks.length;
  }

  const centralOffset = chunks.length;
  push(chunks, central);
  push(chunks, [
    ...uint32(0x06054b50), ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length),
    ...uint32(central.length), ...uint32(centralOffset), ...uint16(0)
  ]);

  return new Uint8Array(chunks).buffer;
}

describe('delimited import', () => {
  it('reads a header row and body rows', () => {
    const table = parseDelimited('student_code,display_name\n25690001,ธนกร ศรีสุวรรณ\n25690002,นภัสสร ใจดี');
    expect(table.columns).toEqual(['student_code', 'display_name']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]).toEqual(['25690002', 'นภัสสร ใจดี']);
  });

  it('keeps quoted separators and escaped quotes intact', () => {
    const table = parseDelimited('name,note\n"ใจดี, ก้อง","เขียนว่า ""ดีมาก"""');
    expect(table.rows[0]).toEqual(['ใจดี, ก้อง', 'เขียนว่า "ดีมาก"']);
  });

  it('drops a UTF-8 BOM and blank lines', () => {
    const table = parseDelimited('﻿a,b\n\n1,2\n');
    expect(table.columns).toEqual(['a', 'b']);
    expect(table.rows).toEqual([['1', '2']]);
  });

  it('supports tab separated files', () => {
    const table = parseDelimited('a\tb\n1\t2', '\t');
    expect(table.rows[0]).toEqual(['1', '2']);
  });

  it('matches column names regardless of case, spacing or language', () => {
    const columns = ['Student Code', 'ชื่อ-สกุล'];
    expect(matchColumn(columns, ['student_code'])).toBe(0);
    expect(matchColumn(columns, ['display_name', 'ชื่อ-สกุล'])).toBe(1);
    expect(matchColumn(columns, ['missing'])).toBe(-1);
  });
});

describe('xlsx import', () => {
  it('reads an inline-string workbook', async () => {
    const buffer = buildXlsx([['teacher_code', 'display_name'], ['T-010', 'ครูสมชาย ใจงาม']]);
    const table = await parseXlsx(buffer);
    expect(table.columns).toEqual(['teacher_code', 'display_name']);
    expect(table.rows).toEqual([['T-010', 'ครูสมชาย ใจงาม']]);
  });

  it('rejects a file that is not a workbook', async () => {
    await expect(parseXlsx(new Uint8Array([1, 2, 3, 4]).buffer)).rejects.toThrow('ไฟล์ไม่ใช่ .xlsx ที่อ่านได้');
  });
});
