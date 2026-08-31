import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The two properties worth protecting here are that the answer key never reaches a student's device
// and that quiz points never become marks on their own. Both are settled in SQL.

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const migration = read('supabase/migrations/202608310026_quiz_challenge.sql');
const client = read('apps/web/src/features/quiz/quizChallenge.ts');
const studentPanel = read('apps/web/src/features/quiz/StudentQuizPanel.tsx');
const teacherPage = read('apps/web/src/features/quiz/QuizChallengePage.tsx');

describe('the answer key', () => {
  it('lives in tables no browser session may read', () => {
    for (const table of ['quiz_sessions', 'quiz_questions', 'quiz_participants', 'quiz_answers']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated`);
      expect(migration).not.toContain(`grant select on public.${table} to authenticated`);
    }
  });

  it('is left out of what a student is sent', () => {
    const view = migration.slice(migration.indexOf('function public.quiz_view'));
    const body = view.slice(0, view.indexOf('end $$'));
    expect(body).toContain("'prompt', current_question.prompt");
    expect(body).not.toContain('answer_key');
    // The teacher's board may show it, and only for the question currently up.
    const board = migration.slice(migration.indexOf('function public.quiz_board'));
    expect(board.slice(0, board.indexOf('end $$'))).toContain("'answerKey', current_question.answer_key");
  });

  it('is compared on the server, never in the client', () => {
    expect(migration).toContain("correct := coalesce(p_selected, '[]'::jsonb) = question.answer_key");
    // The teacher's board type carries the key, because the teacher's board shows it. The student's
    // view type is the same shape with the key removed, so a screen that tried to read one would
    // not compile.
    expect(client).toContain("export type StudentQuestion = Omit<BoardQuestion, 'answerKey' | 'explanation'>");
    expect(studentPanel).not.toContain('answerKey');
    // Nothing anywhere decides correctness for itself.
    for (const source of [client, studentPanel]) {
      expect(source).not.toMatch(/isCorrect\s*=\s*|=== *answer|includes\(answer/);
    }
  });
});

describe('running the round', () => {
  it('copies each question rather than pointing at the bank', () => {
    // Editing a bank question next week must not change what this class answered.
    expect(migration).toContain('create table if not exists public.quiz_questions');
    expect(migration).toContain('source_question_id uuid references public.question_bank(id)');
    expect(migration).toMatch(/insert into public\.quiz_questions[\s\S]{0,400}question\.answer_key/);
  });

  it('times every question from the server stamp', () => {
    expect(migration).toContain('question_started_at=clock_timestamp()');
    expect(migration).toContain('function public.quiz_deadline');
    expect(migration).toContain("raise exception 'QUIZ_TIME_UP'");
    // The client measures against the server's own reading rather than the device clock: the offset
    // is taken when the payload lands and applied to every tick after it.
    expect(client).toContain('const deviceAheadBy = receivedAt - Date.parse(serverTime)');
    expect(client).toContain('const estimatedServerNow = now - deviceAheadBy');
  });

  it('records one answer per question per student, whatever the network does', () => {
    expect(migration).toContain('unique(session_id, participant_id, question_id)');
    expect(migration).toMatch(/if found then\s+return jsonb_build_object\('recorded', true, 'alreadyAnswered', true/);
  });

  it('refuses an answer to a question that is not the one on the board', () => {
    expect(migration).toContain("raise exception 'QUIZ_QUESTION_CLOSED'");
    expect(migration).toContain("raise exception 'QUIZ_NOT_RUNNING'");
  });

  it('lets a student in on their enrolment rather than on a code', () => {
    expect(migration).toContain('function public.quiz_waiting_for_me');
    expect(migration).toMatch(/join public\.student_class_enrollments e[\s\S]{0,200}status='active'/);
    expect(migration).toContain("raise exception 'QUIZ_NOT_FOR_YOU'");
    expect(studentPanel).toContain('กิจกรรมกำลังเริ่ม');
    expect(studentPanel).not.toMatch(/session code|รหัสห้อง|เลขห้อง/i);
  });

  it('keeps speed worth less than being right', () => {
    // A quarter of the points at most, so a fast wrong answer never beats a slow right one.
    expect(migration).toContain('speed_share * 0.25');
    expect(migration).toMatch(/if correct then\s+awarded := question\.points;/);
  });
});

describe('turning a round into marks', () => {
  it('never happens on its own', () => {
    const submit = migration.slice(migration.indexOf('function public.submit_quiz_answer'));
    expect(submit.slice(0, submit.indexOf('end $$'))).not.toContain('score_events');
  });

  it('goes through the score ledger the rest of the product uses', () => {
    expect(migration).toContain('insert into public.score_events');
    expect(migration).toMatch(/'quiz', points,[\s\S]{0,200}'quiz', session\.id, actor/);
    expect(migration).toContain("score_events_source_type_check");
  });

  it('refuses to award the same round twice', () => {
    expect(migration).toContain('QUIZ_BONUS_ALREADY_AWARDED');
    expect(teacherPage).toContain('ให้ได้ครั้งเดียวต่อกิจกรรม');
  });

  it('caps what one round can be worth', () => {
    expect(migration).toContain('if points < -10 or points > 10 then raise exception');
  });

  it('records who awarded it and why', () => {
    expect(migration).toContain('QUIZ_BONUS_AWARDED');
    expect(migration).toContain('awarded_by');
  });
});
