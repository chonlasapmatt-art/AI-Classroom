// Reading a question bank out of the spreadsheet a school already has.
//
// Typing questions one at a time is a real barrier: a school arriving with three hundred questions
// in a workbook was being asked to retype all of them before the bank was worth anything, and most
// of them simply did not. The roster importer already reads CSV, TSV and XLSX, so this reuses that
// reader entirely and only decides what the columns mean.
//
// Nothing here writes. Every accepted row becomes an ordinary `QuestionDraft` and goes through
// `saveBankQuestion` exactly as the manual editor's rows do, so the same validation, the same
// subject-owner check and the same audit trail apply. An importer with its own write path is an
// importer that will eventually be allowed to write something the editor would have refused.

import { matchColumn, type SheetTable } from '../../data/spreadsheet';
import {
  CHOICE_IDS, MAXIMUM_CHOICES, emptyDraft, validateDraft,
  type Difficulty, type QuestionDraft, type QuestionType
} from './questionBank';

/** Every field the sheet can carry, with the header spellings a Thai school actually writes. */
const headerAliases: Record<string, string[]> = {
  prompt: ['prompt', 'question', 'คำถาม', 'โจทย์', 'ข้อคำถาม'],
  questionType: ['type', 'questiontype', 'ชนิด', 'ประเภท', 'ชนิดคำถาม', 'ประเภทข้อสอบ'],
  answer: ['answer', 'answerkey', 'correct', 'เฉลย', 'คำตอบ', 'ข้อถูก'],
  points: ['points', 'score', 'mark', 'คะแนน'],
  difficulty: ['difficulty', 'level', 'ระดับ', 'ความยาก', 'ระดับความยาก'],
  category: ['category', 'หมวด', 'หมวดหมู่', 'หมวดคำถาม'],
  gradeLevel: ['grade', 'gradelevel', 'ระดับชั้น', 'ชั้น'],
  unit: ['unit', 'chapter', 'บท', 'บทเรียน', 'หน่วย'],
  topic: ['topic', 'หัวข้อ', 'เรื่อง'],
  explanation: ['explanation', 'reason', 'คำอธิบาย', 'เหตุผล', 'อธิบาย'],
  tags: ['tags', 'tag', 'แท็ก', 'ป้ายกำกับ']
};

const choiceAliases = CHOICE_IDS.map((id, index) => [
  `choice${id}`, `choice${index + 1}`, `option${id}`, `option${index + 1}`,
  `ตัวเลือก${id.toUpperCase()}`, `ตัวเลือก${index + 1}`, `ข้อ${id.toUpperCase()}`
]);

const typeWords: Record<string, QuestionType> = {
  multiplechoice: 'multiple_choice', mc: 'multiple_choice', single: 'multiple_choice',
  ปรนัย: 'multiple_choice', เลือกตอบ: 'multiple_choice', เลือกคำตอบเดียว: 'multiple_choice',
  multipleselect: 'multiple_select', ms: 'multiple_select', multi: 'multiple_select',
  เลือกหลายข้อ: 'multiple_select', ตอบได้หลายข้อ: 'multiple_select',
  truefalse: 'true_false', tf: 'true_false', boolean: 'true_false',
  ถูกผิด: 'true_false', จริงเท็จ: 'true_false',
  shortanswer: 'short_answer', short: 'short_answer', text: 'short_answer',
  อัตนัย: 'short_answer', เติมคำ: 'short_answer', เติมคำตอบ: 'short_answer'
};

const difficultyWords: Record<string, Difficulty> = {
  easy: 'easy', e: 'easy', ง่าย: 'easy', ต่ำ: 'easy',
  medium: 'medium', m: 'medium', normal: 'medium', ปานกลาง: 'medium', กลาง: 'medium',
  hard: 'hard', h: 'hard', difficult: 'hard', ยาก: 'hard', สูง: 'hard'
};

const trueWords = ['true', 't', 'yes', 'y', '1', 'ถูก', 'จริง', 'ใช่'];
const falseWords = ['false', 'f', 'no', 'n', '0', 'ผิด', 'เท็จ', 'ไม่ใช่'];

/** Header and cell text reduced to what it means: case, spaces and separators are presentation. */
function fold(value: string): string {
  return value.toLowerCase().replace(/[\s_.\-()]/g, '').trim();
}

export interface ColumnPlan {
  /** Sheet column index per field, or -1 when the sheet does not carry it. */
  fields: Record<string, number>;
  /** Sheet column index per choice slot A–F. */
  choices: number[];
}

/**
 * Works out which column is which.
 *
 * A sheet that names nothing recognisably is not an error yet — the screen lets a teacher point the
 * columns at the right fields by hand, and this only supplies the starting guess.
 */
export function planColumns(columns: string[]): ColumnPlan {
  const fields: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    fields[field] = matchColumn(columns, aliases);
  }
  return { fields, choices: choiceAliases.map((aliases) => matchColumn(columns, aliases)) };
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : '';
}

/**
 * What kind of question this row is, guessed from the row itself when the sheet does not say.
 *
 * Most workbooks a school already has carry no type column at all: they are four columns of choices
 * and a letter. Reading the shape rather than refusing the file is the difference between an
 * importer that works on real files and one that works on the file we invented for it.
 */
function readQuestionType(raw: string, choices: string[], answer: string): QuestionType {
  const stated = typeWords[fold(raw)];
  if (stated) return stated;
  const filled = choices.filter((choice) => choice !== '').length;
  if (filled === 0) {
    const folded = fold(answer);
    return trueWords.includes(folded) || falseWords.includes(folded) ? 'true_false' : 'short_answer';
  }
  // Two answers in one cell means the row expects more than one to be picked.
  return answer.split(/[,;/|]/).filter((part) => part.trim() !== '').length > 1
    ? 'multiple_select' : 'multiple_choice';
}

/**
 * The answer cell, turned into the key the bank stores.
 *
 * Choice questions are keyed by choice id, and a teacher writes `B` or `ข้อ 2` or even the full text
 * of the option. All three are accepted, because all three are what turns up: a key that only
 * understood `b` would silently mark a whole imported paper wrong.
 */
function readAnswerKey(type: QuestionType, raw: string, choices: string[]): string[] {
  if (type === 'short_answer') {
    return raw.split(/[,;|]/).map((part) => part.trim()).filter((part) => part !== '');
  }
  if (type === 'true_false') {
    const folded = fold(raw);
    if (trueWords.includes(folded)) return ['true'];
    if (falseWords.includes(folded)) return ['false'];
    return [];
  }

  const parts = raw.split(/[,;/|]/).map((part) => part.trim()).filter((part) => part !== '');
  const keys: string[] = [];
  for (const part of parts) {
    const folded = fold(part);
    // A letter, with or without the Thai "ข้อ" in front of it.
    const letter = folded.replace(/^ข้อ/, '');
    const byLetter = CHOICE_IDS.indexOf(letter as typeof CHOICE_IDS[number]);
    if (byLetter >= 0 && byLetter < choices.length && choices[byLetter] !== '') {
      keys.push(CHOICE_IDS[byLetter]!);
      continue;
    }
    // A number: 1 is the first choice.
    const asNumber = Number(letter);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= choices.length) {
      keys.push(CHOICE_IDS[asNumber - 1]!);
      continue;
    }
    // The option's own text, which is how a teacher writes it when the columns are unlabelled.
    const byText = choices.findIndex((choice) => choice !== '' && fold(choice) === folded);
    if (byText >= 0) keys.push(CHOICE_IDS[byText]!);
  }
  return [...new Set(keys)];
}

export interface ImportedQuestion {
  /** 1-based row number in the file, so a problem can be pointed at a line the teacher can see. */
  line: number;
  draft: QuestionDraft;
  /** The category written in the sheet, before it is matched against the school's own categories. */
  categoryName: string;
  /** Empty when the row is ready to save. */
  problems: string[];
}

export interface ImportPlan {
  rows: ImportedQuestion[];
  ready: number;
  blocked: number;
}

/**
 * Turns a parsed sheet into drafts, saying for each row what still stands in the way.
 *
 * Blocked rows are kept rather than dropped. A file of three hundred questions with four bad rows is
 * a successful import and four rows to fix, and a screen that silently discarded them would leave
 * the teacher believing all three hundred arrived.
 */
export function planImport(
  table: SheetTable, plan: ColumnPlan, subjectId: string | null, skipFirstRow = false
): ImportPlan {
  const rows: ImportedQuestion[] = [];
  const body = skipFirstRow ? table.rows.slice(1) : table.rows;

  body.forEach((row, index) => {
    const prompt = cell(row, plan.fields.prompt ?? -1);
    const choiceTexts = plan.choices.slice(0, MAXIMUM_CHOICES).map((column) => cell(row, column));
    // A row with nothing in it is the blank line at the end of every exported sheet, not a mistake.
    if (prompt === '' && choiceTexts.every((choice) => choice === '')) return;

    const answerCell = cell(row, plan.fields.answer ?? -1);
    const questionType = readQuestionType(cell(row, plan.fields.questionType ?? -1), choiceTexts, answerCell);
    const pointsCell = cell(row, plan.fields.points ?? -1);
    const parsedPoints = Number(pointsCell.replace(/[^\d.]/g, ''));

    const draft: QuestionDraft = {
      ...emptyDraft(subjectId),
      questionType,
      prompt,
      gradeLevel: cell(row, plan.fields.gradeLevel ?? -1),
      unit: cell(row, plan.fields.unit ?? -1),
      topic: cell(row, plan.fields.topic ?? -1),
      explanation: cell(row, plan.fields.explanation ?? -1),
      difficulty: difficultyWords[fold(cell(row, plan.fields.difficulty ?? -1))] ?? 'medium',
      points: Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 1,
      tags: cell(row, plan.fields.tags ?? -1).split(/[,;|]/).map((tag) => tag.trim()).filter((tag) => tag !== ''),
      choices: questionType === 'short_answer' || questionType === 'true_false'
        ? []
        : choiceTexts.map((text, slot) => ({ id: CHOICE_IDS[slot]!, text })).filter((choice) => choice.text !== ''),
      answerKey: readAnswerKey(questionType, answerCell, choiceTexts)
    };

    const problems = validateDraft(draft);
    // `validateDraft` cannot know the answer cell was unreadable rather than empty, and "ยังไม่ได้
    // เลือกคำตอบ" sends a teacher looking for a checkbox that does not exist in a spreadsheet.
    if (draft.answerKey.length === 0 && answerCell !== '') {
      problems.push(`อ่านเฉลย "${answerCell}" ไม่ออก · ใช้ตัวอักษรข้อ เช่น A หรือ A,C`);
    }

    rows.push({
      line: (skipFirstRow ? index + 2 : index + 1),
      draft,
      categoryName: cell(row, plan.fields.category ?? -1),
      problems
    });
  });

  return {
    rows,
    ready: rows.filter((row) => row.problems.length === 0).length,
    blocked: rows.filter((row) => row.problems.length > 0).length
  };
}

/** The categories a file mentions that the school does not have yet. */
export function newCategoryNames(rows: ImportedQuestion[], existing: { name: string }[]): string[] {
  const known = new Set(existing.map((category) => fold(category.name)));
  const wanted = new Map<string, string>();
  for (const row of rows) {
    const name = row.categoryName.trim();
    if (name === '' || known.has(fold(name))) continue;
    // Case and spacing are presentation, so `พีชคณิต` and `พีชคณิต ` are one new category.
    if (!wanted.has(fold(name))) wanted.set(fold(name), name);
  }
  return [...wanted.values()];
}

/** Matches a sheet's category name against the school's own, ignoring case and spacing. */
export function matchCategoryId(name: string, categories: { id: string; name: string }[]): string | null {
  if (name.trim() === '') return null;
  const folded = fold(name);
  return categories.find((category) => fold(category.name) === folded)?.id ?? null;
}

/** A template a school can fill in, in the exact column order this reader understands best. */
export function importTemplateCsv(): string {
  const header = [
    'คำถาม', 'ชนิด', 'ตัวเลือกA', 'ตัวเลือกB', 'ตัวเลือกC', 'ตัวเลือกD',
    'เฉลย', 'คะแนน', 'ระดับความยาก', 'หมวดหมู่', 'ระดับชั้น', 'บทเรียน', 'หัวข้อ', 'คำอธิบาย', 'แท็ก'
  ];
  const examples = [
    ['เมืองหลวงของไทยคือข้อใด', 'ปรนัย', 'เชียงใหม่', 'กรุงเทพมหานคร', 'ขอนแก่น', 'ภูเก็ต',
      'B', '1', 'ง่าย', 'ภูมิศาสตร์', 'ป.4', 'บทที่ 1', 'จังหวัดของไทย', 'กรุงเทพฯ เป็นเมืองหลวง', 'สังคม,ภูมิศาสตร์'],
    ['ข้อใดเป็นจำนวนเฉพาะ (เลือกได้หลายข้อ)', 'เลือกหลายข้อ', '2', '4', '7', '9',
      'A,C', '2', 'ปานกลาง', 'จำนวนเฉพาะ', 'ป.6', 'บทที่ 2', 'จำนวนเฉพาะ', '2 และ 7 หารลงตัวด้วย 1 กับตัวเอง', 'คณิตศาสตร์'],
    ['น้ำเดือดที่ 100 องศาเซลเซียส', 'ถูกผิด', '', '', '', '',
      'ถูก', '1', 'ง่าย', 'สสาร', 'ม.1', 'บทที่ 3', 'สถานะของสสาร', 'ที่ความดัน 1 บรรยากาศ', 'วิทยาศาสตร์'],
    ['เมืองหลวงของญี่ปุ่นชื่ออะไร', 'เติมคำ', '', '', '', '',
      'โตเกียว,Tokyo', '1', 'ปานกลาง', 'ภูมิศาสตร์', 'ม.2', 'บทที่ 4', 'เอเชียตะวันออก', '', 'สังคม']
  ];
  // Quoted throughout: a Thai prompt with a comma in it is ordinary, and an unquoted one would split
  // into two columns and import as a different question.
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...examples].map((row) => row.map(quote).join(',')).join('\r\n');
}
