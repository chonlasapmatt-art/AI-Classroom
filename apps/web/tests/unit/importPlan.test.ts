import { describe, expect, it } from 'vitest';
import {
  buildDraftRows, buildErrorReport, classifyRows, displayNameOf, isRunnable, looksLikeHeaderRow,
  normalizeCode, splitFullName, suggestMapping, summarize, type ColumnMapping
} from '../../src/features/imports/importPlan';
import { parseTextTable } from '../../src/data/importParsing';

const roster = [
  { id: 'student-1', studentCode: '25690001', displayName: 'ธนกร ศรีสุวรรณ' },
  { id: 'student-2', studentCode: 'ป.4/1-15', displayName: 'พิมพ์ชนก ใจดี' }
];

function mappingFor(table: { columns: string[]; rows: string[][] }, headerless: boolean): ColumnMapping[] {
  return suggestMapping(headerless ? [] : table.columns, headerless ? [table.columns, ...table.rows] : table.rows);
}

describe('reading the columns of a roster file', () => {
  it('recognises Thai headers', () => {
    const columns = ['เลขประจำตัว', 'ชื่อ', 'นามสกุล', 'ห้อง'];
    const mapping = suggestMapping(columns, [['25690001', 'ธนกร', 'ศรีสุวรรณ', 'ป.4/1']]);
    expect(mapping.map((item) => item.target)).toEqual(['studentCode', 'firstName', 'lastName', 'className']);
  });

  it('recognises English headers whatever the spacing or case', () => {
    const columns = ['Student ID', 'First Name', 'Last  Name', 'Class'];
    const mapping = suggestMapping(columns, [['1001', 'Somchai', 'Jaidee', 'P4/1']]);
    expect(mapping.map((item) => item.target)).toEqual(['studentCode', 'firstName', 'lastName', 'className']);
  });

  it('leaves columns the student record has nowhere to put', () => {
    const columns = ['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ชื่อเล่น'];
    const mapping = suggestMapping(columns, [['1', '25690001', 'ธนกร ศรีสุวรรณ', 'กร']]);
    expect(mapping.map((item) => item.target)).toEqual(['ignore', 'studentCode', 'displayName', 'ignore']);
  });

  it('tells a header row apart from a first student', () => {
    expect(looksLikeHeaderRow(['รหัสนักเรียน', 'ชื่อ', 'นามสกุล'])).toBe(true);
    expect(looksLikeHeaderRow(['25690001', 'ธนกร', 'ศรีสุวรรณ', 'ป.4/1'])).toBe(false);
  });

  it('guesses the roles from the values when a file has no headers at all', () => {
    const table = parseTextTable('25690001\tธนกร\tศรีสุวรรณ\tป.4/1\n25690002\tพิมพ์ชนก\tใจดี\tป.4/1');
    const mapping = mappingFor(table, !looksLikeHeaderRow(table.columns));
    expect(mapping.map((item) => item.target)).toEqual(['studentCode', 'firstName', 'lastName', 'className']);
  });

  it('treats one column of text as a whole name and splits it', () => {
    expect(splitFullName('  ธนกร   ศรีสุวรรณ ')).toEqual({ firstName: 'ธนกร', lastName: 'ศรีสุวรรณ' });
    expect(splitFullName('ธนกร')).toEqual({ firstName: 'ธนกร', lastName: '' });
    expect(splitFullName('Somchai Jai Dee')).toEqual({ firstName: 'Somchai', lastName: 'Jai Dee' });
  });
});

describe('turning a file into rows a teacher can check', () => {
  it('fills first and last name from a single full-name column', () => {
    const table = { columns: ['รหัสนักเรียน', 'ชื่อ-นามสกุล'], rows: [['25690003', 'อารีย์ สุขใจ']] };
    const rows = buildDraftRows(table, suggestMapping(table.columns, table.rows), false);
    expect(rows[0]).toMatchObject({ studentCode: '25690003', firstName: 'อารีย์', lastName: 'สุขใจ' });
  });

  it('keeps the first line as data when the file has no header', () => {
    const table = { columns: ['25690001', 'ธนกร', 'ศรีสุวรรณ'], rows: [['25690002', 'พิมพ์ชนก', 'ใจดี']] };
    const rows = buildDraftRows(table, mappingFor(table, true), true);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.studentCode).toBe('25690001');
  });

  it('drops rows that carry nothing at all', () => {
    const table = { columns: ['รหัสนักเรียน', 'ชื่อ'], rows: [['', ''], ['25690004', 'ก้อง']] };
    const rows = buildDraftRows(table, suggestMapping(table.columns, table.rows), false);
    expect(rows).toHaveLength(1);
  });
});

describe('deciding what each row would do', () => {
  const plan = (rows: Parameters<typeof classifyRows>[0]) => classifyRows(rows, roster, ['ป.4/1']);
  const draft = (over: Partial<ReturnType<typeof buildDraftRows>[number]>) => ({
    rowId: 'row-1', studentCode: '', firstName: '', lastName: '', className: '',
    status: 'new' as const, action: 'create' as const, issues: [], matchedStudentId: null,
    lowConfidence: false, ...over
  });

  it('marks a genuinely new student as ready to create', () => {
    const [row] = plan([draft({ studentCode: '25690099', firstName: 'ใหม่', lastName: 'มาก', className: 'ป.4/1' })]);
    expect(row).toMatchObject({ status: 'new', action: 'create', issues: [] });
    expect(isRunnable(row!)).toBe(true);
  });

  it('never overwrites a student who is already on the roster', () => {
    const [row] = plan([draft({ studentCode: '25690001', firstName: 'ธนกร', lastName: 'ศรีสุวรรณ' })]);
    expect(row!.status).toBe('existing');
    expect(row!.action).toBe('skip');
    expect(row!.matchedStudentId).toBe('student-1');
  });

  it('flags a match whose name has changed rather than silently updating it', () => {
    const [row] = plan([draft({ studentCode: '25690001', firstName: 'ธนกร', lastName: 'ศรีสุวรรณดี' })]);
    expect(row!.status).toBe('changed');
    expect(row!.action).toBe('skip');
    expect(row!.issues).toContain('พบข้อมูลเดิม ชื่อไม่ตรงกัน');
  });

  it('matches an existing student whose number is written with a separator', () => {
    const [row] = plan([draft({ studentCode: 'ป.4/115', firstName: 'พิมพ์ชนก', lastName: 'ใจดี' })]);
    expect(normalizeCode('ป.4/1-15')).toBe('ป.4/115');
    expect(row!.matchedStudentId).toBe('student-2');
  });

  it('holds a row that is missing what a student record needs', () => {
    const rows = plan([
      draft({ rowId: 'a', studentCode: '', firstName: 'ไม่มี', lastName: 'รหัส' }),
      draft({ rowId: 'b', studentCode: '25690101', firstName: 'ชื่อเดียว', lastName: '' })
    ]);
    expect(rows[0]!.issues).toContain('ไม่มีรหัสนักเรียน');
    expect(rows[1]!.issues).toContain('ชื่อไม่ครบ');
    for (const row of rows) {
      expect(row.status).toBe('review');
      expect(isRunnable(row)).toBe(false);
    }
  });

  it('catches a number that repeats inside the same file', () => {
    const rows = plan([
      draft({ rowId: 'a', studentCode: '25690200', firstName: 'ก', lastName: 'ข' }),
      draft({ rowId: 'b', studentCode: '2569-0200', firstName: 'ค', lastName: 'ง' })
    ]);
    expect(rows[0]!.issues).not.toContain('รหัสซ้ำในไฟล์');
    expect(rows[1]!.issues).toContain('รหัสซ้ำในไฟล์');
    expect(rows[1]!.status).toBe('review');
  });

  it('says when a class named in the file does not exist yet', () => {
    const [row] = plan([draft({ studentCode: '25690300', firstName: 'ก', lastName: 'ข', className: 'ป.9/9' })]);
    expect(row!.issues).toContain('ไม่พบห้องเรียนนี้');
  });

  it('sends everything read from an uncertain source through review', () => {
    const [row] = plan([draft({ studentCode: '25690400', firstName: 'ก', lastName: 'ข', lowConfidence: true })]);
    expect(row!.status).toBe('review');
    expect(row!.issues).toContain('อ่านจากไฟล์ไม่ชัดเจน');
  });

  it('counts what the run would do', () => {
    const rows = plan([
      draft({ rowId: 'a', studentCode: '25690500', firstName: 'ก', lastName: 'ข' }),
      draft({ rowId: 'b', studentCode: '25690001', firstName: 'ธนกร', lastName: 'ศรีสุวรรณ' }),
      draft({ rowId: 'c', studentCode: '', firstName: '', lastName: '' })
    ]);
    const summary = summarize(rows);
    expect(summary.total).toBe(3);
    expect(summary.create).toBe(1);
    expect(summary.skip).toBe(2);
  });
});

describe('the report a teacher takes away', () => {
  it('lists only the rows that need attention, with what to check', () => {
    const rows = classifyRows([
      { rowId: 'a', studentCode: '25690600', firstName: 'ดี', lastName: 'มาก', className: '', status: 'new', action: 'create', issues: [], matchedStudentId: null, lowConfidence: false },
      { rowId: 'b', studentCode: '', firstName: 'ไม่มี', lastName: 'รหัส', className: '', status: 'new', action: 'create', issues: [], matchedStudentId: null, lowConfidence: false }
    ], roster, []);
    const report = buildErrorReport(rows);
    expect(report.split('\n')).toHaveLength(2);
    expect(report).toContain('ไม่มีรหัสนักเรียน');
    expect(report).not.toContain('25690600');
  });

  it('joins the two halves of a name the way the student record stores it', () => {
    expect(displayNameOf({ firstName: 'ธนกร', lastName: 'ศรีสุวรรณ' })).toBe('ธนกร ศรีสุวรรณ');
    expect(displayNameOf({ firstName: 'ธนกร', lastName: '' })).toBe('ธนกร');
  });
});
