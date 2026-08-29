import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import { rosterFor, unreadNotifications } from '../../src/data/selectors';
import { attachmentKindFor } from '../../src/data/attachmentKind';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function currentSnapshot(repository: FixtureSchoolRepository): SchoolSnapshot {
  let captured: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((snapshot) => { captured = snapshot; });
  unsubscribe();
  if (!captured) throw new Error('repository did not publish a snapshot');
  return captured;
}

describe('classroom file exchange', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('recognises the formats a classroom exchanges', () => {
    expect(attachmentKindFor('ใบงาน.pdf', 'application/pdf')).toBe('pdf');
    expect(attachmentKindFor('คะแนน.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('spreadsheet');
    expect(attachmentKindFor('รายชื่อ.csv', 'text/csv')).toBe('csv');
    expect(attachmentKindFor('บันทึก.docx', '')).toBe('document');
    expect(attachmentKindFor('ภาพงาน.png', 'image/png')).toBe('image');
  });

  it('hands teacher material to the whole class with a notification each', async () => {
    const before = currentSnapshot(repository);
    const assignment = before.assignments.find((item) => item.status === 'published')!;
    const roster = rosterFor(before, repository.primaryClassId);
    const file = new File(['%PDF-1.7'], 'ใบงานระบบสุริยะ.pdf', { type: 'application/pdf' });

    await repository.addAttachment({
      ownerType: 'assignment', ownerId: assignment.id, file, uploadedBy: 'preview-teacher',
      notify: { classId: assignment.classId, studentIds: roster.map((student) => student.id), assignmentId: assignment.id, title: 'เอกสารใหม่' }
    });

    const after = currentSnapshot(repository);
    const shared = after.attachments.find((item) => item.ownerId === assignment.id)!;
    expect(shared.kind).toBe('pdf');
    expect(shared.storagePath).not.toBeNull();
    expect(await repository.openAttachment(shared.id)).toBeInstanceOf(Blob);

    for (const student of roster) {
      expect(unreadNotifications(after, student.id).some((item) => item.body.includes('ใบงานระบบสุริยะ.pdf'))).toBe(true);
    }
  });

  it('keeps each student turn-in under its own owner id', async () => {
    const before = currentSnapshot(repository);
    const assignment = before.assignments.find((item) => item.status === 'published')!;
    const [first, second] = rosterFor(before, repository.primaryClassId);

    await repository.addAttachment({
      ownerType: 'submission', ownerId: `${assignment.id}:${first!.id}`,
      file: new File(['ก,ข\n1,2'], 'งานของฉัน.csv', { type: 'text/csv' }), uploadedBy: first!.id
    });
    await repository.addAttachment({
      ownerType: 'submission', ownerId: `${assignment.id}:${second!.id}`,
      file: new File(['%PDF-1.7'], 'รายงาน.pdf', { type: 'application/pdf' }), uploadedBy: second!.id
    });
    await repository.submitWork(assignment.id, first!.id, 'แนบไฟล์แล้วครับ', false);

    const after = currentSnapshot(repository);
    const firstFiles = after.attachments.filter((item) => item.ownerId === `${assignment.id}:${first!.id}`);
    const secondFiles = after.attachments.filter((item) => item.ownerId === `${assignment.id}:${second!.id}`);
    expect(firstFiles.map((item) => item.fileName)).toEqual(['งานของฉัน.csv']);
    expect(secondFiles.map((item) => item.fileName)).toEqual(['รายงาน.pdf']);
    expect(after.submissions.find((item) => item.assignmentId === assignment.id && item.studentId === first!.id)?.status).toBe('submitted');
  });

  it('deleting one file leaves the rest of the class material alone', async () => {
    const assignment = currentSnapshot(repository).assignments[0]!;
    await repository.addAttachment({ ownerType: 'assignment', ownerId: assignment.id, file: new File(['a'], 'a.pdf', { type: 'application/pdf' }), uploadedBy: 't' });
    await repository.addAttachment({ ownerType: 'assignment', ownerId: assignment.id, file: new File(['b'], 'b.csv', { type: 'text/csv' }), uploadedBy: 't' });

    const listed = currentSnapshot(repository).attachments.filter((item) => item.ownerId === assignment.id);
    expect(listed).toHaveLength(2);

    await repository.removeAttachment(listed[0]!.id);
    const remaining = currentSnapshot(repository).attachments.filter((item) => item.ownerId === assignment.id);
    expect(remaining.map((item) => item.fileName)).toEqual(['b.csv']);
  });
});
