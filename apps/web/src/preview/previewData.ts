import { buildFixtureData, FIXTURE_SCHOOL_ID } from '../data/fixtures/schoolFixture';
import { isPreviewActive } from './previewMode';
import type {
  BankQuestion, Difficulty, QuestionCategory, QuestionDraft, QuestionStatus, QuestionType
} from '../features/questions/questionBank';
import type {
  ExamAccess, ExamAttemptRow, ExamPaper, ExamPaperQuestion, ExamRow, ExamState
} from '../features/exams/exams';
import type {
  BoardQuestion, LeaderboardRow, QuizBoard, QuizResults, QuizSessionSummary, QuizStatus,
  ScoringMode, StudentQuizView
} from '../features/quiz/quizChallenge';

/**
 * Local-only data for the development Preview.
 *
 * The real app keeps question keys, exam attempts and live-round state behind server functions. The
 * Preview must still let a product owner exercise those screens, so this store mirrors the same
 * shapes in memory. It is deliberately isolated from Dexie, Supabase and the sync queue.
 */

const fixture = buildFixtureData();
const nowIso = () => new Date().toISOString();
const plusMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const subjectId = (code: string) => fixture.subjects.find((subject) => subject.code === code)?.id ?? null;

function requirePreview(): void {
  if (!isPreviewActive()) throw new Error('ข้อมูลเดโมนี้ใช้ได้เฉพาะในโหมด Preview');
}

const previewCategories: QuestionCategory[] = [
  { id: 'preview-category-space', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('SC'), name: 'ระบบสุริยะ', description: 'ดาวเคราะห์และการเคลื่อนที่', position: 1, status: 'active' },
  { id: 'preview-category-force', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('SC'), name: 'แรงและการเคลื่อนที่', description: 'แรงเสียดทานและแรงลัพธ์', position: 2, status: 'active' },
  { id: 'preview-category-fraction', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('MA'), name: 'เศษส่วน', description: 'การบวก ลบ คูณ หารเศษส่วน', position: 3, status: 'active' }
];

const previewQuestions: BankQuestion[] = [
  {
    id: 'preview-question-1', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('SC'), categoryId: 'preview-category-space',
    gradeLevel: 'ประถมศึกษาปีที่ 5', unit: 'โลกและอวกาศ', topic: 'ระบบสุริยะ', difficulty: 'easy', questionType: 'multiple_choice',
    prompt: 'ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด', choices: [{ id: 'a', text: 'โลก' }, { id: 'b', text: 'ดาวพุธ' }, { id: 'c', text: 'ดาวอังคาร' }, { id: 'd', text: 'ดาวพฤหัสบดี' }],
    answerKey: ['b'], explanation: 'ดาวพุธเป็นดาวเคราะห์ที่โคจรใกล้ดวงอาทิตย์ที่สุด', points: 1, tags: ['ทบทวน', 'พื้นฐาน'], status: 'active', createdAt: nowIso(), updatedAt: nowIso()
  },
  {
    id: 'preview-question-2', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('SC'), categoryId: 'preview-category-space',
    gradeLevel: 'ประถมศึกษาปีที่ 5', unit: 'โลกและอวกาศ', topic: 'ระบบสุริยะ', difficulty: 'medium', questionType: 'multiple_choice',
    prompt: 'โลกโคจรรอบดวงอาทิตย์ใช้เวลาประมาณเท่าใด', choices: [{ id: 'a', text: '24 ชั่วโมง' }, { id: 'b', text: '7 วัน' }, { id: 'c', text: '365 วัน' }, { id: 'd', text: '30 วัน' }],
    answerKey: ['c'], explanation: 'โลกใช้เวลาประมาณ 365 วัน หรือ 1 ปีในการโคจรรอบดวงอาทิตย์', points: 2, tags: ['เวลา', 'โลก'], status: 'active', createdAt: nowIso(), updatedAt: nowIso()
  },
  {
    id: 'preview-question-3', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('SC'), categoryId: 'preview-category-force',
    gradeLevel: 'ประถมศึกษาปีที่ 5', unit: 'แรงและพลังงาน', topic: 'แรงเสียดทาน', difficulty: 'hard', questionType: 'multiple_select',
    prompt: 'ข้อใดช่วยเพิ่มแรงเสียดทานระหว่างรองเท้ากับพื้น', choices: [{ id: 'a', text: 'ทำพื้นให้ขรุขระ' }, { id: 'b', text: 'สวมรองเท้าพื้นยาง' }, { id: 'c', text: 'ทาน้ำมันบนพื้น' }, { id: 'd', text: 'ทำพื้นให้เรียบมาก' }],
    answerKey: ['a', 'b'], explanation: 'พื้นขรุขระและพื้นยางช่วยเพิ่มแรงเสียดทาน ส่วน น้ำมันและพื้นเรียบลดแรงเสียดทาน', points: 3, tags: ['ทดลอง', 'คิดวิเคราะห์'], status: 'active', createdAt: nowIso(), updatedAt: nowIso()
  },
  {
    id: 'preview-question-4', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('MA'), categoryId: 'preview-category-fraction',
    gradeLevel: 'ประถมศึกษาปีที่ 5', unit: 'จำนวนและการดำเนินการ', topic: 'เศษส่วน', difficulty: 'medium', questionType: 'multiple_choice',
    prompt: '1/2 + 1/4 มีค่าเท่าใด', choices: [{ id: 'a', text: '1/4' }, { id: 'b', text: '2/4' }, { id: 'c', text: '3/4' }, { id: 'd', text: '1' }],
    answerKey: ['c'], explanation: 'ทำส่วนให้เท่ากัน: 2/4 + 1/4 = 3/4', points: 2, tags: ['เศษส่วน'], status: 'active', createdAt: nowIso(), updatedAt: nowIso()
  },
  {
    id: 'preview-question-5', schoolId: FIXTURE_SCHOOL_ID, subjectId: subjectId('SC'), categoryId: 'preview-category-force',
    gradeLevel: 'ประถมศึกษาปีที่ 5', unit: 'แรงและพลังงาน', topic: 'แรงเสียดทาน', difficulty: 'easy', questionType: 'true_false',
    prompt: 'แรงเสียดทานมีทิศทางต้านการเคลื่อนที่ของวัตถุ', choices: [{ id: 'a', text: 'ถูก' }, { id: 'b', text: 'ผิด' }],
    answerKey: ['a'], explanation: 'แรงเสียดทานทำหน้าที่ต้านการเคลื่อนที่หรือแนวโน้มการเคลื่อนที่', points: 1, tags: ['จริงหรือเท็จ'], status: 'active', createdAt: nowIso(), updatedAt: nowIso()
  }
];

function matchesQuestion(question: BankQuestion, filter: {
  subjectId?: string | null; categoryId?: string | null; difficulty?: Difficulty | null;
  questionType?: QuestionType | null; gradeLevel?: string | null; topic?: string | null;
  status?: QuestionStatus | null; keyword?: string | null;
}): boolean {
  const keyword = filter.keyword?.trim().toLocaleLowerCase('th-TH');
  return (!filter.subjectId || question.subjectId === filter.subjectId)
    && (!filter.categoryId || question.categoryId === filter.categoryId)
    && (!filter.difficulty || question.difficulty === filter.difficulty)
    && (!filter.questionType || question.questionType === filter.questionType)
    && (!filter.gradeLevel || question.gradeLevel.toLocaleLowerCase('th-TH').includes(filter.gradeLevel.toLocaleLowerCase('th-TH')))
    && (!filter.topic || question.topic.toLocaleLowerCase('th-TH').includes(filter.topic.toLocaleLowerCase('th-TH')))
    && question.status === (filter.status ?? 'active')
    && (!keyword || [question.prompt, question.topic, question.unit].some((value) => value.toLocaleLowerCase('th-TH').includes(keyword)));
}

export const previewQuestionStore = {
  list(schoolId: string, filter: Parameters<typeof matchesQuestion>[1] = {}, limit = 200): BankQuestion[] {
    requirePreview();
    return previewQuestions.filter((question) => question.schoolId === schoolId && matchesQuestion(question, filter)).slice(0, limit);
  },
  categories(schoolId: string): QuestionCategory[] {
    requirePreview();
    return previewCategories.filter((category) => category.schoolId === schoolId).sort((a, b) => a.position - b.position);
  },
  get(questionId: string): BankQuestion | undefined { return previewQuestions.find((question) => question.id === questionId); },
  save(schoolId: string, draft: QuestionDraft): string {
    requirePreview();
    const timestamp = nowIso();
    const id = draft.id ?? `preview-question-${Date.now()}`;
    const existing = previewQuestions.find((question) => question.id === id);
    const value: BankQuestion = {
      id, schoolId, subjectId: draft.subjectId, categoryId: draft.categoryId, gradeLevel: draft.gradeLevel,
      unit: draft.unit, topic: draft.topic, difficulty: draft.difficulty, questionType: draft.questionType,
      prompt: draft.prompt, choices: draft.choices, answerKey: draft.answerKey, explanation: draft.explanation,
      points: draft.points, tags: draft.tags, status: draft.status, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp
    };
    if (existing) Object.assign(existing, value); else previewQuestions.unshift(value);
    return id;
  },
  archive(questionId: string): void {
    requirePreview();
    const question = previewQuestions.find((item) => item.id === questionId);
    if (question) question.status = 'archived';
  },
  saveCategory(input: { schoolId: string; categoryId?: string | null; subjectId: string | null; name: string; description?: string }): string {
    requirePreview();
    const existing = input.categoryId ? previewCategories.find((category) => category.id === input.categoryId) : undefined;
    if (existing) { existing.name = input.name.trim(); existing.subjectId = input.subjectId; existing.description = input.description ?? ''; return existing.id; }
    const id = `preview-category-${Date.now()}`;
    previewCategories.push({ id, schoolId: input.schoolId, subjectId: input.subjectId, name: input.name.trim(), description: input.description ?? '', position: previewCategories.length + 1, status: 'active' });
    return id;
  },
  setCategoryStatus(categoryId: string, status: QuestionStatus): void {
    requirePreview();
    const category = previewCategories.find((item) => item.id === categoryId);
    if (category) category.status = status;
  },
  reorderCategories(orderedIds: string[]): void {
    requirePreview();
    orderedIds.forEach((id, index) => { const category = previewCategories.find((item) => item.id === id); if (category) category.position = index + 1; });
  }
};

const previewExams: ExamRow[] = [
  {
    id: 'preview-exam-science', schoolId: FIXTURE_SCHOOL_ID, classId: fixture.primaryClassId, subjectId: subjectId('SC'),
    title: 'เดโมสอบกลางภาค วิทยาศาสตร์', testDate: new Date().toISOString().slice(0, 10), maxScore: 100, status: 'published',
    opensAt: new Date(Date.now() - 60 * 60_000).toISOString(), closesAt: plusMinutes(120), durationMinutes: 20, attemptLimit: 2,
    instructions: 'ข้อสอบเดโมสำหรับทดสอบการเปิดสอบ ตัวจับเวลา และการส่งคำตอบ', examKind: 'exam'
  },
  {
    id: 'preview-exam-draft', schoolId: FIXTURE_SCHOOL_ID, classId: fixture.primaryClassId, subjectId: subjectId('MA'),
    title: 'ร่างข้อสอบเดโม คณิตศาสตร์', testDate: new Date().toISOString().slice(0, 10), maxScore: 50, status: 'draft',
    opensAt: null, closesAt: null, durationMinutes: 30, attemptLimit: 1, instructions: '', examKind: 'test'
  }
];
const previewExamQuestions = new Map<string, string[]>([
  ['preview-exam-science', ['preview-question-1', 'preview-question-2', 'preview-question-3', 'preview-question-5']],
  ['preview-exam-draft', ['preview-question-4']]
]);
const previewAttempts = new Map<string, ExamAttemptRow[]>();
const previewAttemptAnswers = new Map<string, Record<string, string[]>>();

function examState(exam: ExamRow, now = Date.now()): ExamState {
  if (exam.status === 'draft') return 'draft';
  if (exam.status === 'closed') return 'closed';
  if (exam.opensAt && now < Date.parse(exam.opensAt)) return 'scheduled';
  if (exam.closesAt && now > Date.parse(exam.closesAt)) return 'grading';
  return 'open';
}

function examOrThrow(testId: string): ExamRow {
  const exam = previewExams.find((item) => item.id === testId);
  if (!exam) throw new Error('ไม่พบข้อสอบเดโม');
  return exam;
}

function paperQuestions(testId: string): ExamPaperQuestion[] {
  return (previewExamQuestions.get(testId) ?? []).map((id) => previewQuestionStore.get(id)).filter((question): question is BankQuestion => Boolean(question)).map((question, index) => ({
    id: question.id, position: index + 1, questionType: question.questionType, prompt: question.prompt, choices: question.choices, points: question.points
  }));
}

export const previewExamStore = {
  list(schoolId: string): ExamRow[] { requirePreview(); return previewExams.filter((exam) => exam.schoolId === schoolId); },
  create(input: { schoolId: string; classId: string; subjectId: string | null; title: string; testDate: string; maxScore: number }): string {
    requirePreview();
    const id = `preview-exam-${Date.now()}`;
    previewExams.unshift({ id, schoolId: input.schoolId, classId: input.classId, subjectId: input.subjectId, title: input.title, testDate: input.testDate, maxScore: input.maxScore, status: 'draft', opensAt: null, closesAt: null, durationMinutes: 60, attemptLimit: 1, instructions: '', examKind: 'exam' });
    previewExamQuestions.set(id, []);
    return id;
  },
  questionCount(testId: string): number { requirePreview(); return previewExamQuestions.get(testId)?.length ?? 0; },
  attempts(testId: string): ExamAttemptRow[] { requirePreview(); return [...(previewAttempts.get(testId) ?? [])]; },
  compose(testId: string, questionIds: string[]): number {
    requirePreview();
    if ((previewAttempts.get(testId) ?? []).length > 0) throw new Error('EXAM_ALREADY_TAKEN');
    const current = previewExamQuestions.get(testId) ?? [];
    const next = [...current, ...questionIds.filter((id) => !current.includes(id))];
    previewExamQuestions.set(testId, next);
    return next.length - current.length;
  },
  schedule(input: { testId: string; opensAt: string | null; closesAt: string | null; durationMinutes: number | null; attemptLimit: number; status: 'draft' | 'published' | 'closed' }): { testId: string; state: ExamState } {
    requirePreview();
    const exam = examOrThrow(input.testId);
    Object.assign(exam, { opensAt: input.opensAt, closesAt: input.closesAt, durationMinutes: input.durationMinutes, attemptLimit: input.attemptLimit, status: input.status });
    return { testId: exam.id, state: examState(exam) };
  },
  access(testId: string): ExamAccess {
    requirePreview();
    const exam = examOrThrow(testId);
    const attempts = previewAttempts.get(testId) ?? [];
    const active = attempts.find((attempt) => !attempt.submittedAt) ?? null;
    const state = examState(exam);
    return {
      testId, serverTime: nowIso(), state, opensAt: exam.opensAt, closesAt: exam.closesAt, durationMinutes: exam.durationMinutes,
      attemptLimit: exam.attemptLimit, attemptsUsed: attempts.filter((attempt) => Boolean(attempt.submittedAt)).length,
      canStart: state === 'open' && !active && attempts.filter((attempt) => Boolean(attempt.submittedAt)).length < exam.attemptLimit,
      activeAttemptId: active?.id ?? null, expiresAt: active ? (active.startedAt && exam.durationMinutes ? new Date(Date.parse(active.startedAt) + exam.durationMinutes * 60_000).toISOString() : null) : null,
      questionCount: this.questionCount(testId)
    };
  },
  start(testId: string): { attemptId: string; expiresAt: string | null; serverTime: string; resumed: boolean } {
    requirePreview();
    const exam = examOrThrow(testId);
    const attempts = previewAttempts.get(testId) ?? [];
    const active = attempts.find((attempt) => !attempt.submittedAt);
    if (active) return { attemptId: active.id, expiresAt: exam.durationMinutes ? new Date(Date.parse(active.startedAt) + exam.durationMinutes * 60_000).toISOString() : null, serverTime: nowIso(), resumed: true };
    if (examState(exam) !== 'open') throw new Error('EXAM_CLOSED');
    if (attempts.length >= exam.attemptLimit) throw new Error('EXAM_ATTEMPTS_EXHAUSTED');
    const attempt: ExamAttemptRow = { id: `preview-attempt-${Date.now()}`, studentId: 'preview-student', attemptNumber: attempts.length + 1, startedAt: nowIso(), submittedAt: null, submittedReason: null, autoScore: null };
    attempts.unshift(attempt); previewAttempts.set(testId, attempts); previewAttemptAnswers.set(attempt.id, {});
    return { attemptId: attempt.id, expiresAt: exam.durationMinutes ? new Date(Date.now() + exam.durationMinutes * 60_000).toISOString() : null, serverTime: nowIso(), resumed: false };
  },
  take(attemptId: string): ExamPaper {
    requirePreview();
    const entry = [...previewAttempts.entries()].find(([, attempts]) => attempts.some((attempt) => attempt.id === attemptId));
    if (!entry) throw new Error('ไม่พบการเข้าสอบเดโม');
    const [testId] = entry;
    const exam = examOrThrow(testId);
    const attempt = entry[1].find((item) => item.id === attemptId)!;
    return { attemptId, expiresAt: exam.durationMinutes ? new Date(Date.parse(attempt.startedAt) + exam.durationMinutes * 60_000).toISOString() : null, serverTime: nowIso(), answers: previewAttemptAnswers.get(attemptId) ?? {}, questions: paperQuestions(testId) };
  },
  submit(attemptId: string, answers: Record<string, string[]>, final: boolean): { attemptId: string; submittedAt: string | null; reason: string | null; autoScore: number | null } {
    requirePreview();
    const entry = [...previewAttempts.entries()].find(([, attempts]) => attempts.some((attempt) => attempt.id === attemptId));
    if (!entry) throw new Error('ไม่พบการเข้าสอบเดโม');
    const [testId, attempts] = entry;
    previewAttemptAnswers.set(attemptId, answers);
    const attempt = attempts.find((item) => item.id === attemptId)!;
    if (!final) return { attemptId, submittedAt: attempt.submittedAt, reason: attempt.submittedReason, autoScore: attempt.autoScore };
    const score = paperQuestions(testId).reduce((total, question) => {
      const key = previewQuestionStore.get(question.id)?.answerKey ?? [];
      const given = answers[question.id] ?? [];
      return total + (key.length === given.length && key.every((answer) => given.includes(answer)) ? question.points : 0);
    }, 0);
    attempt.submittedAt = nowIso(); attempt.submittedReason = 'student'; attempt.autoScore = score;
    return { attemptId, submittedAt: attempt.submittedAt, reason: attempt.submittedReason, autoScore: score };
  }
};

function asBoardQuestion(question: BankQuestion, position: number): BoardQuestion {
  return { id: question.id, position, questionType: question.questionType, prompt: question.prompt, choices: question.choices, answerKey: question.answerKey, explanation: question.explanation, points: question.points };
}

interface PreviewQuizState {
  session: QuizSessionSummary & { timerSeconds: number | null; scoringMode: ScoringMode; leaderboardVisible: boolean; questionStartedAt: string | null; deadline: string | null; currentPosition: number };
  questions: BoardQuestion[];
  joined: boolean;
  answers: Record<string, string[]>;
  resultByQuestion: Record<string, { answered: number; correct: number }>;
  score: number;
  correct: number;
  bonusAwarded: boolean;
}

let previewQuiz: PreviewQuizState | null = null;
const previewQuizHistory: QuizSessionSummary[] = [{ sessionId: 'preview-quiz-history', title: 'ทบทวนแรงและพลังงาน · เดโมย้อนหลัง', status: 'ended', classId: fixture.primaryClassId, subjectId: subjectId('SC'), createdAt: new Date(Date.now() - 86_400_000).toISOString(), endedAt: new Date(Date.now() - 86_400_000 + 15 * 60_000).toISOString(), questionCount: 3, participants: 12 }];

function quizError(code: string): Error { return new Error(code); }

export const previewQuizStore = {
  create(input: { schoolId: string; classId: string; subjectId: string | null; title: string; questionIds: string[]; timerSeconds: number | null; scoringMode: ScoringMode; leaderboardVisible: boolean }): { sessionId: string; questionCount: number } {
    requirePreview();
    const questions = input.questionIds.map((id) => previewQuestionStore.get(id)).filter((question): question is BankQuestion => Boolean(question)).map((question, index) => asBoardQuestion(question, index + 1));
    if (questions.length === 0) throw quizError('ไม่มีคำถามในกิจกรรมเดโม');
    const sessionId = `preview-quiz-${Date.now()}`;
    previewQuiz = {
      session: { sessionId, title: input.title || 'Quiz Challenge เดโม', status: 'lobby', classId: input.classId, subjectId: input.subjectId, createdAt: nowIso(), endedAt: null, questionCount: questions.length, participants: 0, timerSeconds: input.timerSeconds, scoringMode: input.scoringMode, leaderboardVisible: input.leaderboardVisible, questionStartedAt: null, deadline: null, currentPosition: 0 },
      questions, joined: false, answers: {}, resultByQuestion: Object.fromEntries(questions.map((question) => [question.id, { answered: 0, correct: 0 }])), score: 0, correct: 0, bonusAwarded: false
    };
    return { sessionId, questionCount: questions.length };
  },
  history(schoolId: string): QuizSessionSummary[] { requirePreview(); return previewQuiz?.session.classId && schoolId === FIXTURE_SCHOOL_ID && previewQuiz.session.status !== 'ended' ? [previewQuiz.session, ...previewQuizHistory] : previewQuizHistory; },
  control(sessionId: string, command: 'start' | 'next' | 'pause' | 'resume' | 'end'): { status: QuizStatus; currentPosition: number } {
    requirePreview();
    const state = previewQuiz;
    if (!state || state.session.sessionId !== sessionId) throw quizError('ไม่พบกิจกรรมเดโม');
    if (command === 'start' || command === 'resume') {
      state.session.status = 'running';
      if (state.session.currentPosition === 0) state.session.currentPosition = 1;
      state.session.questionStartedAt = nowIso(); state.session.deadline = state.session.timerSeconds ? plusMinutes(state.session.timerSeconds / 60) : null;
    } else if (command === 'pause') state.session.status = 'paused';
    else if (command === 'next') {
      if (state.session.currentPosition >= state.session.questionCount) { state.session.status = 'ended'; state.session.endedAt = nowIso(); }
      else { state.session.currentPosition += 1; state.session.questionStartedAt = nowIso(); state.session.deadline = state.session.timerSeconds ? plusMinutes(state.session.timerSeconds / 60) : null; }
    } else if (command === 'end') { state.session.status = 'ended'; state.session.endedAt = nowIso(); }
    if (state.session.status === 'ended' && !previewQuizHistory.some((item) => item.sessionId === state.session.sessionId)) {
      previewQuizHistory.unshift({ ...state.session });
    }
    return { status: state.session.status, currentPosition: state.session.currentPosition };
  },
  board(sessionId: string): QuizBoard {
    requirePreview();
    const state = previewQuiz;
    if (!state || state.session.sessionId !== sessionId) throw quizError('ไม่พบกิจกรรมเดโม');
    const question = state.session.currentPosition > 0 ? state.questions[state.session.currentPosition - 1] ?? null : null;
    const row: LeaderboardRow = { participantId: 'preview-participant', studentId: 'preview-student', displayName: fixture.memberships.find((item) => item.membershipId === 'preview-student')?.displayName ?? 'นักเรียนเดโม', avatarId: 'avatar_001', score: state.score, correct: state.correct, answered: Object.keys(state.answers).length, accuracy: Object.keys(state.answers).length ? state.correct / Object.keys(state.answers).length : 0 };
    return { sessionId, title: state.session.title, status: state.session.status, classId: state.session.classId, subjectId: state.session.subjectId, scoringMode: state.session.scoringMode, leaderboardVisible: state.session.leaderboardVisible, timerSeconds: state.session.timerSeconds, currentPosition: state.session.currentPosition, questionCount: state.session.questionCount, questionStartedAt: state.session.questionStartedAt, deadline: state.session.deadline, serverTime: nowIso(), participants: state.joined ? 1 : 0, answered: Object.keys(state.answers).length, correct: state.correct, question: question ? { ...question } : null, leaderboard: state.joined ? [row] : [] };
  },
  results(sessionId: string): QuizResults {
    requirePreview();
    const state = previewQuiz;
    if (!state || state.session.sessionId !== sessionId) throw quizError('ไม่พบกิจกรรมเดโม');
    const row: LeaderboardRow = { participantId: 'preview-participant', studentId: 'preview-student', displayName: fixture.memberships.find((item) => item.membershipId === 'preview-student')?.displayName ?? 'นักเรียนเดโม', avatarId: 'avatar_001', score: state.score, correct: state.correct, answered: Object.keys(state.answers).length, accuracy: Object.keys(state.answers).length ? state.correct / Object.keys(state.answers).length : 0 };
    return { sessionId, title: state.session.title, status: state.session.status, classId: state.session.classId, subjectId: state.session.subjectId, questionCount: state.session.questionCount, bonusAwarded: state.bonusAwarded, participants: state.joined ? [row] : [], questions: state.questions.map((question) => ({ position: question.position, prompt: question.prompt, answered: state.resultByQuestion[question.id]?.answered ?? 0, correct: state.resultByQuestion[question.id]?.correct ?? 0 })) };
  },
  waiting(): { waiting: boolean; sessionId?: string; title?: string; status?: QuizStatus; joined?: boolean } {
    requirePreview();
    if (!previewQuiz || previewQuiz.session.status === 'ended') return { waiting: false };
    return { waiting: true, sessionId: previewQuiz.session.sessionId, title: previewQuiz.session.title, status: previewQuiz.session.status, joined: previewQuiz.joined };
  },
  join(sessionId: string): { participantId: string; displayName: string; score: number } {
    requirePreview();
    if (!previewQuiz || previewQuiz.session.sessionId !== sessionId) throw quizError('ไม่พบกิจกรรมเดโม');
    previewQuiz.joined = true; previewQuiz.session.participants = 1;
    return { participantId: 'preview-participant', displayName: 'นักเรียนเดโม', score: previewQuiz.score };
  },
  studentView(sessionId: string): StudentQuizView {
    requirePreview();
    if (!previewQuiz || previewQuiz.session.sessionId !== sessionId || !previewQuiz.joined) throw quizError('QUIZ_NOT_JOINED');
    const current = previewQuiz.session.currentPosition > 0 ? previewQuiz.questions[previewQuiz.session.currentPosition - 1] : null;
    const selected = current ? previewQuiz.answers[current.id] : undefined;
    return { sessionId, title: previewQuiz.session.title, status: previewQuiz.session.status, currentPosition: previewQuiz.session.currentPosition, questionCount: previewQuiz.session.questionCount, serverTime: nowIso(), deadline: previewQuiz.session.deadline, leaderboardVisible: previewQuiz.session.leaderboardVisible, me: { participantId: 'preview-participant', displayName: 'นักเรียนเดโม', score: previewQuiz.score, correct: previewQuiz.correct, answered: Object.keys(previewQuiz.answers).length }, question: current ? { id: current.id, position: current.position, questionType: current.questionType, prompt: current.prompt, choices: current.choices, points: current.points } : null, myAnswer: selected ? { selected, isCorrect: (previewQuiz.resultByQuestion[current!.id]?.correct ?? 0) > 0, awarded: previewQuiz.resultByQuestion[current!.id]?.correct ? current!.points : 0 } : null };
  },
  answer(sessionId: string, questionId: string, selected: string[]): { recorded: boolean; alreadyAnswered: boolean; isCorrect: boolean; awarded: number; explanation?: string } {
    requirePreview();
    if (!previewQuiz || previewQuiz.session.sessionId !== sessionId) throw quizError('ไม่พบกิจกรรมเดโม');
    if (previewQuiz.answers[questionId]) return { recorded: false, alreadyAnswered: true, isCorrect: false, awarded: 0 };
    const question = previewQuestionStore.get(questionId);
    if (!question) throw quizError('ไม่พบคำถามเดโม');
    const isCorrect = question.answerKey.length === selected.length && question.answerKey.every((answer) => selected.includes(answer));
    const awarded = isCorrect ? question.points : 0;
    previewQuiz.answers[questionId] = selected; previewQuiz.score += awarded; if (isCorrect) previewQuiz.correct += 1;
    previewQuiz.resultByQuestion[questionId] = { answered: 1, correct: isCorrect ? 1 : 0 };
    return { recorded: true, alreadyAnswered: false, isCorrect, awarded, explanation: question.explanation };
  },
  awardBonus(sessionId: string): { awarded: number } { requirePreview(); if (!previewQuiz || previewQuiz.session.sessionId !== sessionId) throw quizError('ไม่พบกิจกรรมเดโม'); previewQuiz.bonusAwarded = true; return { awarded: previewQuiz.joined ? 1 : 0 }; }
};
