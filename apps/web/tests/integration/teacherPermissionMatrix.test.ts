import { describe, expect, it } from 'vitest';
import { emptySnapshot, type SchoolSnapshot } from '../../src/data/schoolRepository';
import { scopeSchoolSnapshot } from '../../src/data/visibility';
import { isAdvisorOnlyRoute, isRouteAllowed } from '../../src/layouts/navigation';
import {
  canOpenClassMarks, responsibilityOf, teacherCanEditSubject, teacherCanViewClass,
  teacherCanViewScore, teacherCanViewStudent, teacherClassScope, teacherIsAdvisor,
  teacherIsAdvisorAnywhere, teacherOwnedSubjectIds
} from '../../src/data/teacherResponsibilities';
import type { ClassTeacher } from '../../src/domain/types';

/*
 * What a teacher may actually reach, written down.
 *
 * The four responsibilities the school assigns — advisor, assistant advisor, subject owner, subject
 * co-teacher — are not four names for the same thing. They grant different rights, the difference
 * matters most for the two cases that are easy to get wrong (a subject teacher must not read a
 * room's other subjects; a teacher who is on no room must reach nothing at all), and the rules are
 * spread over three modules: the responsibility helpers, the local visibility scope, and the route
 * guard. This walks all three against one school and prints the result, so "what can this teacher
 * do" has an answer that is checked rather than remembered.
 */

const now = '2026-09-01T00:00:00.000Z';
const row = (id: string) => ({ id, schoolId: 'school', version: 1, createdAt: now, updatedAt: now, deletedAt: null });

const link = (
  id: string, classId: string, teacherId: string,
  role: ClassTeacher['role'], subjectId: string | null
): ClassTeacher => ({ ...row(id), classId, teacherId, role, subjectId });

const MA = 'subject-ma';
const SC = 'subject-sc';
const TH = 'subject-th';
const ROOM_A = 'class-a';
const ROOM_B = 'class-b';

/**
 * One school, six teachers, one of each way of being on a staff list — plus the two cases the
 * helpers exist to separate: somebody who owns two subjects in the same room, and somebody who owns
 * nothing anywhere.
 */
function school(): SchoolSnapshot {
  const teacher = (id: string, profileId: string, displayName: string) => ({
    ...row(id), profileId, avatarId: null, avatarPhotoId: null, teacherCode: id.toUpperCase(),
    displayName, email: `${profileId}@example.ac.th`, subject: '',
    verificationStatus: 'verified_teacher' as const, status: 'active' as const
  });
  const student = (id: string) => ({
    ...row(id), profileId: null, studentCode: id, displayName: id, avatarIndex: 0, avatarId: null,
    avatarPhotoId: null, avatarConfig: null, status: 'active' as const
  });

  return {
    ...emptySnapshot,
    ready: true,
    terms: [{ ...row('term'), academicYear: '2569', term: '1', startsOn: '2026-05-16', endsOn: '2026-10-10', status: 'active' }],
    classes: [
      { ...row(ROOM_A), academicTermId: 'term', name: 'ป.5/1', gradeLevel: 'ป.5', capacity: 30, status: 'active' },
      { ...row(ROOM_B), academicTermId: 'term', name: 'ป.5/2', gradeLevel: 'ป.5', capacity: 30, status: 'active' }
    ],
    subjects: [
      { ...row(MA), code: 'MA', name: 'คณิตศาสตร์', nameEn: 'Maths', colorIndex: 1, iconKey: 'math', sortOrder: 0, status: 'active' },
      { ...row(SC), code: 'SC', name: 'วิทยาศาสตร์', nameEn: 'Science', colorIndex: 2, iconKey: 'science', sortOrder: 1, status: 'active' },
      { ...row(TH), code: 'TH', name: 'ภาษาไทย', nameEn: 'Thai', colorIndex: 0, iconKey: 'language', sortOrder: 2, status: 'active' }
    ],
    teachers: [
      teacher('t-advisor', 'p-advisor', 'ครูที่ปรึกษา ป.5/1'),
      teacher('t-assistant', 'p-assistant', 'ผู้ช่วยครูที่ปรึกษา ป.5/1'),
      teacher('t-owner', 'p-owner', 'ครูเจ้าของวิชาคณิต ป.5/1'),
      teacher('t-co', 'p-co', 'ครูร่วมสอนวิทย์ ป.5/1'),
      teacher('t-multi', 'p-multi', 'ครูสองวิชา ป.5/2'),
      teacher('t-outsider', 'p-outsider', 'ครูที่ยังไม่ได้รับห้อง')
    ],
    classTeachers: [
      link('l-advisor', ROOM_A, 't-advisor', 'primary', null),
      link('l-assistant', ROOM_A, 't-assistant', 'assistant', null),
      link('l-owner', ROOM_A, 't-owner', 'primary', MA),
      link('l-co', ROOM_A, 't-co', 'assistant', SC),
      // The case the admin screen could not express: one teacher, one room, two subjects.
      link('l-multi-ma', ROOM_B, 't-multi', 'primary', MA),
      link('l-multi-sc', ROOM_B, 't-multi', 'primary', SC)
    ],
    students: [student('s-a1'), student('s-a2'), student('s-b1')],
    enrollments: [
      { ...row('e-a1'), studentId: 's-a1', classId: ROOM_A, academicTermId: 'term', status: 'active' as const, enrolledAt: now, leftAt: null },
      { ...row('e-a2'), studentId: 's-a2', classId: ROOM_A, academicTermId: 'term', status: 'active' as const, enrolledAt: now, leftAt: null },
      { ...row('e-b1'), studentId: 's-b1', classId: ROOM_B, academicTermId: 'term', status: 'active' as const, enrolledAt: now, leftAt: null }
    ]
  };
}

const snapshot = school();

interface Audit {
  who: string;
  responsibilities: string;
  rooms: string;
  reads: string;
  writes: string;
  guardians: string;
}

function auditOf(profileId: string, who: string): Audit {
  const links = snapshot.classTeachers.filter((item) => {
    const teacherIds = snapshot.teachers.filter((t) => t.profileId === profileId).map((t) => t.id);
    return teacherIds.includes(item.teacherId);
  });
  const name = (id: string | null | undefined) => snapshot.subjects.find((s) => s.id === id)?.name ?? '(ทั้งห้อง)';
  const roomName = (id: string) => snapshot.classes.find((c) => c.id === id)?.name ?? id;

  const rooms = snapshot.classes.filter((c) => canOpenClassMarks(snapshot, 'teacher', profileId, c.id));
  const reads: string[] = [];
  const writes: string[] = [];
  for (const classroom of snapshot.classes) {
    for (const subject of snapshot.subjects) {
      const canRead = teacherCanViewClass(snapshot, profileId, classroom.id)
        && teacherCanViewScore(snapshot, profileId, classroom.id, subject.id);
      const canWrite = teacherCanEditSubject(snapshot, profileId, classroom.id, subject.id);
      if (canRead) reads.push(`${roomName(classroom.id)}·${subject.name}`);
      if (canWrite) writes.push(`${roomName(classroom.id)}·${subject.name}`);
    }
  }
  return {
    who,
    responsibilities: links.map((l) => `${roomName(l.classId)}·${name(l.subjectId)}·${responsibilityOf(l)}`).join(' | ') || '—',
    rooms: rooms.map((c) => c.name).join(', ') || '—',
    reads: reads.join(', ') || '—',
    writes: writes.join(', ') || '—',
    guardians: teacherIsAdvisorAnywhere(snapshot, profileId) ? 'เห็น' : 'ไม่เห็น'
  };
}

describe('what each kind of teacher may reach', () => {
  it('prints the matrix, so the answer is written down rather than remembered', () => {
    const rows = [
      auditOf('p-advisor', 'ครูที่ปรึกษา'),
      auditOf('p-assistant', 'ผู้ช่วยครูที่ปรึกษา'),
      auditOf('p-owner', 'ครูเจ้าของวิชา (คณิต)'),
      auditOf('p-co', 'ครูร่วมสอน (วิทย์)'),
      auditOf('p-multi', 'ครูสองวิชา'),
      auditOf('p-outsider', 'ครูที่ยังไม่ได้รับห้อง')
    ];
    for (const audit of rows) {
      console.log(
        `\n${audit.who}\n  หน้าที่   : ${audit.responsibilities}\n  เข้าห้อง  : ${audit.rooms}` +
        `\n  อ่านคะแนน : ${audit.reads}\n  แก้คะแนน  : ${audit.writes}\n  ผู้ปกครอง : ${audit.guardians}`
      );
    }
    expect(rows).toHaveLength(6);
  });

  it('lets an advisor read every subject in their room and write none of them', () => {
    expect(canOpenClassMarks(snapshot, 'teacher', 'p-advisor', ROOM_A)).toBe(true);
    for (const subject of [MA, SC, TH]) {
      expect(teacherCanViewScore(snapshot, 'p-advisor', ROOM_A, subject), subject).toBe(true);
      // Reading the room's total is not the same right as writing one of its marks. An advisor who
      // does not teach the subject has no mark of their own to enter.
      expect(teacherCanEditSubject(snapshot, 'p-advisor', ROOM_A, subject), subject).toBe(false);
    }
    expect(teacherIsAdvisor(snapshot, 'p-advisor', ROOM_A)).toBe(true);
    // And nothing at all in the room next door.
    expect(canOpenClassMarks(snapshot, 'teacher', 'p-advisor', ROOM_B)).toBe(false);
  });

  it('holds a subject teacher to their own subject, in their own room', () => {
    expect(canOpenClassMarks(snapshot, 'teacher', 'p-owner', ROOM_A)).toBe(true);
    expect(teacherCanViewScore(snapshot, 'p-owner', ROOM_A, MA)).toBe(true);
    expect(teacherCanEditSubject(snapshot, 'p-owner', ROOM_A, MA)).toBe(true);
    // The two that matter: the room's other subjects are not theirs to read or to write.
    for (const subject of [SC, TH]) {
      expect(teacherCanViewScore(snapshot, 'p-owner', ROOM_A, subject), subject).toBe(false);
      expect(teacherCanEditSubject(snapshot, 'p-owner', ROOM_A, subject), subject).toBe(false);
    }
    // Nor is the same subject in a room they were not given.
    expect(canOpenClassMarks(snapshot, 'teacher', 'p-owner', ROOM_B)).toBe(false);
    expect(teacherCanEditSubject(snapshot, 'p-owner', ROOM_B, MA)).toBe(false);
  });

  it('lets a co-teacher read the subject they help with, and write nothing', () => {
    expect(canOpenClassMarks(snapshot, 'teacher', 'p-co', ROOM_A)).toBe(true);
    expect(teacherCanViewScore(snapshot, 'p-co', ROOM_A, SC)).toBe(true);
    // Only the one owner of a class/subject writes its marks, which is what keeps a mark
    // attributable to one person.
    expect(teacherCanEditSubject(snapshot, 'p-co', ROOM_A, SC)).toBe(false);
    expect(teacherCanViewScore(snapshot, 'p-co', ROOM_A, MA)).toBe(false);
  });

  it('gives a teacher of two subjects both of them, and still nothing else', () => {
    const scope = teacherClassScope(snapshot, 'p-multi', ROOM_B);
    expect(scope.assigned).toBe(true);
    expect(scope.advisor).toBe(false);
    expect([...scope.subjectIds].sort()).toEqual([MA, SC].sort());
    expect([...scope.editableSubjectIds].sort()).toEqual([MA, SC].sort());
    expect([...teacherOwnedSubjectIds(snapshot, 'p-multi', ROOM_B)].sort()).toEqual([MA, SC].sort());
    // Two subjects is two rows on the staff list, not a wider licence: the third subject in the
    // same room is still closed.
    expect(teacherCanViewScore(snapshot, 'p-multi', ROOM_B, TH)).toBe(false);
    expect(teacherCanEditSubject(snapshot, 'p-multi', ROOM_B, TH)).toBe(false);
  });

  it('gives a teacher on no staff list nothing at all', () => {
    for (const classroom of [ROOM_A, ROOM_B]) {
      expect(canOpenClassMarks(snapshot, 'teacher', 'p-outsider', classroom), classroom).toBe(false);
      expect(teacherCanViewClass(snapshot, 'p-outsider', classroom), classroom).toBe(false);
      for (const subject of [MA, SC, TH]) {
        expect(teacherCanViewScore(snapshot, 'p-outsider', classroom, subject)).toBe(false);
        expect(teacherCanEditSubject(snapshot, 'p-outsider', classroom, subject)).toBe(false);
      }
    }
    expect(teacherCanViewStudent(snapshot, 'p-outsider', 's-a1')).toBe(false);
    expect(teacherOwnedSubjectIds(snapshot, 'p-outsider').size).toBe(0);
  });

  it('sees only the children of the rooms it was given', () => {
    expect(teacherCanViewStudent(snapshot, 'p-owner', 's-a1')).toBe(true);
    expect(teacherCanViewStudent(snapshot, 'p-owner', 's-b1')).toBe(false);
    expect(teacherCanViewStudent(snapshot, 'p-multi', 's-b1')).toBe(true);
    expect(teacherCanViewStudent(snapshot, 'p-multi', 's-a1')).toBe(false);
  });

  it('scopes the device projection to the same rooms the helpers allow', () => {
    // The local snapshot is the second half of the same rule: a stale projection that still holds a
    // room a teacher has left would show it, whatever the helpers say.
    const asOwner = scopeSchoolSnapshot(snapshot, { role: 'teacher', profileId: 'p-owner' });
    expect(asOwner.classes.map((c) => c.id)).toEqual([ROOM_A]);
    expect(asOwner.students.map((s) => s.id).sort()).toEqual(['s-a1', 's-a2']);

    const asOutsider = scopeSchoolSnapshot(snapshot, { role: 'teacher', profileId: 'p-outsider' });
    expect(asOutsider.classes).toEqual([]);
    expect(asOutsider.students).toEqual([]);
    expect(asOutsider.enrollments).toEqual([]);
  });

  it('keeps the guardians screen with the room, not with the subject', () => {
    // Ringing a parent is the advisor's errand. A teacher who takes one subject in the room has no
    // business holding the school's list of parents and their telephone numbers.
    expect(teacherIsAdvisorAnywhere(snapshot, 'p-advisor')).toBe(true);
    expect(teacherIsAdvisorAnywhere(snapshot, 'p-assistant')).toBe(true);
    expect(teacherIsAdvisorAnywhere(snapshot, 'p-owner')).toBe(false);
    expect(teacherIsAdvisorAnywhere(snapshot, 'p-multi')).toBe(false);
    expect(isAdvisorOnlyRoute('/parents')).toBe(true);
    expect(isAdvisorOnlyRoute('/parents/abc')).toBe(true);
  });

  it('closes the screens a teacher never holds, whatever their responsibility', () => {
    // These are role-level, not staff-list-level: no responsibility promotes a teacher into them.
    for (const route of ['/academic-year', '/platform', '/my-children']) {
      expect(isRouteAllowed('teacher', route), route).toBe(false);
    }
    // And these every teacher holds, because they are about the rooms they were given.
    for (const route of ['/classroom', '/gradebook', '/grade-editor', '/students', '/classes', '/subjects']) {
      expect(isRouteAllowed('teacher', route), route).toBe(true);
    }
  });
});
