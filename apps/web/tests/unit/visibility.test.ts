import { describe, expect, it } from 'vitest';
import type { SchoolSnapshot } from '../../src/data/schoolRepository';
import { emptySnapshot } from '../../src/data/schoolRepository';
import { scopeSchoolSnapshot } from '../../src/data/visibility';

const record = <T extends object>(id: string, extra?: T): { id: string; schoolId: string; version: number; createdAt: string; updatedAt: string; deletedAt: null } & T => ({
  id, schoolId: 'school-1', version: 1, createdAt: '', updatedAt: '', deletedAt: null, ...extra
} as { id: string; schoolId: string; version: number; createdAt: string; updatedAt: string; deletedAt: null } & T);

function sample(): SchoolSnapshot {
  return {
    ...emptySnapshot,
    ready: true,
    terms: [record('term-1'), record('term-2')].map((row, index) => ({ ...row, academicYear: '2569', term: String(index + 1), startsOn: '', endsOn: '', status: 'active' as const })),
    classes: [record('class-1', { academicTermId: 'term-1', name: 'ป.1/1', gradeLevel: 'ป.1', capacity: 40, status: 'active' as const }), record('class-2', { academicTermId: 'term-2', name: 'ป.2/1', gradeLevel: 'ป.2', capacity: 40, status: 'active' as const })],
    teachers: [record('teacher-1', { profileId: 'profile-teacher-1', avatarId: null, avatarPhotoId: null, teacherCode: 'T1', displayName: 'ครูหนึ่ง', email: '', subject: '', verificationStatus: 'verified_teacher' as const, status: 'active' as const }), record('teacher-2', { profileId: 'profile-teacher-2', avatarId: null, avatarPhotoId: null, teacherCode: 'T2', displayName: 'ครูสอง', email: '', subject: '', verificationStatus: 'verified_teacher' as const, status: 'active' as const })],
    classTeachers: [record('link-1', { classId: 'class-1', teacherId: 'teacher-1', role: 'primary' as const }), record('link-2', { classId: 'class-2', teacherId: 'teacher-2', role: 'primary' as const })],
    students: [record('student-1', { profileId: 'profile-student-1', studentCode: 'S1', displayName: 'นักเรียนหนึ่ง', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' as const }), record('student-2', { profileId: 'profile-student-2', studentCode: 'S2', displayName: 'นักเรียนสอง', avatarIndex: 0, avatarConfig: null, avatarId: null, avatarPhotoId: null, status: 'active' as const })],
    parentLinks: [record('parent-link-1', { studentId: 'student-1', profileId: 'profile-parent-1', avatarId: null, avatarPhotoId: null, parentName: 'ผู้ปกครองหนึ่ง', relationship: 'มารดา', contact: '', lineUserId: null, status: 'linked' as const, invitationCode: null, consentVersion: null, consentGrantedAt: null }), record('parent-link-2', { studentId: 'student-2', profileId: 'profile-parent-2', avatarId: null, avatarPhotoId: null, parentName: 'ผู้ปกครองสอง', relationship: 'บิดา', contact: '', lineUserId: null, status: 'linked' as const, invitationCode: null, consentVersion: null, consentGrantedAt: null })],
    enrollments: [record('enrollment-1', { studentId: 'student-1', classId: 'class-1', academicTermId: 'term-1', status: 'active' as const, enrolledAt: '', leftAt: null }), record('enrollment-2', { studentId: 'student-2', classId: 'class-2', academicTermId: 'term-2', status: 'active' as const, enrolledAt: '', leftAt: null })],
    assignments: [record('assignment-1', { classId: 'class-1', subjectId: null, workType: 'assignment' as const, title: 'งานหนึ่ง', description: '', instructions: '', assignedAt: '', startAt: null, dueAt: null, maxScore: 10, rubricId: null, reminderOffsets: [], status: 'published' as const, publishedAt: null, cancelledAt: null }), record('assignment-2', { classId: 'class-2', subjectId: null, workType: 'assignment' as const, title: 'งานสอง', description: '', instructions: '', assignedAt: '', startAt: null, dueAt: null, maxScore: 10, rubricId: null, reminderOffsets: [], status: 'published' as const, publishedAt: null, cancelledAt: null })],
  };
}

describe('role room visibility', () => {
  it('keeps a teacher inside assigned rooms and their rosters', () => {
    const view = scopeSchoolSnapshot(sample(), { role: 'teacher', profileId: 'profile-teacher-1' });
    expect(view.classes.map((item) => item.id)).toEqual(['class-1']);
    expect(view.students.map((item) => item.id)).toEqual(['student-1']);
    expect(view.assignments.map((item) => item.id)).toEqual(['assignment-1']);
    expect(view.teachers.map((item) => item.id)).toEqual(['teacher-1']);
  });

  it('keeps a student inside the student’s own room only', () => {
    const view = scopeSchoolSnapshot(sample(), { role: 'student', profileId: 'profile-student-1' });
    expect(view.classes.map((item) => item.id)).toEqual(['class-1']);
    expect(view.students.map((item) => item.id)).toEqual(['student-1']);
    expect(view.assignments.map((item) => item.id)).toEqual(['assignment-1']);
  });

  it('does not reduce the super admin projection', () => {
    const view = scopeSchoolSnapshot(sample(), { role: 'admin', profileId: 'profile-admin' });
    expect(view.classes).toHaveLength(2);
    expect(view.students).toHaveLength(2);
  });

  it('keeps a parent inside only their linked child room', () => {
    const view = scopeSchoolSnapshot(sample(), { role: 'parent', profileId: 'profile-parent-1' });
    expect(view.classes.map((item) => item.id)).toEqual(['class-1']);
    expect(view.students.map((item) => item.id)).toEqual(['student-1']);
    expect(view.parentLinks.map((item) => item.id)).toEqual(['parent-link-1']);
  });
});
