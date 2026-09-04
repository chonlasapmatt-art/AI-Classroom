import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DexieSchoolRepository } from '../../src/data/dexieSchoolRepository';
import { db } from '../../src/db/database';
import { bonusTotalFor, recentScoreEvents, scoreEventsFor } from '../../src/data/selectors';
import { emptySnapshot } from '../../src/data/schoolRepository';
import type { ScoreEvent } from '../../src/domain/types';

const schoolId = '88888888-8888-4888-8888-888888888888';
const migration = readFileSync(
  join(resolve(process.cwd(), '../..'), 'supabase/migrations/202608300018_score_events.sql'), 'utf8');

describe('awarding points from the board', () => {
  const repository = new DexieSchoolRepository(schoolId);

  beforeEach(async () => {
    await Promise.all([db.scoreEvents.clear(), db.syncQueue.clear()]);
  });

  it('writes locally first and queues the award for the server', async () => {
    await repository.awardScoreEvent({
      studentId: 'student-1', classId: 'class-1', subjectId: null, category: 'bonus',
      points: 5, reason: 'ช่วยงานห้องเรียน', sourceType: 'board', awardedBy: 'teacher-1'
    });

    const events = await db.scoreEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      studentId: 'student-1', points: 5, category: 'bonus', reason: 'ช่วยงานห้องเรียน', sourceType: 'board'
    });

    const queued = await db.syncQueue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.entityType).toBe('score_event');
    expect(queued[0]!.operation).toBe('upsert');
  });

  it('keeps every award instead of updating a running total', async () => {
    for (const points of [5, 1, -2]) {
      await repository.awardScoreEvent({
        studentId: 'student-1', category: 'bonus', points, awardedBy: 'teacher-1'
      });
    }
    const events = await db.scoreEvents.toArray();
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.points).sort((a, b) => a - b)).toEqual([-2, 1, 5]);
  });

  it('refuses a value that would poison every total', async () => {
    const award = (points: number) => repository.awardScoreEvent({
      studentId: 'student-1', category: 'bonus', points, awardedBy: 'teacher-1'
    });
    await expect(award(Number.NaN)).rejects.toThrow(/ตัวเลข/);
    await expect(award(Number.POSITIVE_INFINITY)).rejects.toThrow(/ตัวเลข/);
    await expect(award(0)).rejects.toThrow(/ศูนย์/);
    await expect(award(5000)).rejects.toThrow(/-1000/);
    expect(await db.scoreEvents.count()).toBe(0);
  });

  it('rounds to the precision the column stores', async () => {
    await repository.awardScoreEvent({
      studentId: 'student-1', category: 'bonus', points: 2.567, awardedBy: 'teacher-1'
    });
    expect((await db.scoreEvents.toArray())[0]!.points).toBe(2.57);
  });
});

describe('reading awards back', () => {
  const event = (over: Partial<ScoreEvent>): ScoreEvent => ({
    id: over.id ?? 'event-1', schoolId, version: 1, createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z', deletedAt: null, studentId: 'student-1', classId: 'class-1',
    subjectId: null, category: 'bonus', points: 5, reason: '', sourceType: 'board', sourceId: null,
    awardedBy: 'teacher-1', occurredAt: '2026-08-30T00:00:00.000Z', ...over
  });

  const snapshot = {
    ...emptySnapshot,
    students: [
      { id: 'student-1', schoolId, version: 1, createdAt: '', updatedAt: '', deletedAt: null, profileId: null, studentCode: '001', displayName: 'ก ข', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' as const }
    ],
    enrollments: [
      { id: 'enrollment-1', schoolId, version: 1, createdAt: '', updatedAt: '', deletedAt: null, studentId: 'student-1', classId: 'class-1', academicTermId: 'term-1', status: 'active' as const, enrolledAt: '', leftAt: null }
    ],
    scoreEvents: [
      event({ id: 'event-1', points: 5, occurredAt: '2026-08-30T01:00:00.000Z' }),
      event({ id: 'event-2', points: -2, occurredAt: '2026-08-30T02:00:00.000Z' }),
      event({ id: 'event-3', points: 3, subjectId: 'subject-1', occurredAt: '2026-08-30T03:00:00.000Z' }),
      event({ id: 'event-4', points: 99, deletedAt: '2026-08-30T04:00:00.000Z' })
    ]
  };

  it('lists a student’s awards newest first and ignores removed ones', () => {
    const events = scoreEventsFor(snapshot, 'student-1');
    expect(events.map((item) => item.id)).toEqual(['event-3', 'event-2', 'event-1']);
  });

  it('totals what the board added on top of marked work', () => {
    expect(bonusTotalFor(snapshot, 'student-1')).toBe(6);
    expect(bonusTotalFor(snapshot, 'student-1', 'subject-1')).toBe(3);
  });

  it('shows the most recent awards in a class', () => {
    const recent = recentScoreEvents(snapshot, 'class-1', 2);
    expect(recent.map((item) => item.id)).toEqual(['event-3', 'event-2']);
  });
});

describe('who may write a score — server side', () => {
  it('accepts the new entity through the same trusted mutation as every other write', () => {
    expect(migration).toContain("'timetable_entry','achievement','score_event') then raise exception 'VALIDATION_ERROR: unsupported entity'");
    expect(migration).toContain("when 'score_event' then select version,student_id,class_id into current_version,student_scope,class_scope from public.score_events");
    expect(migration).toContain('insert into public.score_events(id,school_id,student_id,class_id,subject_id,category,points,reason,source_type,source_id,awarded_by,occurred_at,version)');
  });

  it('lets only school staff write one, whatever the screen offered', () => {
    expect(migration).toContain("if p_entity_type='score_event' and not (public.has_school_role(p_school_id,'admin') or public.has_school_role(p_school_id,'teacher')) then raise exception 'FORBIDDEN'");
    expect(migration).toContain('revoke insert, update, delete on public.score_events from authenticated');
  });

  it('shows an award to the student it belongs to and to a consented parent, and nobody else', () => {
    expect(migration).toContain('alter table public.score_events enable row level security');
    const policy = migration.slice(
      migration.indexOf('create policy score_events_scoped_read'),
      migration.indexOf('grant select on public.score_events'));
    expect(policy).toContain('public.student_owns_student_record(student_id)');
    expect(policy).toContain('public.parent_has_active_link(student_id) and public.parent_has_active_consent(student_id)');
    expect(policy).toContain("public.has_school_role(school_id,'teacher')");
  });

  it('rejects a number that is not a number', () => {
    expect(migration).toContain('check (points = points and points between -1000 and 1000)');
  });

  it('records the award as its own row so history cannot be rewritten', () => {
    expect(migration).toContain('Correcting a score adds another event rather than rewriting this');
    expect(migration).toContain("awarded_by uuid references public.user_profiles(id)");
    expect(migration).toContain('occurred_at timestamptz not null default now()');
  });
});

/**
 * Who the sync boundary lets write a score.
 *
 * These read the migration rather than a live database, which is the same trade every schema test
 * in this suite makes: the text is the authority that ships, and an assertion on it catches the
 * widening that a screen test never would.
 */
describe('a score belongs to the teacher who teaches the student', () => {
  const awardScope = readFileSync(
    join(resolve(process.cwd(), '../..'), 'supabase/migrations/202609040001_awards_stay_with_the_teacher.sql'), 'utf8');

  it('asks one function whether this staff member may award this student', () => {
    expect(awardScope).toContain('create or replace function public.staff_can_award_student(p_school_id uuid, p_student_id uuid, p_class_id uuid)');
    expect(awardScope).toMatch(/has_school_role\(p_school_id,'admin'\)/);
    expect(awardScope).toMatch(/e\.status='active' and e\.deleted_at is null/);
    expect(awardScope).toMatch(/public\.teacher_has_class_access\(e\.class_id\)/);
  });

  it('keeps that function callable by a session but never by an anonymous caller', () => {
    expect(awardScope).toMatch(/revoke all on function public\.staff_can_award_student\(uuid,uuid,uuid\) from public,anon/);
    expect(awardScope).toMatch(/grant execute on function public\.staff_can_award_student\(uuid,uuid,uuid\) to authenticated/);
  });

  it('applies it to every kind of award', () => {
    expect(awardScope).toContain("if p_entity_type in ('activity_score','test_score','score_event') and not public.staff_can_award_student(");
    expect(awardScope).toContain("if p_entity_type='achievement' and not public.staff_can_award_student(");
  });

  it('no longer lets a student write a score for themselves', () => {
    // The submission keeps the exemption — turning work in is the student's own act — and nothing
    // else does. A single list held both until now.
    expect(awardScope).not.toMatch(/'activity_score','test_score','submission','score_event'\) and not \([\s\S]{0,200}student_owns_student_record/);
    expect(awardScope).toMatch(/if p_entity_type='submission' and not \([\s\S]{0,240}student_owns_student_record/);
  });

  it('still refuses a student who writes work for somebody else', () => {
    expect(awardScope).toMatch(/student_owns_student_record\(coalesce\(student_scope,\(p_payload->>'studentId'\)::uuid\)\)/);
  });
});
