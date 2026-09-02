// Formal exams, as the two screens that run them talk to the server.
//
// The whole feature turns on one decision that was made in the schema and is honoured here: the exam
// window and the countdown belong to the server. A student's device clock is theirs to change, so it
// decides nothing — `exam_access` reads now() on the server and the client renders whatever it says.
//
// The paper is a copy. Editing a bank question next term must not change what a class already sat,
// so composing an exam copies each question, and this module never sends a bank question id anywhere
// a paper is read from.

import { requireSupabase } from '../../services/supabase';
import { isPreviewActive } from '../../preview/previewMode';
import { previewExamStore } from '../../preview/previewData';

export type ExamState = 'draft' | 'scheduled' | 'open' | 'grading' | 'closed' | 'published' | 'archived';

export interface ExamAccess {
  testId: string;
  serverTime: string;
  state: ExamState;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  attemptLimit: number;
  attemptsUsed: number;
  canStart: boolean;
  activeAttemptId: string | null;
  expiresAt: string | null;
  questionCount: number;
}

export interface ExamPaperQuestion {
  id: string;
  position: number;
  questionType: string;
  prompt: string;
  choices: { id: string; text: string }[];
  points: number;
}

export interface ExamPaper {
  attemptId: string;
  expiresAt: string | null;
  serverTime: string;
  answers: Record<string, string[]>;
  questions: ExamPaperQuestion[];
}

export interface ExamRow {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string | null;
  title: string;
  testDate: string;
  maxScore: number;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  attemptLimit: number;
  instructions: string;
  examKind: string;
}

export interface ExamAttemptRow {
  id: string;
  studentId: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt: string | null;
  submittedReason: string | null;
  autoScore: number | null;
}

export const examStateLabels: Record<ExamState, string> = {
  draft: 'ฉบับร่าง', scheduled: 'ตั้งเวลาไว้', open: 'เปิดสอบอยู่', grading: 'ปิดแล้ว รอตรวจ',
  closed: 'ปิดแล้ว', published: 'ประกาศผลแล้ว', archived: 'เก็บแล้ว'
};

export const examStateTone: Record<ExamState, 'neutral' | 'info' | 'success' | 'warning'> = {
  draft: 'neutral', scheduled: 'info', open: 'success', grading: 'warning',
  closed: 'neutral', published: 'success', archived: 'neutral'
};

const messages: Record<string, string> = {
  EXAM_CLOSED: 'ข้อสอบนี้ยังไม่เปิด หรือปิดไปแล้ว',
  EXAM_NOT_FOR_YOU: 'ข้อสอบนี้ไม่ได้เปิดให้บัญชีนี้',
  EXAM_ATTEMPTS_EXHAUSTED: 'ใช้สิทธิ์สอบครบจำนวนครั้งที่กำหนดแล้ว',
  EXAM_ALREADY_TAKEN: 'มีนักเรียนเริ่มสอบไปแล้ว แก้ชุดข้อสอบไม่ได้',
  FORBIDDEN: 'ไม่มีสิทธิ์ทำรายการนี้',
  VALIDATION_ERROR: 'ข้อมูลไม่ถูกต้อง'
};

export class ExamError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExamError';
  }
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) {
    const raw = String(error.message ?? '');
    const known = Object.keys(messages).find((code) => raw.includes(code));
    throw new ExamError(known ?? 'EXAM_ERROR', known ? messages[known]! : 'ดำเนินการไม่สำเร็จ');
  }
  return data as T;
}

function toExam(row: Record<string, unknown>): ExamRow {
  return {
    id: String(row.id), schoolId: String(row.school_id), classId: String(row.class_id),
    subjectId: (row.subject_id as string | null) ?? null,
    title: String(row.title ?? ''), testDate: String(row.test_date ?? ''),
    maxScore: Number(row.max_score ?? 0), status: String(row.status ?? 'draft'),
    opensAt: (row.opens_at as string | null) ?? null,
    closesAt: (row.closes_at as string | null) ?? null,
    durationMinutes: row.duration_minutes === null || row.duration_minutes === undefined
      ? null : Number(row.duration_minutes),
    attemptLimit: Number(row.attempt_limit ?? 1),
    instructions: String(row.instructions ?? ''), examKind: String(row.exam_kind ?? 'test')
  };
}

export async function listExams(schoolId: string): Promise<ExamRow[]> {
  if (isPreviewActive()) return previewExamStore.list(schoolId);
  const { data, error } = await requireSupabase()
    .from('tests').select('*').eq('school_id', schoolId).is('deleted_at', null)
    .order('test_date', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => toExam(row as Record<string, unknown>));
}

export async function listExamAttempts(testId: string): Promise<ExamAttemptRow[]> {
  if (isPreviewActive()) return previewExamStore.attempts(testId);
  const { data, error } = await requireSupabase()
    .from('exam_attempts')
    .select('id, student_id, attempt_number, started_at, submitted_at, submitted_reason, auto_score')
    .eq('test_id', testId).order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id), studentId: String(row.student_id),
    attemptNumber: Number(row.attempt_number), startedAt: String(row.started_at),
    submittedAt: (row.submitted_at as string | null) ?? null,
    submittedReason: (row.submitted_reason as string | null) ?? null,
    autoScore: row.auto_score === null ? null : Number(row.auto_score)
  }));
}

export async function examQuestionCount(testId: string): Promise<number> {
  if (isPreviewActive()) return previewExamStore.questionCount(testId);
  const { count, error } = await requireSupabase()
    .from('exam_questions').select('id', { count: 'exact', head: true }).eq('test_id', testId);
  if (error) throw error;
  return count ?? 0;
}

export const composeExam = (testId: string, questionIds: string[]) =>
  isPreviewActive()
    ? Promise.resolve(previewExamStore.compose(testId, questionIds))
    : rpc<number>('compose_exam', { p_test_id: testId, p_question_ids: questionIds });

export const scheduleExam = (input: {
  testId: string; opensAt: string | null; closesAt: string | null;
  durationMinutes: number | null; attemptLimit: number; status: 'draft' | 'published' | 'closed';
}) => isPreviewActive()
  ? Promise.resolve(previewExamStore.schedule(input))
  : rpc<{ testId: string; state: ExamState }>('schedule_exam', {
    p_test_id: input.testId, p_opens_at: input.opensAt, p_closes_at: input.closesAt,
    p_duration_minutes: input.durationMinutes, p_attempt_limit: input.attemptLimit, p_status: input.status
  });

export const examAccess = (testId: string) => isPreviewActive()
  ? Promise.resolve(previewExamStore.access(testId))
  : rpc<ExamAccess>('exam_access', { p_test_id: testId });
export const startExamAttempt = (testId: string) =>
  isPreviewActive()
    ? Promise.resolve(previewExamStore.start(testId))
    : rpc<{ attemptId: string; expiresAt: string | null; serverTime: string; resumed: boolean }>(
      'start_exam_attempt', { p_test_id: testId }
    );
export const takeExam = (attemptId: string) => isPreviewActive()
  ? Promise.resolve(previewExamStore.take(attemptId))
  : rpc<ExamPaper>('take_exam', { p_attempt_id: attemptId });
export const submitExamAttempt = (attemptId: string, answers: Record<string, string[]>, final: boolean) =>
  isPreviewActive()
    ? Promise.resolve(previewExamStore.submit(attemptId, answers, final))
    : rpc<{ attemptId: string; submittedAt: string | null; reason: string | null; autoScore: number | null }>(
      'submit_exam_attempt', { p_attempt_id: attemptId, p_answers: answers, p_final: final }
    );

/**
 * Minutes and seconds left, measured against the server's clock.
 *
 * Same shape as the quiz countdown and for the same reason: the offset is taken when the payload
 * lands, so a device whose clock is wrong shows the time the server will actually enforce. An exam
 * is where that matters most — the difference between submitted and timed out.
 */
export function examTimeRemaining(
  expiresAt: string | null, serverTime: string, receivedAt: number, now = Date.now()
): { seconds: number; label: string } | null {
  if (!expiresAt) return null;
  const deviceAheadBy = receivedAt - Date.parse(serverTime);
  const seconds = Math.max(0, Math.round((Date.parse(expiresAt) - (now - deviceAheadBy)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return { seconds, label: `${minutes}:${String(seconds % 60).padStart(2, '0')}` };
}

/** How many of the paper's questions have an answer, for a student deciding whether to submit. */
export function answeredCount(paper: ExamPaper, answers: Record<string, string[]>): number {
  return paper.questions.filter((question) => (answers[question.id] ?? []).some((value) => value.trim() !== '')).length;
}
