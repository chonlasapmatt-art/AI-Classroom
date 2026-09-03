// Reading a school's existing question workbook.
//
// The cases here are the ones real files actually contain, not the ones a tidy template would: Thai
// headers, an answer written as a letter or a number or the option's own text, a type column that is
// missing entirely, and a trailing blank row. Every one of them was a reason a school would have
// given up and gone back to typing questions by hand.

import { describe, expect, it } from 'vitest';
import { parseDelimited } from '../../src/data/spreadsheet';
import {
  importTemplateCsv, matchCategoryId, newCategoryNames, planColumns, planImport
} from '../../src/features/questions/questionImport';

const sheet = (text: string) => parseDelimited(text.trim(), ',');
const planOf = (text: string, subjectId: string | null = 'subject-1') => {
  const table = sheet(text);
  return planImport(table, planColumns(table.columns), subjectId);
};

describe('finding the columns', () => {
  it('recognises Thai headers', () => {
    const plan = planColumns(['คำถาม', 'ตัวเลือกA', 'ตัวเลือกB', 'เฉลย', 'คะแนน', 'หมวดหมู่']);
    expect(plan.fields.prompt).toBe(0);
    expect(plan.fields.answer).toBe(3);
    expect(plan.fields.points).toBe(4);
    expect(plan.fields.category).toBe(5);
    expect(plan.choices[0]).toBe(1);
    expect(plan.choices[1]).toBe(2);
  });

  it('recognises English headers written any which way', () => {
    const plan = planColumns(['Question', 'Choice 1', 'Choice 2', 'Answer Key', 'Difficulty']);
    expect(plan.fields.prompt).toBe(0);
    expect(plan.fields.answer).toBe(3);
    expect(plan.fields.difficulty).toBe(4);
    expect(plan.choices[0]).toBe(1);
  });

  it('says plainly when a field is not in the file', () => {
    const plan = planColumns(['คำถาม', 'เฉลย']);
    expect(plan.fields.explanation).toBe(-1);
    expect(plan.choices[3]).toBe(-1);
  });
});

describe('reading a row', () => {
  it('takes a choice question with the answer as a letter', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,ตัวเลือกC,ตัวเลือกD,เฉลย,คะแนน
เมืองหลวงของไทยคือข้อใด,เชียงใหม่,กรุงเทพมหานคร,ขอนแก่น,ภูเก็ต,B,2
`);
    expect(plan.ready).toBe(1);
    const row = plan.rows[0]!;
    expect(row.draft.questionType).toBe('multiple_choice');
    expect(row.draft.answerKey).toEqual(['b']);
    expect(row.draft.points).toBe(2);
    expect(row.draft.choices).toHaveLength(4);
  });

  it('takes the answer as a number, because that is how half of them are written', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
1+1 เท่ากับเท่าใด,2,3,1
`);
    expect(plan.rows[0]!.draft.answerKey).toEqual(['a']);
  });

  it('takes the answer as the text of the option itself', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
เมืองหลวงของไทย,เชียงใหม่,กรุงเทพมหานคร,กรุงเทพมหานคร
`);
    expect(plan.rows[0]!.draft.answerKey).toEqual(['b']);
  });

  it('reads more than one answer as a multiple-select question', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,ตัวเลือกC,ตัวเลือกD,เฉลย
ข้อใดเป็นจำนวนเฉพาะ,2,4,7,9,"A,C"
`);
    const row = plan.rows[0]!;
    expect(row.draft.questionType).toBe('multiple_select');
    expect(row.draft.answerKey).toEqual(['a', 'c']);
    expect(row.problems).toEqual([]);
  });

  it('reads a true/false row with no choices at all', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
น้ำเดือดที่ 100 องศาเซลเซียส,,,ถูก
`);
    const row = plan.rows[0]!;
    expect(row.draft.questionType).toBe('true_false');
    expect(row.draft.answerKey).toEqual(['true']);
    expect(row.problems).toEqual([]);
  });

  it('reads a short answer with more than one accepted spelling', () => {
    const plan = planOf(`
คำถาม,ชนิด,เฉลย
เมืองหลวงของญี่ปุ่นชื่ออะไร,เติมคำ,"โตเกียว,Tokyo"
`);
    const row = plan.rows[0]!;
    expect(row.draft.questionType).toBe('short_answer');
    expect(row.draft.answerKey).toEqual(['โตเกียว', 'Tokyo']);
    expect(row.problems).toEqual([]);
  });

  it('defaults points to one and difficulty to medium when the file omits them', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
ทดสอบ,ก,ข,A
`);
    expect(plan.rows[0]!.draft.points).toBe(1);
    expect(plan.rows[0]!.draft.difficulty).toBe('medium');
  });

  it('carries the subject onto every question in the file', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
ทดสอบ,ก,ข,A
`, 'subject-maths');
    expect(plan.rows[0]!.draft.subjectId).toBe('subject-maths');
  });
});

describe('what it refuses to guess at', () => {
  it('keeps a row whose answer it could not read, and says why', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
ทดสอบ,ก,ข,ไม่รู้
`);
    expect(plan.ready).toBe(0);
    expect(plan.blocked).toBe(1);
    // The row survives with its reason attached. Dropping it would leave the teacher believing the
    // whole file arrived.
    expect(plan.rows[0]!.problems.join(' ')).toContain('อ่านเฉลย');
  });

  it('keeps a row with no question text', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
,ก,ข,A
`);
    expect(plan.blocked).toBe(1);
    expect(plan.rows[0]!.problems).toContain('ยังไม่ได้พิมพ์คำถาม');
  });

  it('ignores the blank row every exported sheet ends with', () => {
    const table = sheet(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
ทดสอบ,ก,ข,A
,,,
`);
    const plan = planImport(table, planColumns(table.columns), null);
    expect(plan.rows).toHaveLength(1);
  });

  it('points a problem at a line number the teacher can find in their file', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย
ดีอยู่แล้ว,ก,ข,A
,ก,ข,A
`);
    expect(plan.rows[1]!.line).toBe(2);
  });
});

describe('categories the file mentions', () => {
  const existing = [{ id: 'cat-1', name: 'พีชคณิต' }];

  it('lists only the ones the school does not have', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย,หมวดหมู่
ก,1,2,A,พีชคณิต
ข,1,2,A,เรขาคณิต
`);
    expect(newCategoryNames(plan.rows, existing)).toEqual(['เรขาคณิต']);
  });

  it('treats case and spacing as presentation rather than as two categories', () => {
    const plan = planOf(`
คำถาม,ตัวเลือกA,ตัวเลือกB,เฉลย,หมวดหมู่
ก,1,2,A,เรขาคณิต
ข,1,2,A,เรขาคณิต
`);
    expect(newCategoryNames(plan.rows, existing)).toHaveLength(1);
    expect(matchCategoryId(' พีชคณิต ', existing)).toBe('cat-1');
  });

  it('files a question under nothing rather than guessing when the cell is empty', () => {
    expect(matchCategoryId('', existing)).toBeNull();
  });
});

describe('the template offered to a school', () => {
  it('reads back through the importer it was written for', () => {
    const table = parseDelimited(importTemplateCsv(), ',');
    const plan = planImport(table, planColumns(table.columns), null);
    // Every example row must import cleanly, or the template is teaching a format that fails.
    expect(plan.blocked).toBe(0);
    expect(plan.ready).toBe(4);
    expect(plan.rows.map((row) => row.draft.questionType)).toEqual([
      'multiple_choice', 'multiple_select', 'true_false', 'short_answer'
    ]);
  });
});
