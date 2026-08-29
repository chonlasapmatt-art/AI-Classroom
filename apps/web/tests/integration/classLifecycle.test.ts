import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import { activeClasses, rosterFor } from '../../src/data/selectors';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function currentSnapshot(repository: FixtureSchoolRepository): SchoolSnapshot {
  let captured: SchoolSnapshot | null = null;
  const unsubscribe = repository.subscribe((snapshot) => { captured = snapshot; });
  unsubscribe();
  if (!captured) throw new Error('repository did not publish a snapshot');
  return captured;
}

describe('class lifecycle', () => {
  let repository: FixtureSchoolRepository;
  beforeEach(() => { repository = new FixtureSchoolRepository(); });

  it('creates a class', async () => {
    const before = currentSnapshot(repository);
    await repository.saveClass({ id: 'class-new', name: 'ป.5/9', gradeLevel: 'ประถมศึกษาปีที่ 5', academicTermId: before.terms[0]!.id });
    const after = currentSnapshot(repository);
    expect(after.classes).toHaveLength(before.classes.length + 1);
    expect(after.classes.find((item) => item.id === 'class-new')?.name).toBe('ป.5/9');
  });

  it('renames a class without touching its roster', async () => {
    const before = currentSnapshot(repository);
    const classroom = before.classes.find((item) => item.id === repository.primaryClassId)!;
    const rosterSize = rosterFor(before, classroom.id).length;

    await repository.saveClass({
      id: classroom.id, name: 'ป.5/1 (ห้องเรียนรวม)', gradeLevel: classroom.gradeLevel, academicTermId: classroom.academicTermId
    });

    const after = currentSnapshot(repository);
    const renamed = after.classes.find((item) => item.id === classroom.id)!;
    expect(renamed.name).toBe('ป.5/1 (ห้องเรียนรวม)');
    expect(renamed.status).toBe('active');
    expect(rosterFor(after, classroom.id)).toHaveLength(rosterSize);
  });

  it('archives then restores a class', async () => {
    const classId = 'fixture-class-3';
    await repository.archiveClass(classId);
    let snapshot = currentSnapshot(repository);
    expect(snapshot.classes.find((item) => item.id === classId)?.status).toBe('archived');
    expect(activeClasses(snapshot).some((item) => item.id === classId)).toBe(false);

    await repository.restoreClass(classId);
    snapshot = currentSnapshot(repository);
    expect(snapshot.classes.find((item) => item.id === classId)?.status).toBe('active');
    expect(activeClasses(snapshot).some((item) => item.id === classId)).toBe(true);
  });

  it('refuses to delete a class that still has students', async () => {
    await expect(repository.deleteClass(repository.primaryClassId)).rejects.toThrow('ย้ายห้องก่อนจึงจะลบได้');
    expect(currentSnapshot(repository).classes.some((item) => item.id === repository.primaryClassId)).toBe(true);
  });

  it('deletes an empty class and drops its teacher assignments', async () => {
    const before = currentSnapshot(repository);
    const term = before.terms[0]!;
    const target = before.classes.find((item) => item.id === 'fixture-class-3')!;

    for (const student of rosterFor(before, target.id)) {
      await repository.transferStudent(student.id, repository.primaryClassId, term.id);
    }
    await repository.deleteClass(target.id);

    const after = currentSnapshot(repository);
    expect(after.classes.some((item) => item.id === target.id)).toBe(false);
    expect(after.classTeachers.some((item) => item.classId === target.id)).toBe(false);
    expect(after.attendance.length).toBe(before.attendance.length);
  });
});
