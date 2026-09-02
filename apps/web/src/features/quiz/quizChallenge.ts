// Quiz Challenge, as the two screens that run it talk to the server.
//
// Every table behind this is unreadable from a browser, so everything here is a function call. That
// is not ceremony: the answer key lives in those tables, and a round where the device could read it
// would be a round where one developer-tools panel beats the whole class.
//
// Nothing in this module decides whether an answer is right, when a question closes, or what a
// score is. The server marks, the server times, and this module renders what it is told.

import { requireSupabase } from '../../services/supabase';
import { isPreviewActive } from '../../preview/previewMode';
import { previewQuizStore } from '../../preview/previewData';

export type QuizStatus = 'lobby' | 'running' | 'paused' | 'ended';
export type ScoringMode = 'accuracy' | 'speed';

export interface QuizChoice { id: string; text: string }

/**
 * The question as the teacher's board receives it — answer key included, because the board is what
 * the teacher reads the answer from.
 */
export interface BoardQuestion {
  id: string;
  position: number;
  questionType: string;
  prompt: string;
  choices: QuizChoice[];
  answerKey: string[];
  explanation: string;
  points: number;
}

/**
 * The same question as a student receives it.
 *
 * The key and the explanation are absent from the type because they are absent from the payload:
 * the server strips them. Modelling that as its own type rather than as a cast means a student
 * screen that tried to read the key would fail to compile, which is a cheaper place to find that
 * mistake than a classroom.
 */
export type StudentQuestion = Omit<BoardQuestion, 'answerKey' | 'explanation'>;

export interface QuizBoard {
  sessionId: string;
  title: string;
  status: QuizStatus;
  classId: string;
  subjectId: string | null;
  scoringMode: ScoringMode;
  leaderboardVisible: boolean;
  timerSeconds: number | null;
  currentPosition: number;
  questionCount: number;
  questionStartedAt: string | null;
  deadline: string | null;
  serverTime: string;
  participants: number;
  answered: number;
  correct: number;
  question: BoardQuestion | null;
  leaderboard: LeaderboardRow[];
}

export interface LeaderboardRow {
  participantId: string;
  studentId?: string;
  displayName: string;
  avatarId: string;
  score: number;
  correct: number;
  answered: number;
  accuracy?: number;
}

export interface StudentQuizView {
  sessionId: string;
  title: string;
  status: QuizStatus;
  currentPosition: number;
  questionCount: number;
  serverTime: string;
  deadline: string | null;
  leaderboardVisible: boolean;
  me: { participantId: string; displayName: string; score: number; correct: number; answered: number };
  question: StudentQuestion | null;
  myAnswer: { selected: string[]; isCorrect: boolean; awarded: number } | null;
}

export interface QuizResults {
  sessionId: string;
  title: string;
  status: QuizStatus;
  classId: string;
  subjectId: string | null;
  questionCount: number;
  bonusAwarded: boolean;
  participants: LeaderboardRow[];
  questions: { position: number; prompt: string; answered: number; correct: number }[];
}

export interface QuizSessionSummary {
  sessionId: string;
  title: string;
  status: QuizStatus;
  classId: string;
  subjectId: string | null;
  createdAt: string;
  endedAt: string | null;
  questionCount: number;
  participants: number;
}

const messages: Record<string, string> = {
  QUIZ_NOT_FOR_YOU: 'กิจกรรมนี้ไม่ได้เปิดสำหรับห้องเรียนของคุณ',
  QUIZ_NOT_JOINED: 'ยังไม่ได้เข้าร่วมกิจกรรม',
  QUIZ_NOT_RUNNING: 'ครูยังไม่ได้เริ่มข้อนี้',
  QUIZ_QUESTION_CLOSED: 'ข้อนี้ปิดรับคำตอบแล้ว',
  QUIZ_TIME_UP: 'หมดเวลาของข้อนี้แล้ว',
  QUIZ_ENDED: 'กิจกรรมนี้จบไปแล้ว',
  QUIZ_BONUS_ALREADY_AWARDED: 'ให้คะแนนพิเศษของกิจกรรมนี้ไปแล้ว ให้ซ้ำไม่ได้',
  FORBIDDEN: 'ไม่มีสิทธิ์ทำรายการนี้'
};

export class QuizError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'QuizError';
  }
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) {
    const raw = String(error.message ?? '');
    const known = Object.keys(messages).find((code) => raw.includes(code));
    throw new QuizError(known ?? 'QUIZ_ERROR', known ? messages[known]! : 'ดำเนินการไม่สำเร็จ');
  }
  return data as T;
}

export function createQuizSession(input: {
  schoolId: string; classId: string; subjectId: string | null; title: string;
  questionIds: string[]; timerSeconds: number | null; scoringMode: ScoringMode;
  leaderboardVisible: boolean;
}) {
  return isPreviewActive()
    ? Promise.resolve(previewQuizStore.create(input))
    : rpc<{ sessionId: string; questionCount: number }>('create_quiz_session', {
      p_school_id: input.schoolId, p_class_id: input.classId, p_subject_id: input.subjectId,
      p_title: input.title, p_question_ids: input.questionIds, p_timer_seconds: input.timerSeconds,
      p_scoring_mode: input.scoringMode, p_leaderboard_visible: input.leaderboardVisible
    });
}

export const controlQuiz = (sessionId: string, command: 'start' | 'next' | 'pause' | 'resume' | 'end') =>
  isPreviewActive()
    ? Promise.resolve(previewQuizStore.control(sessionId, command))
    : rpc<{ status: QuizStatus; currentPosition: number }>('control_quiz_session', {
      p_session_id: sessionId, p_command: command
    });

export const quizBoard = (sessionId: string) => isPreviewActive()
  ? Promise.resolve(previewQuizStore.board(sessionId))
  : rpc<QuizBoard>('quiz_board', { p_session_id: sessionId });
export const quizResults = (sessionId: string) => isPreviewActive()
  ? Promise.resolve(previewQuizStore.results(sessionId))
  : rpc<QuizResults>('quiz_results', { p_session_id: sessionId });
export const recentQuizSessions = (schoolId: string, limit = 20) =>
  isPreviewActive()
    ? Promise.resolve(previewQuizStore.history(schoolId).slice(0, limit))
    : rpc<QuizSessionSummary[]>('recent_quiz_sessions', { p_school_id: schoolId, p_limit: limit });

export const quizWaitingForMe = () =>
  isPreviewActive()
    ? Promise.resolve(previewQuizStore.waiting())
    : rpc<{ waiting: boolean; sessionId?: string; title?: string; status?: QuizStatus; joined?: boolean }>(
      'quiz_waiting_for_me'
    );
export const joinQuiz = (sessionId: string) =>
  isPreviewActive()
    ? Promise.resolve(previewQuizStore.join(sessionId))
    : rpc<{ participantId: string; displayName: string; score: number }>('join_quiz', { p_session_id: sessionId });
export const quizView = (sessionId: string) => isPreviewActive()
  ? Promise.resolve(previewQuizStore.studentView(sessionId))
  : rpc<StudentQuizView>('quiz_view', { p_session_id: sessionId });

export const submitQuizAnswer = (sessionId: string, questionId: string, selected: string[]) =>
  isPreviewActive()
    ? Promise.resolve(previewQuizStore.answer(sessionId, questionId, selected))
    : rpc<{ recorded: boolean; alreadyAnswered: boolean; isCorrect: boolean; awarded: number; explanation?: string }>(
      'submit_quiz_answer',
      { p_session_id: sessionId, p_question_id: questionId, p_selected: selected }
    );

export const awardQuizBonus = (sessionId: string, awards: { studentId: string; points: number }[], reason: string) =>
  isPreviewActive()
    ? Promise.resolve(previewQuizStore.awardBonus(sessionId))
    : rpc<{ awarded: number }>('award_quiz_bonus', {
      p_session_id: sessionId, p_awards: awards, p_reason: reason
    });

/**
 * Seconds left on the question, measured against the server's clock rather than the device's.
 *
 * Both timestamps in the payload are the server's, so the difference between them is already right;
 * what the device contributes is only how long ago the payload arrived. Taking the offset at arrival
 * and applying it to every tick means a tablet running three minutes fast shows the same countdown
 * as the board at the front of the room — which is the whole point, because the server is what
 * decides whether an answer was in time.
 */
export function secondsRemaining(
  deadline: string | null, serverTime: string, receivedAt = Date.now(), now = Date.now()
): number | null {
  if (!deadline) return null;
  const deviceAheadBy = receivedAt - Date.parse(serverTime);
  const estimatedServerNow = now - deviceAheadBy;
  return Math.max(0, Math.round((Date.parse(deadline) - estimatedServerNow) / 1000));
}

export const BONUS_BANDS = [
  { minimumAccuracy: 0.8, points: 3 },
  { minimumAccuracy: 0.6, points: 2 },
  { minimumAccuracy: 0.4, points: 1 }
] as const;

/**
 * The bonus each student would get, before a teacher changes it.
 *
 * Bands rather than a share of the quiz score, because the quiz score includes a speed margin and a
 * gradebook entry should not. What a teacher is rewarding here is how much of the material a student
 * had, which is accuracy.
 */
export function suggestedBonus(accuracy: number): number {
  const band = BONUS_BANDS.find((entry) => accuracy >= entry.minimumAccuracy);
  return band ? band.points : 0;
}

/** Picks questions for a round: in order, at random, or spread across the difficulties. */
export function selectQuestions<T extends { id: string; difficulty: 'easy' | 'medium' | 'hard' }>(
  pool: T[], count: number, method: 'manual' | 'random' | 'balanced', randomValue: () => number = Math.random
): T[] {
  if (method === 'manual') return pool.slice(0, count);

  const shuffle = (items: T[]) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(randomValue() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
    }
    return copy;
  };

  if (method === 'random') return shuffle(pool).slice(0, count);

  // Balanced: as close to a third of each as the pool allows, and the shortfall from a difficulty
  // the bank is thin on is made up from whatever is left rather than shortening the round.
  const byDifficulty = {
    easy: shuffle(pool.filter((item) => item.difficulty === 'easy')),
    medium: shuffle(pool.filter((item) => item.difficulty === 'medium')),
    hard: shuffle(pool.filter((item) => item.difficulty === 'hard'))
  };
  const target = Math.ceil(count / 3);
  const picked: T[] = [
    ...byDifficulty.easy.slice(0, target),
    ...byDifficulty.medium.slice(0, target),
    ...byDifficulty.hard.slice(0, target)
  ].slice(0, count);

  if (picked.length < count) {
    const chosen = new Set(picked.map((item) => item.id));
    picked.push(...shuffle(pool.filter((item) => !chosen.has(item.id))).slice(0, count - picked.length));
  }
  return picked;
}
