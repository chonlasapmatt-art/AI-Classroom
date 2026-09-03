// What the home screen decides to say.
//
// The reasoning is here rather than in the components because these are the judgements that go
// wrong quietly: an alert that fires when nothing is wrong teaches people to ignore the strip, and
// one that stays silent when a change was refused means a teacher believes a mark was saved.

import { describe, expect, it } from 'vitest';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import type { AcademicAuditEntry, Announcement } from '../../src/domain/types';
import {
  dashboardAlerts, lastSyncedLabel, quickActionsFor, recentActivity, recentAnnouncements
} from '../../src/features/dashboard/dashboardData';

const snapshotWith = (patch: Partial<SchoolSnapshot>): SchoolSnapshot =>
  ({ ...emptySnapshot, ready: true, ...patch });

const announcement = (patch: Partial<Announcement> & { id: string }): Announcement => ({
  schoolId: 's', version: 1, createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
  deletedAt: null, classId: 'c1', subjectId: null, title: 'หัวข้อ', body: 'เนื้อหา',
  studentIds: [], createdBy: 'teacher-1', ...patch
});

const audit = (patch: Partial<AcademicAuditEntry> & { id: string; occurredAt: string }): AcademicAuditEntry => ({
  schoolId: 's', version: 1, createdAt: patch.occurredAt, updatedAt: patch.occurredAt, deletedAt: null,
  action: 'SCORE_CREATED', actorProfileId: 'teacher-1', assignmentId: null, studentId: null,
  oldValue: '', newValue: '', reason: '', ...patch
});

describe('what the dashboard raises as an alert', () => {
  it('says nothing at all when nothing is wrong', () => {
    // A card that is almost always reassuring is a card people stop reading, and then it is useless
    // on the day it is not.
    expect(dashboardAlerts(snapshotWith({}), null, { overdue: 0, role: 'teacher' })).toEqual([]);
  });

  it('puts a refused change above everything else', () => {
    const alerts = dashboardAlerts(
      snapshotWith({ blockedSync: 2, pendingSync: 5 }), null, { overdue: 9, role: 'admin' }
    );
    // The server refused it, this device still holds it, and nobody finds out unless they look.
    expect(alerts[0]!.id).toBe('blocked');
    expect(alerts[0]!.tone).toBe('danger');
    expect(alerts[0]!.to).toBe('/operations');
  });

  it('sends only an administrator to the screen that resolves a conflict', () => {
    const forTeacher = dashboardAlerts(snapshotWith({ blockedSync: 1 }), null, { overdue: 0, role: 'teacher' })[0]!;
    // `/operations` is not in a teacher's menu. A link there is a dead end dressed up as an action.
    expect(forTeacher.to).toBeUndefined();
    expect(forTeacher.detail).toContain('แจ้งผู้ดูแลระบบ');
  });

  it('describes a queued change calmly rather than as a failure', () => {
    const alerts = dashboardAlerts(snapshotWith({ pendingSync: 3 }), null, { overdue: 0, role: 'teacher' });
    const pending = alerts.find((alert) => alert.id === 'pending');
    // Local-first: a mark written offline is saved correctly and completely. Red would be a lie.
    expect(pending?.tone).toBe('info');
    expect(pending?.title).toContain('บันทึกไว้ในเครื่องแล้ว');
  });

  it('never leaves an action without a destination, or the reverse', () => {
    for (const role of ['admin', 'teacher', 'student', 'parent'] as const) {
      const alerts = dashboardAlerts(
        snapshotWith({ blockedSync: 1, pendingSync: 1 }), null, { overdue: 2, role }
      );
      expect(alerts.length).toBeGreaterThan(0);
      // Both or neither. A labelled button that goes nowhere is the one shape this must never take.
      for (const alert of alerts) {
        expect(Boolean(alert.to)).toBe(Boolean(alert.actionLabel));
      }
    }
  });

  it('words the overdue alert for who is reading it', () => {
    const asStudent = dashboardAlerts(snapshotWith({}), null, { overdue: 2, role: 'student' })[0]!;
    const asTeacher = dashboardAlerts(snapshotWith({}), null, { overdue: 2, role: 'teacher' })[0]!;
    expect(asStudent.title).toContain('เลยกำหนดส่ง');
    expect(asTeacher.title).toContain('ยังมีนักเรียนไม่ส่ง');
  });

  it('does not tell a guardian about work that is not theirs to chase', () => {
    const alerts = dashboardAlerts(snapshotWith({}), null, { overdue: 5, role: 'parent' });
    expect(alerts.find((alert) => alert.id === 'overdue')).toBeUndefined();
  });
});

describe('the shortcut row', () => {
  it('stays short enough to be an answer rather than a second menu', () => {
    for (const role of ['admin', 'teacher', 'student', 'parent'] as const) {
      expect(quickActionsFor(role, true).length).toBeLessThanOrEqual(4);
      expect(quickActionsFor(role, true).length).toBeGreaterThan(0);
    }
  });

  it('offers creating work only to somebody the server will let create it', () => {
    const withRight = quickActionsFor('teacher', true).map((action) => action.label);
    const without = quickActionsFor('teacher', false).map((action) => action.label);
    expect(withRight).toContain('สร้างงาน');
    // A button that always refuses is a promise the product cannot keep.
    expect(without).not.toContain('สร้างงาน');
  });

  it('never offers a guardian a way to edit academic records', () => {
    const parent = quickActionsFor('parent', true).map((action) => action.to);
    expect(parent).not.toContain('/scores');
    expect(parent).not.toContain('/attendance');
  });
});

describe('which announcements reach whom', () => {
  const snapshot = snapshotWith({
    announcements: [
      announcement({ id: 'a1', classId: 'c1', createdAt: '2026-09-01T08:00:00.000Z' }),
      announcement({ id: 'a2', classId: 'c2', createdAt: '2026-09-02T08:00:00.000Z' }),
      announcement({ id: 'a3', classId: 'c1', studentIds: ['stu-9'], createdAt: '2026-09-03T08:00:00.000Z' }),
      announcement({ id: 'a4', classId: 'c1', deletedAt: '2026-09-03T09:00:00.000Z' })
    ]
  });

  it('keeps to the classes asked for', () => {
    expect(recentAnnouncements(snapshot, ['c1'], null).map((item) => item.id)).toEqual(['a1']);
  });

  it('does not hand a class-wide reader an announcement addressed to named students', () => {
    expect(recentAnnouncements(snapshot, ['c1'], null).map((item) => item.id)).not.toContain('a3');
    expect(recentAnnouncements(snapshot, ['c1'], 'stu-9').map((item) => item.id)).toContain('a3');
  });

  it('leaves deleted announcements deleted', () => {
    expect(recentAnnouncements(snapshot, ['c1'], 'stu-9').map((item) => item.id)).not.toContain('a4');
  });

  it('shows the newest first', () => {
    expect(recentAnnouncements(snapshot, ['c1', 'c2'], 'stu-9').map((item) => item.id)).toEqual(['a3', 'a2', 'a1']);
  });
});

describe('the activity trail', () => {
  it('reads newest first and stops at the limit', () => {
    const snapshot = snapshotWith({
      academicAudit: [
        audit({ id: 'e1', occurredAt: '2026-09-01T08:00:00.000Z' }),
        audit({ id: 'e2', occurredAt: '2026-09-03T08:00:00.000Z' }),
        audit({ id: 'e3', occurredAt: '2026-09-02T08:00:00.000Z' })
      ]
    });
    expect(recentActivity(snapshot).map((entry) => entry.id)).toEqual(['e2', 'e3', 'e1']);
    expect(recentActivity(snapshot, 2).map((entry) => entry.id)).toEqual(['e2', 'e3']);
  });

  it('does not reorder the caller\'s own array', () => {
    const entries = [
      audit({ id: 'e1', occurredAt: '2026-09-01T08:00:00.000Z' }),
      audit({ id: 'e2', occurredAt: '2026-09-03T08:00:00.000Z' })
    ];
    recentActivity(snapshotWith({ academicAudit: entries }));
    expect(entries.map((entry) => entry.id)).toEqual(['e1', 'e2']);
  });
});

describe('when this device last agreed with the server', () => {
  const now = Date.parse('2026-09-03T12:00:00.000Z');

  it('says so in words rather than making the reader do arithmetic', () => {
    expect(lastSyncedLabel('2026-09-03T11:59:40.000Z', now)).toBe('เมื่อครู่นี้');
    expect(lastSyncedLabel('2026-09-03T11:45:00.000Z', now)).toBe('15 นาทีที่แล้ว');
    expect(lastSyncedLabel('2026-09-03T09:00:00.000Z', now)).toBe('3 ชั่วโมงที่แล้ว');
    expect(lastSyncedLabel('2026-09-01T12:00:00.000Z', now)).toBe('2 วันที่แล้ว');
  });

  it('is honest about never having synced', () => {
    // Not "0 นาทีที่แล้ว", which would claim an agreement that never happened.
    expect(lastSyncedLabel(null, now)).toBe('ยังไม่เคยซิงก์บนเครื่องนี้');
  });

  it('does not report a negative age when a clock is ahead', () => {
    expect(lastSyncedLabel('2026-09-03T12:05:00.000Z', now)).toBe('เมื่อครู่นี้');
  });
});
