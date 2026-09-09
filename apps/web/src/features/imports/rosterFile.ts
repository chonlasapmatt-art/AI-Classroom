import { matchColumn, type SheetTable } from '../../data/spreadsheet';

/**
 * Reading a list of people out of whatever file a school actually has.
 *
 * This was the engine inside a screen of its own — "นำเข้ารายชื่อ", a place you went to, chose what
 * kind of list you were importing, and imported it, away from the screens where those people live.
 * Nobody imports a roster as an activity; they add three teachers, or the parents of one class, and
 * they are already looking at the teachers or the parents when they want to. So the engine moved
 * out of the screen and the screen went away: the same reader now sits behind a button beside each
 * "add" form.
 *
 * It reads both shapes a school's file comes in — with a header row, and without one, where the
 * columns are guessed from what the values look like — and it never writes anything itself. What it
 * produces is rows plus, for each row, the reason it would be skipped, so a person can see that
 * before deciding rather than reading "ข้าม 12 แถว" afterwards.
 */
export type RosterTarget = 'teacher' | 'parent';

export interface RosterField { key: string; label: string; required: boolean; aliases: string[] }

export interface RosterSpec {
  label: string;
  hint: string;
  fields: RosterField[];
}

export const rosterSpecs: Record<RosterTarget, RosterSpec> = {
  teacher: {
    label: 'ครู',
    hint: 'คอลัมน์ที่ใช้: teacher_code, display_name, email, subject · ไฟล์ที่ไม่มีหัวตารางก็อ่านได้',
    fields: [
      { key: 'teacherCode', label: 'รหัสครู', required: true, aliases: ['teacher_code', 'code', 'รหัสครู'] },
      { key: 'displayName', label: 'ชื่อ-สกุล', required: true, aliases: ['display_name', 'name', 'ชื่อ', 'ชื่อ-สกุล'] },
      { key: 'email', label: 'อีเมล', required: false, aliases: ['email', 'mail', 'อีเมล'] },
      { key: 'subject', label: 'กลุ่มสาระ', required: false, aliases: ['subject', 'วิชา', 'กลุ่มสาระ'] }
    ]
  },
  parent: {
    label: 'ผู้ปกครอง',
    hint: 'คอลัมน์ที่ใช้: student_code, parent_name, relationship, contact · ผูกกับนักเรียนด้วยรหัสนักเรียน',
    fields: [
      { key: 'studentCode', label: 'รหัสนักเรียน', required: true, aliases: ['student_code', 'รหัสนักเรียน'] },
      { key: 'parentName', label: 'ชื่อผู้ปกครอง', required: true, aliases: ['parent_name', 'name', 'ชื่อผู้ปกครอง'] },
      { key: 'relationship', label: 'ความสัมพันธ์', required: false, aliases: ['relationship', 'relation', 'ความสัมพันธ์'] },
      { key: 'contact', label: 'เบอร์ติดต่อ', required: false, aliases: ['contact', 'phone', 'tel', 'เบอร์', 'เบอร์ติดต่อ'] }
    ]
  }
};

export type RosterRow = Record<string, string> & { rowId: string };

export function looksLikeCode(value: string): boolean {
  const clean = value.trim();
  return /^\d{3,}$/.test(clean) || /^[a-z]{1,8}[-\s]?\d{3,}$/i.test(clean);
}

export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/** Maps both headed and header-less lists without making anybody build a mapping first. */
export function buildRosterRows(table: SheetTable, fields: RosterField[]): { rows: RosterRow[]; headerless: boolean } {
  const hasHeader = fields.some((field) => matchColumn(table.columns, field.aliases) >= 0);
  const sourceRows = hasHeader ? table.rows : [table.columns, ...table.rows];
  const width = Math.max(table.columns.length, ...sourceRows.map((row) => row.length), 0);
  const samples = sourceRows.slice(0, 20);
  const indexByField = new Map<string, number>();

  if (hasHeader) {
    for (const field of fields) indexByField.set(field.key, matchColumn(table.columns, field.aliases));
  } else {
    // No header: the columns are identified by what most of their values look like — a code column
    // is mostly codes, a contact column is mostly digits — which is how a person reads them too.
    const used = new Set<number>();
    const findColumn = (predicate: (value: string) => boolean): number => {
      for (let index = 0; index < width; index += 1) {
        if (used.has(index)) continue;
        const values = samples.map((row) => row[index] ?? '').filter((value) => value.trim().length > 0);
        if (values.length > 0 && values.filter(predicate).length / values.length >= 0.6) {
          used.add(index);
          return index;
        }
      }
      return -1;
    };
    const codeField = fields.find((field) => field.key === 'teacherCode' || field.key === 'studentCode');
    const emailField = fields.find((field) => field.key === 'email');
    const contactField = fields.find((field) => field.key === 'contact');
    const nameField = fields.find((field) => field.key === 'displayName' || field.key === 'parentName');
    if (codeField) indexByField.set(codeField.key, findColumn(looksLikeCode));
    if (emailField) indexByField.set(emailField.key, findColumn(looksLikeEmail));
    if (contactField) indexByField.set(contactField.key, findColumn((value) => /\d[\d\s-]{5,}/.test(value)));
    if (nameField) indexByField.set(nameField.key, findColumn((value) => /[\p{L}]/u.test(value) && !looksLikeCode(value)));
    for (const field of fields) {
      if (!indexByField.has(field.key)) indexByField.set(field.key, findColumn((value) => value.trim().length > 0));
    }
  }

  return {
    headerless: !hasHeader,
    rows: sourceRows
      .filter((row) => row.some((cell) => cell.trim().length > 0))
      .map((row, index) => {
        const draft: RosterRow = { rowId: `row-${index}` };
        for (const field of fields) {
          const columnIndex = indexByField.get(field.key) ?? -1;
          draft[field.key] = columnIndex >= 0 ? (row[columnIndex] ?? '').trim() : '';
        }
        return draft;
      })
  };
}

/**
 * Why one row will not be written, in the words of the person reading it.
 *
 * `knownStudentCodes` is only consulted for a parent list, where the row names a child by code and
 * a code that is not in this school links a guardian to nobody.
 */
export function rosterRowProblem(
  row: RosterRow, spec: RosterSpec, knownStudentCodes?: Set<string>
): string | null {
  const missing = spec.fields.filter((field) => field.required && !(row[field.key] ?? '').trim());
  if (missing.length > 0) return `ยังไม่มี${missing.map((field) => field.label).join(' และ ')}`;
  if (knownStudentCodes) {
    const code = (row.studentCode ?? '').trim();
    if (!knownStudentCodes.has(code)) return `ไม่พบนักเรียนรหัส ${code} ในโรงเรียนนี้`;
  }
  return null;
}
