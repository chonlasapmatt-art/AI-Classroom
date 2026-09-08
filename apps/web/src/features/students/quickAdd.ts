import type { SheetTable } from '../../data/spreadsheet';

/**
 * Adding children to a room, from whatever the school actually has.
 *
 * The full importer exists for the once-a-year job: a whole school's roster, column mapping, a
 * review table, four kinds of record. What a teacher or an administrator does the rest of the year
 * is add the six children who arrived this week, and for that the importer is a wizard standing
 * between them and a list they could have typed.
 *
 * So this reads the shapes that list actually comes in — one name a line, a name and a number in
 * either order, tab- or comma-separated, with or without a header row — and says what it will
 * create before it creates anything. Anything it cannot read stays a row with a reason attached
 * rather than a silent skip.
 */
export interface QuickAddRow {
  lineNumber: number;
  studentCode: string;
  displayName: string;
  /** True when the number was generated here because the list did not carry one. */
  generatedCode: boolean;
}

export interface QuickAddProblem { lineNumber: number; message: string }

export interface QuickAddPreview {
  rows: QuickAddRow[];
  problems: QuickAddProblem[];
}

const HEADER_WORDS = ['student_code', 'display_name', 'รหัส', 'ชื่อ', 'name', 'code', 'เลขประจำตัว'];

/** A cell that is a student number rather than a name: digits, dashes, at least two characters. */
function looksLikeCode(value: string): boolean {
  return /^[0-9][0-9\-/]{1,19}$/.test(value);
}

function splitCells(line: string): string[] {
  const raw = line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : [line];
  return raw.map((cell) => cell.trim().replace(/^"|"$/g, '')).filter((cell) => cell.length > 0);
}

function isHeaderLine(cells: string[]): boolean {
  const lowered = cells.map((cell) => cell.toLowerCase());
  return lowered.some((cell) => HEADER_WORDS.some((word) => cell === word || cell.includes(word)))
    && !lowered.some(looksLikeCode);
}

/**
 * The next free number in a school that numbers its students.
 *
 * A generated number is only ever a convenience for a list that arrived without one; it counts up
 * from the highest purely numeric code already in use, keeping the same width, so it slots into the
 * school's own sequence instead of inventing a second one.
 */
function nextCodeFactory(existingCodes: Set<string>): () => string {
  const numeric = [...existingCodes].filter((code) => /^\d+$/.test(code));
  const width = numeric.reduce((longest, code) => Math.max(longest, code.length), 4);
  let counter = numeric.reduce((highest, code) => Math.max(highest, Number(code)), 0);
  return () => {
    counter += 1;
    let candidate = String(counter).padStart(width, '0');
    while (existingCodes.has(candidate)) {
      counter += 1;
      candidate = String(counter).padStart(width, '0');
    }
    return candidate;
  };
}

/** The number a school would give the next child it enrols. */
export function nextStudentCode(existingCodes: Set<string>): string {
  return nextCodeFactory(new Set(existingCodes))();
}

/** Reads a pasted list. Every line is one child. */
export function previewQuickAdd(input: string, existingCodes: Set<string> = new Set()): QuickAddPreview {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const rows: QuickAddRow[] = [];
  const problems: QuickAddProblem[] = [];
  const taken = new Set(existingCodes);
  const nextCode = nextCodeFactory(taken);
  const seenNames = new Set<string>();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim().length === 0) return;
    const cells = splitCells(line);
    if (cells.length === 0) return;
    if (isHeaderLine(cells)) return;

    // Either order is accepted, because both are what a school's own list looks like: some number
    // their columns "รหัส, ชื่อ" and some the other way round.
    const codeCell = cells.find(looksLikeCode) ?? '';
    const nameCell = cells.filter((cell) => cell !== codeCell).join(' ').trim();

    if (nameCell.length < 2) {
      problems.push({ lineNumber, message: `บรรทัดนี้ยังไม่มีชื่อนักเรียน: "${line.trim()}"` });
      return;
    }
    if (seenNames.has(nameCell) && codeCell === '') {
      problems.push({ lineNumber, message: `"${nameCell}" ซ้ำกับบรรทัดก่อนหน้า` });
      return;
    }
    if (codeCell && taken.has(codeCell)) {
      problems.push({ lineNumber, message: `เลขประจำตัว ${codeCell} มีอยู่ในระบบหรือซ้ำในรายการแล้ว` });
      return;
    }

    const studentCode = codeCell || nextCode();
    taken.add(studentCode);
    seenNames.add(nameCell);
    rows.push({ lineNumber, studentCode, displayName: nameCell, generatedCode: codeCell === '' });
  });

  return { rows, problems };
}

/**
 * Reads a table that came out of a file.
 *
 * The file reader already turned a spreadsheet, a Word table or a delimited file into columns and
 * rows; naming which column holds what is the same guess as for a pasted line, so the table is
 * flattened back to lines and read by the one reader. One reader means one set of rules to trust.
 */
export function previewQuickAddTable(table: SheetTable, existingCodes: Set<string> = new Set()): QuickAddPreview {
  const lines = [table.columns, ...table.rows]
    .filter((row) => row.length > 0)
    .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'));
  return previewQuickAdd(lines.join('\n'), existingCodes);
}
