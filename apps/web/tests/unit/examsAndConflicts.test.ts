import { describe, expect, it } from 'vitest';
import { answeredCount, examTimeRemaining, type ExamPaper } from '../../src/features/exams/exams';
import { differingFields, displayValue } from '../../src/features/operations/conflicts';

function paper(): ExamPaper {
  return {
    attemptId: 'attempt-1', expiresAt: null, serverTime: '2026-08-31T10:00:00.000Z', answers: {},
    questions: [
      { id: 'q1', position: 1, questionType: 'multiple_choice', prompt: 'ก', choices: [], points: 1 },
      { id: 'q2', position: 2, questionType: 'multiple_choice', prompt: 'ข', choices: [], points: 1 },
      { id: 'q3', position: 3, questionType: 'short_answer', prompt: 'ค', choices: [], points: 1 }
    ]
  };
}

describe('sitting an exam', () => {
  describe('the countdown', () => {
    const serverTime = '2026-08-31T10:00:00.000Z';
    const expiresAt = '2026-08-31T10:30:00.000Z';

    it('is measured against the server clock', () => {
      // A device an hour fast must still show thirty minutes: the server is what closes the attempt.
      const deviceNow = Date.parse(serverTime) + 3_600_000;
      expect(examTimeRemaining(expiresAt, serverTime, deviceNow, deviceNow)?.label).toBe('30:00');
    });

    it('counts down as real time passes', () => {
      const later = Date.parse(serverTime) + 90_000;
      expect(examTimeRemaining(expiresAt, serverTime, Date.parse(serverTime), later)?.label).toBe('28:30');
    });

    it('pads the seconds so the number does not jump about', () => {
      const later = Date.parse(serverTime) + 1_795_000;
      expect(examTimeRemaining(expiresAt, serverTime, Date.parse(serverTime), later)?.label).toBe('0:05');
    });

    it('stops at zero rather than going negative', () => {
      const past = Date.parse(serverTime) + 9_999_999;
      const result = examTimeRemaining(expiresAt, serverTime, Date.parse(serverTime), past);
      expect(result?.seconds).toBe(0);
      expect(result?.label).toBe('0:00');
    });

    it('says nothing for an exam with no duration', () => {
      expect(examTimeRemaining(null, serverTime, Date.now())).toBeNull();
    });
  });

  describe('progress', () => {
    it('counts a question as answered only when something was chosen', () => {
      expect(answeredCount(paper(), {})).toBe(0);
      expect(answeredCount(paper(), { q1: ['a'] })).toBe(1);
      expect(answeredCount(paper(), { q1: ['a'], q2: ['b'], q3: ['ดาวพุธ'] })).toBe(3);
    });

    it('does not count an empty or whitespace short answer', () => {
      expect(answeredCount(paper(), { q3: [''] })).toBe(0);
      expect(answeredCount(paper(), { q3: ['   '] })).toBe(0);
    });

    it('ignores an answer for a question not on this paper', () => {
      expect(answeredCount(paper(), { somethingElse: ['a'] })).toBe(0);
    });
  });
});

describe('deciding a sync conflict', () => {
  it('shows only what differs, because the difference is the decision', () => {
    const fields = differingFields(
      { score: 18, note: 'ตรวจแล้ว', studentId: 'student-1' },
      { score: 20, note: 'ตรวจแล้ว', studentId: 'student-1' }
    );
    expect(fields).toHaveLength(1);
    expect(fields[0]).toEqual({ key: 'score', mine: 18, theirs: 20 });
  });

  it('leaves out bookkeeping that differs on every version by definition', () => {
    const fields = differingFields(
      { score: 18, version: 3, updatedAt: '2026-08-31T09:00:00Z', id: 'a', schoolId: 's' },
      { score: 18, version: 4, updatedAt: '2026-08-31T10:00:00Z', id: 'a', schoolId: 's' }
    );
    expect(fields).toEqual([]);
  });

  it('reports a field one side has and the other does not', () => {
    const fields = differingFields({ note: 'เพิ่มหมายเหตุ' }, {});
    expect(fields).toEqual([{ key: 'note', mine: 'เพิ่มหมายเหตุ', theirs: undefined }]);
  });

  it('compares nested values rather than object identity', () => {
    expect(differingFields({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
    expect(differingFields({ tags: ['a'] }, { tags: ['b'] })).toHaveLength(1);
  });

  it('survives a payload that is missing entirely', () => {
    expect(differingFields({}, {})).toEqual([]);
  });

  describe('showing one value', () => {
    it('marks absent and empty the same way, because both mean nothing was set', () => {
      expect(displayValue(null)).toBe('—');
      expect(displayValue(undefined)).toBe('—');
      expect(displayValue('')).toBe('—');
    });

    it('keeps a zero visible, because zero is a mark', () => {
      expect(displayValue(0)).toBe('0');
      expect(displayValue(false)).toBe('false');
    });

    it('renders a nested value rather than [object Object]', () => {
      expect(displayValue({ a: 1 })).toBe('{"a":1}');
    });
  });
});
