// The question bank, as a teacher's screen talks to it.
//
// Reads are ordinary queries against `question_bank` and `question_categories`, which is possible
// because both carry a staff-only policy: a student or a parent asking the same question of the same
// table is refused by the database, not by this file choosing not to ask. Writes go through
// security-definer functions, because a question carries its own answer key and deciding who may
// change one is not a decision a browser gets to make.

import { requireSupabase } from '../../services/supabase';

export type QuestionType = 'multiple_choice' | 'multiple_select' | 'true_false' | 'short_answer';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionStatus = 'active' | 'archived';

export interface QuestionChoice {
  id: string;
  text: string;
}

export interface BankQuestion {
  id: string;
  schoolId: string;
  subjectId: string | null;
  categoryId: string | null;
  gradeLevel: string;
  unit: string;
  topic: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  prompt: string;
  choices: QuestionChoice[];
  answerKey: string[];
  explanation: string;
  points: number;
  tags: string[];
  status: QuestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionCategory {
  id: string;
  schoolId: string;
  subjectId: string | null;
  name: string;
  description: string;
  position: number;
  status: QuestionStatus;
}

export const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: 'ปรนัย เลือกคำตอบเดียว',
  multiple_select: 'ปรนัย เลือกได้หลายข้อ',
  true_false: 'ถูก / ผิด',
  short_answer: 'เติมคำตอบสั้น'
};

export const difficultyLabels: Record<Difficulty, string> = {
  easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก'
};

export const difficultyTone: Record<Difficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success', medium: 'warning', hard: 'danger'
};

/** Choice ids a person reads out loud: A, B, C rather than a uuid. */
export const CHOICE_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
export const MINIMUM_CHOICES = 2;
export const MAXIMUM_CHOICES = CHOICE_IDS.length;

function toQuestion(row: Record<string, unknown>): BankQuestion {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    subjectId: (row.subject_id as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    gradeLevel: String(row.grade_level ?? ''),
    unit: String(row.unit ?? ''),
    topic: String(row.topic ?? ''),
    difficulty: (row.difficulty as Difficulty) ?? 'medium',
    questionType: (row.question_type as QuestionType) ?? 'multiple_choice',
    prompt: String(row.prompt ?? ''),
    choices: Array.isArray(row.choices) ? row.choices as QuestionChoice[] : [],
    answerKey: Array.isArray(row.answer_key) ? (row.answer_key as unknown[]).map(String) : [],
    explanation: String(row.explanation ?? ''),
    points: Number(row.points ?? 1),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String) : [],
    status: (row.status as QuestionStatus) ?? 'active',
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? '')
  };
}

function toCategory(row: Record<string, unknown>): QuestionCategory {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    subjectId: (row.subject_id as string | null) ?? null,
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    position: Number(row.position ?? 0),
    status: (row.status as QuestionStatus) ?? 'active'
  };
}

export async function listQuestionCategories(schoolId: string): Promise<QuestionCategory[]> {
  const { data, error } = await requireSupabase()
    .from('question_categories')
    .select('id, school_id, subject_id, name, description, position, status')
    .eq('school_id', schoolId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toCategory(row as Record<string, unknown>));
}

export interface QuestionFilter {
  subjectId?: string | null;
  categoryId?: string | null;
  difficulty?: Difficulty | null;
  questionType?: QuestionType | null;
  gradeLevel?: string | null;
  status?: QuestionStatus | null;
  keyword?: string | null;
}

/**
 * Questions matching a filter.
 *
 * The keyword search runs on the server rather than over a downloaded list, so a bank of a few
 * thousand questions stays usable on a classroom tablet — and so the answer key of a question nobody
 * matched never travels to the device at all.
 */
export async function listBankQuestions(
  schoolId: string, filter: QuestionFilter = {}, limit = 200
): Promise<BankQuestion[]> {
  let query = requireSupabase()
    .from('question_bank')
    .select('*')
    .eq('school_id', schoolId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (filter.subjectId) query = query.eq('subject_id', filter.subjectId);
  if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
  if (filter.difficulty) query = query.eq('difficulty', filter.difficulty);
  if (filter.questionType) query = query.eq('question_type', filter.questionType);
  if (filter.gradeLevel) query = query.eq('grade_level', filter.gradeLevel);
  query = query.eq('status', filter.status ?? 'active');
  if (filter.keyword && filter.keyword.trim()) {
    const needle = filter.keyword.trim().replace(/[%,]/g, ' ');
    query = query.or(`prompt.ilike.%${needle}%,topic.ilike.%${needle}%,unit.ilike.%${needle}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => toQuestion(row as Record<string, unknown>));
}

export interface QuestionDraft {
  id?: string;
  subjectId: string | null;
  categoryId: string | null;
  gradeLevel: string;
  unit: string;
  topic: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  prompt: string;
  choices: QuestionChoice[];
  answerKey: string[];
  explanation: string;
  points: number;
  tags: string[];
  status: QuestionStatus;
}

export function emptyDraft(subjectId: string | null = null): QuestionDraft {
  return {
    subjectId, categoryId: null, gradeLevel: '', unit: '', topic: '',
    difficulty: 'medium', questionType: 'multiple_choice', prompt: '',
    choices: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }],
    answerKey: [], explanation: '', points: 1, tags: [], status: 'active'
  };
}

/**
 * A copy of a question, ready to be edited into a different one.
 *
 * Duplicating is how a teacher writes the same question with different numbers, so the copy keeps
 * everything and drops only the identity — a copy that kept the id would overwrite the original the
 * moment it was saved.
 */
export function duplicateDraft(question: BankQuestion): QuestionDraft {
  return {
    subjectId: question.subjectId, categoryId: question.categoryId,
    gradeLevel: question.gradeLevel, unit: question.unit, topic: question.topic,
    difficulty: question.difficulty, questionType: question.questionType,
    prompt: question.prompt, choices: question.choices.map((choice) => ({ ...choice })),
    answerKey: [...question.answerKey], explanation: question.explanation,
    points: question.points, tags: [...question.tags], status: question.status
  };
}

export function toDraft(question: BankQuestion): QuestionDraft {
  return { ...duplicateDraft(question), id: question.id };
}

/**
 * What is still wrong with a draft, in the order a person would fix it.
 *
 * Returns messages rather than a boolean because "ยังบันทึกไม่ได้" tells somebody nothing. The same
 * rules hold on the server; this exists so the screen can say which one is unmet before asking.
 */
export function validateDraft(draft: QuestionDraft): string[] {
  const problems: string[] = [];
  if (draft.prompt.trim().length < 1) problems.push('ยังไม่ได้พิมพ์คำถาม');
  if (draft.points <= 0) problems.push('คะแนนต้องมากกว่า 0');

  if (draft.questionType === 'short_answer') {
    if (draft.answerKey.length === 0 || draft.answerKey.every((answer) => answer.trim() === '')) {
      problems.push('ยังไม่ได้ใส่คำตอบที่ถูกต้อง');
    }
    return problems;
  }

  const filled = draft.choices.filter((choice) => choice.text.trim() !== '');
  if (draft.questionType === 'true_false') {
    if (draft.answerKey.length !== 1) problems.push('เลือกว่าข้อนี้ถูกหรือผิด');
    return problems;
  }
  if (filled.length < MINIMUM_CHOICES) problems.push(`ต้องมีตัวเลือกอย่างน้อย ${MINIMUM_CHOICES} ข้อ`);
  if (draft.answerKey.length === 0) problems.push('ยังไม่ได้เลือกคำตอบที่ถูกต้อง');
  if (draft.questionType === 'multiple_choice' && draft.answerKey.length > 1) {
    problems.push('ข้อนี้เลือกคำตอบถูกได้ข้อเดียว');
  }
  // An answer key pointing at a choice nobody wrote marks every attempt wrong.
  const answersWithoutChoice = draft.answerKey.filter(
    (answer) => !filled.some((choice) => choice.id === answer)
  );
  if (answersWithoutChoice.length > 0) problems.push('คำตอบที่เลือกไว้ชี้ไปยังตัวเลือกที่ยังว่างอยู่');
  return problems;
}

export async function saveBankQuestion(schoolId: string, draft: QuestionDraft): Promise<string> {
  const problems = validateDraft(draft);
  if (problems.length > 0) throw new Error(problems[0]);

  const payload = {
    subjectId: draft.subjectId,
    categoryId: draft.categoryId,
    gradeLevel: draft.gradeLevel.trim(),
    unit: draft.unit.trim(),
    topic: draft.topic.trim(),
    difficulty: draft.difficulty,
    questionType: draft.questionType,
    prompt: draft.prompt.trim(),
    // Empty rows are the teacher not needing a fourth option, not a choice with no text.
    choices: draft.questionType === 'short_answer'
      ? []
      : draft.choices.filter((choice) => choice.text.trim() !== '')
        .map((choice) => ({ id: choice.id, text: choice.text.trim() })),
    answerKey: draft.answerKey.map((answer) => answer.trim()).filter((answer) => answer !== ''),
    explanation: draft.explanation.trim(),
    points: draft.points,
    tags: draft.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
    status: draft.status
  };

  const { data, error } = await requireSupabase().rpc('save_bank_question', {
    p_school_id: schoolId, p_question_id: draft.id ?? null, p_payload: payload
  });
  if (error) throw error;
  return String(data);
}

export async function archiveBankQuestion(questionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('archive_bank_question', { p_question_id: questionId });
  if (error) throw error;
}

export async function saveQuestionCategory(input: {
  schoolId: string; categoryId?: string | null; subjectId: string | null; name: string; description?: string;
}): Promise<string> {
  const { data, error } = await requireSupabase().rpc('save_question_category', {
    p_school_id: input.schoolId, p_category_id: input.categoryId ?? null,
    p_subject_id: input.subjectId, p_name: input.name, p_description: input.description ?? ''
  });
  if (error) throw error;
  return String(data);
}

export async function setQuestionCategoryStatus(categoryId: string, status: QuestionStatus): Promise<void> {
  const { error } = await requireSupabase().rpc('set_question_category_status', {
    p_category_id: categoryId, p_status: status
  });
  if (error) throw error;
}

export async function reorderQuestionCategories(schoolId: string, orderedIds: string[]): Promise<void> {
  const { error } = await requireSupabase().rpc('reorder_question_categories', {
    p_school_id: schoolId, p_ordered_ids: orderedIds
  });
  if (error) throw error;
}
