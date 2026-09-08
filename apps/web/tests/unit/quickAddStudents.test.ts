import { describe, expect, it } from 'vitest';
import { nextStudentCode, previewQuickAdd, previewQuickAddTable } from '../../src/features/students/quickAdd';

describe('adding the children who arrived this week', () => {
  it('takes a bare list of names and numbers them from the school sequence', () => {
    const preview = previewQuickAdd('สมชาย ใจดี\nสมหญิง เก่งมาก', new Set(['0007', '0008']));
    expect(preview.rows.map((row) => row.displayName)).toEqual(['สมชาย ใจดี', 'สมหญิง เก่งมาก']);
    expect(preview.rows.map((row) => row.studentCode)).toEqual(['0009', '0010']);
    expect(preview.rows.every((row) => row.generatedCode)).toBe(true);
  });

  it('reads a number written before or after the name', () => {
    const preview = previewQuickAdd('1201,สมชาย ใจดี\nสมหญิง เก่งมาก,1202');
    expect(preview.rows[0]).toMatchObject({ studentCode: '1201', displayName: 'สมชาย ใจดี', generatedCode: false });
    expect(preview.rows[1]).toMatchObject({ studentCode: '1202', displayName: 'สมหญิง เก่งมาก', generatedCode: false });
  });

  it('skips a header row instead of turning it into a child', () => {
    const preview = previewQuickAdd('student_code,display_name\n1301,สมชาย ใจดี');
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]?.displayName).toBe('สมชาย ใจดี');
  });

  it('refuses a number already used, and says which line', () => {
    const preview = previewQuickAdd('1401,สมชาย ใจดี', new Set(['1401']));
    expect(preview.rows).toHaveLength(0);
    expect(preview.problems[0]?.lineNumber).toBe(1);
    expect(preview.problems[0]?.message).toContain('1401');
  });

  it('never issues the same generated number twice in one paste', () => {
    const preview = previewQuickAdd('เด็กหนึ่ง คนหนึ่ง\nเด็กสอง คนสอง\nเด็กสาม คนสาม');
    expect(new Set(preview.rows.map((row) => row.studentCode)).size).toBe(3);
  });

  it('reports a line that carries a number but no name', () => {
    const preview = previewQuickAdd('1501');
    expect(preview.rows).toHaveLength(0);
    expect(preview.problems).toHaveLength(1);
  });

  it('reads a table from a file the same way as a paste', () => {
    const preview = previewQuickAddTable({
      columns: ['รหัส', 'ชื่อ'],
      rows: [['1601', 'สมชาย ใจดี'], ['1602', 'สมหญิง เก่งมาก']]
    });
    expect(preview.rows.map((row) => row.studentCode)).toEqual(['1601', '1602']);
  });

  it('offers the next free number for the one-child form', () => {
    expect(nextStudentCode(new Set(['0101', '0102']))).toBe('0103');
  });
});
