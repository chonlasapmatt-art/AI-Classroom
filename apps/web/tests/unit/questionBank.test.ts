import { describe, expect, it } from 'vitest';
import {
  duplicateDraft, emptyDraft, toDraft, validateDraft,
  type BankQuestion, type QuestionDraft
} from '../../src/features/questions/questionBank';

function question(overrides: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id: 'question-1', schoolId: 'school-1', subjectId: 'subject-1', categoryId: 'category-1',
    gradeLevel: 'ป.4', unit: 'หน่วยที่ 3', topic: 'ระบบสุริยะ', difficulty: 'medium',
    questionType: 'multiple_choice', prompt: 'ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด',
    choices: [{ id: 'a', text: 'ดาวพุธ' }, { id: 'b', text: 'ดาวศุกร์' }],
    answerKey: ['a'], explanation: 'ดาวพุธโคจรใกล้ที่สุด', points: 1, tags: ['ดาราศาสตร์'],
    status: 'active', createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  };
}

function choiceDraft(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    ...emptyDraft('subject-1'),
    prompt: 'ข้อใดถูกต้อง',
    choices: [{ id: 'a', text: 'ก' }, { id: 'b', text: 'ข' }],
    answerKey: ['a'],
    ...overrides
  };
}

describe('question bank drafts', () => {
  describe('validation', () => {
    it('names each unmet rule rather than answering with a bare no', () => {
      const problems = validateDraft(emptyDraft());
      expect(problems).toContain('ยังไม่ได้พิมพ์คำถาม');
      expect(problems.length).toBeGreaterThan(1);
    });

    it('accepts a complete multiple-choice question', () => {
      expect(validateDraft(choiceDraft())).toEqual([]);
    });

    it('refuses more than one correct answer on a single-answer question', () => {
      const problems = validateDraft(choiceDraft({ answerKey: ['a', 'b'] }));
      expect(problems).toContain('ข้อนี้เลือกคำตอบถูกได้ข้อเดียว');
    });

    it('allows several correct answers when the type says so', () => {
      expect(validateDraft(choiceDraft({ questionType: 'multiple_select', answerKey: ['a', 'b'] }))).toEqual([]);
    });

    it('catches an answer key pointing at a choice nobody wrote', () => {
      // This is the failure that marks every attempt wrong and says nothing while doing it.
      const problems = validateDraft(choiceDraft({
        choices: [{ id: 'a', text: 'ก' }, { id: 'b', text: '' }], answerKey: ['b']
      }));
      expect(problems).toContain('คำตอบที่เลือกไว้ชี้ไปยังตัวเลือกที่ยังว่างอยู่');
    });

    it('needs at least two written choices', () => {
      const problems = validateDraft(choiceDraft({
        choices: [{ id: 'a', text: 'ก' }, { id: 'b', text: '   ' }], answerKey: ['a']
      }));
      expect(problems).toContain('ต้องมีตัวเลือกอย่างน้อย 2 ข้อ');
    });

    it('asks a true/false question for exactly one answer', () => {
      expect(validateDraft(choiceDraft({ questionType: 'true_false', answerKey: [] })))
        .toContain('เลือกว่าข้อนี้ถูกหรือผิด');
      expect(validateDraft(choiceDraft({ questionType: 'true_false', answerKey: ['true'] }))).toEqual([]);
    });

    it('judges a short answer on its accepted answers, not on choices it does not have', () => {
      expect(validateDraft(choiceDraft({ questionType: 'short_answer', answerKey: [], choices: [] })))
        .toContain('ยังไม่ได้ใส่คำตอบที่ถูกต้อง');
      expect(validateDraft(choiceDraft({
        questionType: 'short_answer', answerKey: ['ดาวพุธ'], choices: []
      }))).toEqual([]);
    });

    it('rejects a question worth nothing', () => {
      expect(validateDraft(choiceDraft({ points: 0 }))).toContain('คะแนนต้องมากกว่า 0');
    });
  });

  describe('duplicating', () => {
    it('keeps everything worth keeping', () => {
      const copy = duplicateDraft(question());
      expect(copy.prompt).toBe(question().prompt);
      expect(copy.choices).toEqual(question().choices);
      expect(copy.answerKey).toEqual(question().answerKey);
      expect(copy.categoryId).toBe('category-1');
    });

    it('drops the identity, so saving the copy cannot overwrite the original', () => {
      expect(duplicateDraft(question())).not.toHaveProperty('id');
      expect(toDraft(question()).id).toBe('question-1');
    });

    it('copies the choices rather than sharing them', () => {
      const original = question();
      const copy = duplicateDraft(original);
      copy.choices[0]!.text = 'เปลี่ยนแล้ว';
      expect(original.choices[0]!.text).toBe('ดาวพุธ');
    });
  });

  describe('a new draft', () => {
    it('starts on the subject the teacher was already filtering by', () => {
      expect(emptyDraft('subject-9').subjectId).toBe('subject-9');
      expect(emptyDraft().subjectId).toBeNull();
    });

    it('offers four blank choices, which is what a paper question usually has', () => {
      expect(emptyDraft().choices).toHaveLength(4);
      expect(emptyDraft().answerKey).toEqual([]);
    });
  });
});
