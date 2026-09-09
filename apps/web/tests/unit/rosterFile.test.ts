import { describe, expect, it } from 'vitest';
import { buildRosterRows, rosterRowProblem, rosterSpecs } from '../../src/features/imports/rosterFile';

const teacher = rosterSpecs.teacher;
const parent = rosterSpecs.parent;

describe('reading a staff list out of a file', () => {
  it('maps a file that has a header row', () => {
    const built = buildRosterRows({
      columns: ['teacher_code', 'display_name', 'email', 'subject'],
      rows: [['SC-003', 'ครูสมชาย ใจดี', 'somchai@example.ac.th', 'คณิตศาสตร์']]
    }, teacher.fields);
    expect(built.headerless).toBe(false);
    expect(built.rows[0]).toMatchObject({
      teacherCode: 'SC-003', displayName: 'ครูสมชาย ใจดี', email: 'somchai@example.ac.th', subject: 'คณิตศาสตร์'
    });
  });

  it('guesses the columns of a file with no header, from what the values look like', () => {
    // A school's own list is often just rows. The code column is mostly codes and the mail column is
    // mostly addresses, which is how a person reads it too.
    const built = buildRosterRows({
      columns: ['SC-101', 'ครูสมหญิง เก่งมาก', 'somying@example.ac.th'],
      rows: [
        ['SC-102', 'ครูมานะ จิตดี', 'mana@example.ac.th'],
        ['SC-103', 'ครูปาณี รักษา', 'panee@example.ac.th']
      ]
    }, teacher.fields);
    expect(built.headerless).toBe(true);
    expect(built.rows).toHaveLength(3);
    expect(built.rows[0]).toMatchObject({ teacherCode: 'SC-101', displayName: 'ครูสมหญิง เก่งมาก' });
    expect(built.rows[2]?.email).toBe('panee@example.ac.th');
  });

  it('drops blank lines rather than turning them into people', () => {
    const built = buildRosterRows({
      columns: ['teacher_code', 'display_name'],
      rows: [['SC-201', 'ครูอรุณ'], ['', ''], ['SC-202', 'ครูวิภา']]
    }, teacher.fields);
    expect(built.rows).toHaveLength(2);
  });
});

describe('what will not be written, and why', () => {
  it('names the missing field rather than counting the row as skipped', () => {
    const row = { rowId: 'r1', teacherCode: '', displayName: 'ครูสมชาย' };
    expect(rosterRowProblem(row, teacher)).toContain('รหัสครู');
  });

  it('passes a row that has everything required', () => {
    const row = { rowId: 'r1', teacherCode: 'SC-9', displayName: 'ครูสมชาย' };
    expect(rosterRowProblem(row, teacher)).toBeNull();
  });

  it("refuses a guardian row whose child is not in this school, by that child's code", () => {
    const row = { rowId: 'r1', studentCode: '9999', parentName: 'คุณแม่' };
    const problem = rosterRowProblem(row, parent, new Set(['0001', '0002']));
    expect(problem).toContain('9999');
  });

  it('accepts a guardian row whose child is in this school', () => {
    const row = { rowId: 'r1', studentCode: '0002', parentName: 'คุณแม่' };
    expect(rosterRowProblem(row, parent, new Set(['0001', '0002']))).toBeNull();
  });
});
