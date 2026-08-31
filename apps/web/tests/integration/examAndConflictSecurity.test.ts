import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(join(repositoryRoot, path), 'utf8');

const examMigration = read('supabase/migrations/202608300019_exam_schedule_and_question_bank.sql');
const conflictMigration = read('supabase/migrations/202608310028_conflict_resolution.sql');
const examClient = read('apps/web/src/features/exams/exams.ts');
const studentExam = read('apps/web/src/features/exams/StudentExamPage.tsx');
const teacherExam = read('apps/web/src/features/exams/ExamsPage.tsx');
const conflictPanel = read('apps/web/src/features/operations/ConflictPanel.tsx');

describe('the exam window', () => {
  it('is decided by the server clock and nothing else', () => {
    expect(examMigration).toContain('function public.exam_access');
    expect(examMigration).toContain('server_now timestamptz := now()');
    expect(examMigration).toContain("raise exception 'EXAM_CLOSED'");
    // The client renders what it is told and computes no window of its own.
    expect(examClient).not.toMatch(/Date\.now\(\) *[<>]|new Date\(\) *[<>]/);
    expect(examClient).toContain('const deviceAheadBy = receivedAt - Date.parse(serverTime)');
  });

  it('resumes an attempt instead of granting a fresh countdown', () => {
    // A refresh, a flat battery or a crash must not be a way to buy more time.
    expect(examMigration).toMatch(/if found then\s+return jsonb_build_object\('attemptId',attempt\.id[\s\S]{0,160}'resumed',true/);
    expect(studentExam).toContain('เวลาที่เหลือนับต่อจากเดิม ไม่ได้เริ่มใหม่');
  });

  it('closes an expired attempt as a timeout whatever the client believed', () => {
    expect(examMigration).toContain("submitted_reason = case when expired then 'timeout'");
    expect(studentExam).toContain('หมดเวลา ระบบส่งคำตอบที่ทำไว้ให้แล้ว');
  });

  it('never sends a student the answer key', () => {
    const take = examMigration.slice(examMigration.indexOf('function public.take_exam'));
    const body = take.slice(0, take.indexOf('end $$'));
    expect(body).toContain("'prompt',q.prompt");
    expect(body).not.toContain('answer_key');
    expect(examClient).not.toContain('answerKey');
    expect(studentExam).not.toContain('answerKey');
  });

  it('keeps the paper a copy, and refuses to change one being sat', () => {
    expect(examMigration).toContain("raise exception 'EXAM_ALREADY_TAKEN'");
    expect(teacherExam).toContain('มีนักเรียนเริ่มสอบไปแล้ว จึงแก้ชุดข้อสอบไม่ได้');
  });

  it('saves answers as they are chosen rather than only at the end', () => {
    // A paper that exists only in the tab is one crash away from being lost.
    expect(studentExam).toMatch(/submitExamAttempt\([^)]*false\)/);
  });
});

describe('resolving a sync conflict', () => {
  it('is a decision a person makes, not one the database makes', () => {
    expect(conflictMigration).toContain("p_choice not in ('server','mine')");
    // Neither option is a default in the screen either.
    expect(conflictPanel).toContain('ใช้ข้อมูลล่าสุดจากระบบ');
    expect(conflictPanel).toContain('นำการแก้ไขจากเครื่องนั้นมาใช้');
    expect(conflictPanel).not.toMatch(/defaultChoice|autoResolve/);
  });

  it('reapplies through the ordinary mutation path, against the current version', () => {
    // Writing the row directly would skip the version bump, the revision and the journal every
    // other device reads.
    expect(conflictMigration).toContain('public.apply_sync_mutation(');
    expect(conflictMigration).toContain('conflict.server_version');
    expect(conflictMigration).not.toMatch(/update public\.(students|attendance|test_scores|score_events) set/);
  });

  it('resolves once however many times the button is pressed', () => {
    expect(conflictMigration).toContain("'conflict-' || replace(conflict.id::text, '-', '')");
    expect(conflictMigration).toMatch(/if conflict\.status <> 'needs_review' then[\s\S]{0,200}'alreadyResolved', true/);
  });

  it('records who decided, which way, and why', () => {
    expect(conflictMigration).toContain('SYNC_CONFLICT_RESOLVED');
    expect(conflictMigration).toContain('resolved_by = actor');
    expect(conflictMigration).toContain("'choice', p_choice");
    expect(conflictPanel).toContain('บันทึกไว้ในบันทึกตรวจสอบ');
  });

  it('is limited to staff of the school that owns the conflict', () => {
    for (const name of ['open_sync_conflicts', 'resolve_sync_conflict']) {
      const body = conflictMigration.slice(conflictMigration.indexOf(`function public.${name}`));
      expect(body.slice(0, 900)).toContain('can_operate_school');
    }
  });
});
