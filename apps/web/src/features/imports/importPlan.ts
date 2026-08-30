/**
 * Working out what a file of names actually contains.
 *
 * Everything in this module is a pure decision about text: which column is which, what a row would
 * do to the roster, and what a teacher must look at before any of it is saved. Nothing here touches
 * the database — the screen shows these decisions, the teacher corrects them, and only then does the
 * ordinary student repository run. That separation is the point: an import is a suggestion until a
 * person agrees with it.
 */

import type { SheetTable } from '../../data/spreadsheet';

export type StudentFieldKey = 'studentCode' | 'firstName' | 'lastName' | 'displayName' | 'className';
export type MappingTarget = StudentFieldKey | 'ignore';

export interface StudentFieldSpec {
  key: StudentFieldKey;
  label: string;
  aliases: string[];
}

/** The fields an imported row can fill. Aliases cover the Thai and English headers schools use. */
export const studentImportFields: StudentFieldSpec[] = [
  {
    key: 'studentCode', label: 'รหัสนักเรียน',
    aliases: ['student_code', 'studentcode', 'studentid', 'student_id', 'studentno', 'student_no', 'id',
      'code', 'no', 'รหัสนักเรียน', 'รหัสประจำตัว', 'เลขประจำตัว', 'เลขประจําตัว', 'รหัส', 'เลขที่ประจำตัว']
  },
  {
    key: 'firstName', label: 'ชื่อจริง',
    aliases: ['first_name', 'firstname', 'first', 'givenname', 'given_name', 'ชื่อจริง', 'ชื่อ', 'ชื่อต้น']
  },
  {
    key: 'lastName', label: 'นามสกุล',
    aliases: ['last_name', 'lastname', 'last', 'surname', 'familyname', 'family_name', 'นามสกุล', 'สกุล']
  },
  {
    key: 'displayName', label: 'ชื่อ-นามสกุล',
    aliases: ['display_name', 'displayname', 'fullname', 'full_name', 'name', 'studentname', 'student_name',
      'ชื่อ-นามสกุล', 'ชื่อ-สกุล', 'ชื่อนามสกุล', 'ชื่อสกุล', 'ชื่อ นามสกุล', 'ชื่อและนามสกุล']
  },
  {
    key: 'className', label: 'ห้องเรียน',
    aliases: ['class', 'classroom', 'class_name', 'classname', 'grade', 'room', 'section',
      'ห้อง', 'ห้องเรียน', 'ชั้น', 'ชั้นเรียน', 'ระดับชั้น']
  }
];

/** Columns a school often includes that this system has nowhere to put; recognised so they can be
 *  left out deliberately rather than mapped onto the wrong field. */
const ignorableAliases = ['nickname', 'nick_name', 'ชื่อเล่น', 'school', 'โรงเรียน', 'เลขที่', 'ลำดับ',
  'order', 'seq', 'gender', 'เพศ', 'birthdate', 'วันเกิด', 'address', 'ที่อยู่', 'phone', 'เบอร์', 'โทร'];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_.\-()[\]/\\]/g, '');
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** The comparison form of a student number: the same one the sign-in path uses. */
export function normalizeCode(value: string): string {
  return value.replace(/[\s-]/g, '').trim().toUpperCase();
}

function headerMatches(header: string, aliases: string[]): boolean {
  const normalized = normalizeHeader(header);
  if (normalized.length === 0) return false;
  return aliases.some((alias) => normalizeHeader(alias) === normalized);
}

const classPattern = /^(ป|ม|อ|k|g|grade|class)\s*\.?\s*\d+\s*[/\-.]?\s*\d*$/i;
const codePattern = /^[0-9]{3,}$|^[a-z]{1,4}[-\s]?[0-9]{3,}$/i;

function looksLikeClass(value: string): boolean {
  return classPattern.test(value.trim());
}

function looksLikeCode(value: string): boolean {
  const cleaned = value.replace(/[\s-]/g, '');
  return cleaned.length >= 3 && /^[0-9]+$/.test(cleaned) ? true : codePattern.test(value.trim());
}

function looksLikeName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (looksLikeClass(trimmed) || looksLikeCode(trimmed)) return false;
  return /[\p{L}]/u.test(trimmed);
}

/**
 * Decides whether the first row of a file names the columns or is already a student.
 *
 * A header row is text that matches known field names and holds no student-shaped values. A file
 * that opens straight into data — the common export from an old system — has neither.
 */
export function looksLikeHeaderRow(row: string[]): boolean {
  if (row.length === 0) return false;
  const known = row.filter((cell) =>
    studentImportFields.some((field) => headerMatches(cell, field.aliases))
    || headerMatches(cell, ignorableAliases)).length;
  if (known >= 1) return true;
  // No recognised header word: if the row carries a student number or a class it is data.
  return !row.some((cell) => looksLikeCode(cell) || looksLikeClass(cell));
}

export interface ColumnMapping {
  index: number;
  header: string;
  target: MappingTarget;
  /** True when the target came from looking at the values rather than from a header word. */
  inferred: boolean;
}

/**
 * Guesses what each column holds.
 *
 * Header words win when they exist. Otherwise the values decide: a run of digits is a student
 * number, "ป.4/1" is a class, and the remaining text columns become the name — first then last, in
 * the order they appear, which is how every Thai roster is laid out.
 */
export function suggestMapping(columns: string[], rows: string[][]): ColumnMapping[] {
  const width = Math.max(columns.length, ...rows.map((row) => row.length), 0);
  const taken = new Set<StudentFieldKey>();
  const mappings: ColumnMapping[] = [];

  for (let index = 0; index < width; index += 1) {
    const header = columns[index] ?? '';
    const field = studentImportFields.find((candidate) =>
      !taken.has(candidate.key) && headerMatches(header, candidate.aliases));
    if (field) {
      taken.add(field.key);
      mappings.push({ index, header, target: field.key, inferred: false });
      continue;
    }
    if (headerMatches(header, ignorableAliases)) {
      mappings.push({ index, header, target: 'ignore', inferred: false });
      continue;
    }
    mappings.push({ index, header, target: 'ignore', inferred: true });
  }

  // Fill whatever the headers did not by looking at the values in each unmapped column.
  const sample = rows.slice(0, 20);
  const nameColumns: number[] = [];
  for (const mapping of mappings) {
    if (!mapping.inferred) continue;
    const values = sample.map((row) => (row[mapping.index] ?? '').trim()).filter((value) => value.length > 0);
    if (values.length === 0) continue;
    const share = (predicate: (value: string) => boolean) =>
      values.filter(predicate).length / values.length;

    if (!taken.has('studentCode') && share(looksLikeCode) >= 0.6) {
      taken.add('studentCode');
      mapping.target = 'studentCode';
      continue;
    }
    if (!taken.has('className') && share(looksLikeClass) >= 0.6) {
      taken.add('className');
      mapping.target = 'className';
      continue;
    }
    if (share(looksLikeName) >= 0.6) nameColumns.push(mapping.index);
  }

  const wantsFirst = !taken.has('firstName') && !taken.has('displayName');
  const wantsLast = !taken.has('lastName') && !taken.has('displayName');
  if (nameColumns.length >= 2 && wantsFirst && wantsLast) {
    assign(mappings, nameColumns[0]!, 'firstName');
    assign(mappings, nameColumns[1]!, 'lastName');
  } else if (nameColumns.length === 1 && wantsFirst) {
    // One column of text is a whole name; the row builder splits it.
    assign(mappings, nameColumns[0]!, 'displayName');
  }

  return mappings;
}

function assign(mappings: ColumnMapping[], index: number, target: MappingTarget): void {
  const mapping = mappings.find((item) => item.index === index);
  if (mapping) mapping.target = target;
}

/** Splits "ธนกร ศรีสุวรรณ" into its two halves; anything beyond the first space is the surname. */
export function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = normalizeName(value).split(' ');
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

export type RowStatus = 'new' | 'existing' | 'changed' | 'review';
export type RowAction = 'create' | 'update' | 'skip';

export interface DraftRow {
  rowId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  className: string;
  status: RowStatus;
  action: RowAction;
  issues: string[];
  /** Id of the student this row already matches, when it matches one. */
  matchedStudentId: string | null;
  /** Set when the reader was unsure of the characters, which forces a review. */
  lowConfidence: boolean;
}

export interface ExistingStudent {
  id: string;
  studentCode: string;
  displayName: string;
}

export interface BuildOptions {
  lowConfidence?: boolean;
  knownClassNames?: string[];
}

/** Applies a mapping to the parsed table and produces the rows the preview shows. */
export function buildDraftRows(
  table: SheetTable, mappings: ColumnMapping[], headerIsData: boolean, options: BuildOptions = {}
): DraftRow[] {
  const source = headerIsData && table.columns.length > 0 ? [table.columns, ...table.rows] : table.rows;
  return source.map((row, index) => {
    const value = (target: MappingTarget): string => {
      const mapping = mappings.find((item) => item.target === target);
      return mapping ? (row[mapping.index] ?? '').trim() : '';
    };
    let firstName = normalizeName(value('firstName'));
    let lastName = normalizeName(value('lastName'));
    const whole = normalizeName(value('displayName'));
    if (!firstName && whole) {
      const split = splitFullName(whole);
      firstName = split.firstName;
      if (!lastName) lastName = split.lastName;
    }
    const draft: DraftRow = {
      rowId: `row-${index}`,
      studentCode: value('studentCode'),
      firstName,
      lastName,
      className: value('className'),
      status: 'new',
      action: 'create',
      issues: [],
      matchedStudentId: null,
      lowConfidence: options.lowConfidence === true
    };
    return draft;
  }).filter((row) => row.studentCode || row.firstName || row.lastName || row.className);
}

/** The full name a row would save, in the one shape the student record stores. */
export function displayNameOf(row: Pick<DraftRow, 'firstName' | 'lastName'>): string {
  return normalizeName(`${row.firstName} ${row.lastName}`);
}

/**
 * Decides what each row would do and what is wrong with it.
 *
 * A row that matches an existing student never becomes a silent overwrite: it is marked as already
 * present, or as carrying a change, and the teacher chooses. Anything missing, duplicated inside the
 * file, or read from an uncertain source is held for review rather than quietly dropped.
 */
export function classifyRows(rows: DraftRow[], existing: ExistingStudent[], knownClassNames: string[] = []): DraftRow[] {
  const byCode = new Map(existing.map((student) => [normalizeCode(student.studentCode), student]));
  const byName = new Map(existing.map((student) => [normalizeName(student.displayName).toLowerCase(), student]));
  const seenCodes = new Map<string, string>();
  const classSet = new Set(knownClassNames.map((name) => name.trim().toLowerCase()));

  return rows.map((row) => {
    const issues: string[] = [];
    const code = normalizeCode(row.studentCode);
    const fullName = displayNameOf(row);

    if (!code) issues.push('ไม่มีรหัสนักเรียน');
    if (!row.firstName || !row.lastName) issues.push('ชื่อไม่ครบ');
    if (code) {
      const duplicateOf = seenCodes.get(code);
      if (duplicateOf) issues.push('รหัสซ้ำในไฟล์');
      else seenCodes.set(code, row.rowId);
    }
    if (row.className && classSet.size > 0 && !classSet.has(row.className.trim().toLowerCase())) {
      issues.push('ไม่พบห้องเรียนนี้');
    }
    if (row.lowConfidence) issues.push('อ่านจากไฟล์ไม่ชัดเจน');

    const match = (code ? byCode.get(code) : undefined)
      ?? (fullName ? byName.get(fullName.toLowerCase()) : undefined);

    let status: RowStatus = 'new';
    let action: RowAction = 'create';
    if (match) {
      const sameName = normalizeName(match.displayName).toLowerCase() === fullName.toLowerCase();
      status = sameName ? 'existing' : 'changed';
      // Never overwrite by default. Bringing an existing student up to date is the teacher's call.
      action = 'skip';
      issues.push(sameName ? 'มีข้อมูลนี้อยู่แล้ว' : 'พบข้อมูลเดิม ชื่อไม่ตรงกัน');
    }
    const blocking = !code || !row.firstName || !row.lastName || issues.includes('รหัสซ้ำในไฟล์');
    if (blocking || row.lowConfidence) {
      status = 'review';
      if (blocking) action = 'skip';
    }

    return { ...row, issues, status, action, matchedStudentId: match?.id ?? null };
  });
}

export interface ImportSummary {
  total: number;
  create: number;
  update: number;
  skip: number;
  review: number;
}

export function summarize(rows: DraftRow[]): ImportSummary {
  return {
    total: rows.length,
    create: rows.filter((row) => row.action === 'create').length,
    update: rows.filter((row) => row.action === 'update').length,
    skip: rows.filter((row) => row.action === 'skip').length,
    review: rows.filter((row) => row.status === 'review').length
  };
}

/** A row is only allowed to run when it carries everything the student record needs. */
export function isRunnable(row: DraftRow): boolean {
  if (row.action === 'skip') return false;
  if (!normalizeCode(row.studentCode)) return false;
  return displayNameOf(row).length >= 2;
}

/** The error report the screen offers to download after a run. */
export function buildErrorReport(rows: DraftRow[]): string {
  const header = ['แถว', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', 'ห้องเรียน', 'สถานะ', 'สิ่งที่ต้องตรวจ'];
  const lines = rows
    .filter((row) => row.issues.length > 0 || row.action === 'skip')
    .map((row, index) => [
      String(index + 1), row.studentCode, row.firstName, row.lastName, row.className,
      row.action === 'skip' ? 'ข้าม' : row.status, row.issues.join(' / ')
    ].map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}
