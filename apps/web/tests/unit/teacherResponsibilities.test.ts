import { describe, expect, it } from 'vitest';
import { FixtureSchoolRepository } from '../../src/data/fixtureSchoolRepository';
import {
  responsibilityOf, teacherCanEditSubject, teacherCanViewClass, teacherCanViewStudent
} from '../../src/data/teacherResponsibilities';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';

function fixtureSnapshot(repository: FixtureSchoolRepository): SchoolSnapshot {
  let current!: SchoolSnapshot;
  const stop = repository.subscribe((snapshot) => { current = snapshot; });
  stop();
  return current;
}

describe('teacher responsibility matrix', () => {
  it('distinguishes advisor, assistant, owner and co-teacher rows', () => {
    expect(responsibilityOf({ role: 'primary', subjectId: null })).toBe('CLASS_ADVISOR');
    expect(responsibilityOf({ role: 'assistant', subjectId: null })).toBe('ASSISTANT_ADVISOR');
    expect(responsibilityOf({ role: 'primary', subjectId: 'subject-science' })).toBe('SUBJECT_OWNER');
    expect(responsibilityOf({ role: 'assistant', subjectId: 'subject-science' })).toBe('SUBJECT_CO_TEACHER');
  });

  it('lets the preview teacher read the assigned room but edit only the owned subject', () => {
    const repository = new FixtureSchoolRepository();
    repository.setVisibility({ role: 'teacher', profileId: 'preview-teacher' });
    const snapshot = fixtureSnapshot(repository);
    expect(teacherCanViewClass(snapshot, 'preview-teacher', 'fixture-class-1')).toBe(true);
    expect(teacherCanViewClass(snapshot, 'preview-teacher', 'fixture-class-2')).toBe(false);
    expect(teacherCanViewStudent(snapshot, 'preview-teacher', 'fixture-student-1')).toBe(true);
    expect(teacherCanEditSubject(snapshot, 'preview-teacher', 'fixture-class-1', 'fixture-subject-SC')).toBe(true);
    expect(teacherCanEditSubject(snapshot, 'preview-teacher', 'fixture-class-1', 'fixture-subject-MA')).toBe(false);
  });

  it('keeps separate responsibility rows and enforces one advisor/owner per scope in preview', async () => {
    const repository = new FixtureSchoolRepository();
    await repository.assignTeacher('fixture-class-1', 'fixture-teacher-1', 'primary', 'fixture-subject-MA');
    const snapshot = fixtureSnapshot(repository);
    expect(snapshot.classTeachers.filter((row) => row.classId === 'fixture-class-1' && row.teacherId === 'fixture-teacher-1')).toHaveLength(3);
    await expect(repository.assignTeacher('fixture-class-1', 'fixture-teacher-2', 'primary', null)).rejects.toThrow('ครูที่ปรึกษาแล้ว');
    await expect(repository.assignTeacher('fixture-class-1', 'fixture-teacher-2', 'primary', 'fixture-subject-SC')).rejects.toThrow('ครูเจ้าของวิชาแล้ว');
  });
});
