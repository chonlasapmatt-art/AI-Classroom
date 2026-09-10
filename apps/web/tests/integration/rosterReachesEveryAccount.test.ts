import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * One classroom machine, several people.
 *
 * A device's place in the mutation journal used to be remembered per browser. The first account to
 * sync drained the journal to its end; every account that signed in on that same browser afterwards
 * asked for "everything after the last revision I saw" and was told, correctly, that there was
 * nothing. School structure is mirrored in full on every pull, so the room still appeared — but
 * students and enrolments travel only through the journal, so the room appeared with nobody in it.
 *
 * Production had one browser that thirteen different accounts had registered.
 */

interface JournalRow { revision: number; entityType: string; entityId: string; operation: string; version: number }

const journal: JournalRow[] = [
  { revision: 1, entityType: 'student', entityId: 'student-1', operation: 'upsert', version: 1 },
  { revision: 2, entityType: 'student', entityId: 'student-2', operation: 'upsert', version: 1 },
  { revision: 3, entityType: 'enrollment', entityId: 'enrolment-1', operation: 'upsert', version: 1 }
];

const serverRows: Record<string, Record<string, Record<string, unknown>>> = {
  students: {
    'student-1': { id: 'student-1', school_id: 'school-1', display_name: 'เด็กหญิงหนึ่ง', status: 'active' },
    'student-2': { id: 'student-2', school_id: 'school-1', display_name: 'เด็กชายสอง', status: 'active' }
  },
  student_class_enrollments: {
    'enrolment-1': { id: 'enrolment-1', school_id: 'school-1', student_id: 'student-1', class_id: 'class-1', status: 'active' }
  }
};

/** How many changes one `sync_pull` is allowed to answer with, so paging can be exercised. */
let pageSize = 500;
const pulls: { after: number }[] = [];

const client = {
  rpc: (name: string, params: Record<string, unknown>) => {
    if (name !== 'sync_pull') throw new Error(`unexpected rpc ${name}`);
    const after = Number(params.p_after_revision);
    pulls.push({ after });
    const page = journal.filter((row) => row.revision > after).slice(0, pageSize);
    const nextRevision = page.at(-1)?.revision ?? after;
    return Promise.resolve({
      data: { changes: page, nextRevision, serverTime: new Date().toISOString(), minimumSupportedProtocol: 1 },
      error: null
    });
  },
  from: (table: string) => ({
    select: () => ({
      eq: (_column: string, id: string) => ({
        limit: () => Promise.resolve({ data: [serverRows[table]?.[id]].filter(Boolean), error: null })
      })
    })
  })
};

vi.mock('../../src/services/supabase', () => ({
  isCloudConfigured: true,
  supabase: null,
  requireSupabase: () => client
}));

const { pullChanges, syncCursorKey } = await import('../../src/sync/engine');
const { db } = await import('../../src/db/database');

const SCHOOL = 'school-1';
const DEVICE = 'device-1';

beforeEach(async () => {
  pageSize = 500;
  pulls.length = 0;
  await db.students.clear();
  await db.enrollments.clear();
  await db.syncState.clear();
});

describe('the roster reaches every account that signs in on one device', () => {
  it('gives the second account its own place in the journal', async () => {
    const first = await pullChanges(SCHOOL, DEVICE, 'teacher-profile');
    expect(first).toBe(3);
    await db.students.clear();
    await db.enrollments.clear();

    // The same browser, the same device id, a different person.
    const second = await pullChanges(SCHOOL, DEVICE, 'student-profile');
    expect(second).toBe(3);
    expect(await db.students.count()).toBe(2);
    expect(await db.enrollments.count()).toBe(1);
  });

  it('keeps one cursor per account rather than one per device', async () => {
    await pullChanges(SCHOOL, DEVICE, 'teacher-profile');
    await pullChanges(SCHOOL, DEVICE, 'student-profile');

    const teacher = await db.syncState.get(syncCursorKey(SCHOOL, DEVICE, 'teacher-profile'));
    const student = await db.syncState.get(syncCursorKey(SCHOOL, DEVICE, 'student-profile'));
    expect(teacher?.lastPullRevision).toBe(3);
    expect(student?.lastPullRevision).toBe(3);
    expect(teacher?.key).not.toBe(student?.key);
    // Both accounts asked from the beginning; neither inherited the other's watermark.
    expect(pulls.filter((pull) => pull.after === 0)).toHaveLength(2);
  });

  it('asks again until the journal is exhausted rather than stopping at one page', async () => {
    pageSize = 1;
    const applied = await pullChanges(SCHOOL, DEVICE, 'teacher-profile');
    expect(applied).toBe(3);
    expect(await db.students.count()).toBe(2);
    expect(pulls.map((pull) => pull.after)).toEqual([0, 1, 2, 3]);
  });

  it('stops asking once the account is level with the server', async () => {
    await pullChanges(SCHOOL, DEVICE, 'teacher-profile');
    pulls.length = 0;
    const applied = await pullChanges(SCHOOL, DEVICE, 'teacher-profile');
    expect(applied).toBe(0);
    expect(pulls).toHaveLength(1);
  });
});
