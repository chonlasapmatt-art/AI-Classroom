import type { ClassTeacher, Role } from '../domain/types';
import type { SchoolSnapshot } from './schoolRepository';

/** The four responsibilities stored by the existing class_teachers model. */
export type TeacherResponsibility =
  | 'CLASS_ADVISOR'
  | 'ASSISTANT_ADVISOR'
  | 'SUBJECT_OWNER'
  | 'SUBJECT_CO_TEACHER';

export function responsibilityOf(link: Pick<ClassTeacher, 'role' | 'subjectId'>): TeacherResponsibility {
  if (link.subjectId) return link.role === 'primary' ? 'SUBJECT_OWNER' : 'SUBJECT_CO_TEACHER';
  return link.role === 'primary' ? 'CLASS_ADVISOR' : 'ASSISTANT_ADVISOR';
}

export const responsibilityLabels: Record<TeacherResponsibility, string> = {
  CLASS_ADVISOR: 'ครูที่ปรึกษา',
  ASSISTANT_ADVISOR: 'ผู้ช่วยครูที่ปรึกษา',
  SUBJECT_OWNER: 'ครูเจ้าของวิชา',
  SUBJECT_CO_TEACHER: 'ครูร่วมสอน'
};

function active(link: Pick<ClassTeacher, 'deletedAt'>): boolean { return link.deletedAt === null; }

export function teacherIdsForProfile(snapshot: SchoolSnapshot, profileId: string): Set<string> {
  return new Set(snapshot.teachers
    .filter((teacher) => teacher.profileId === profileId && teacher.status === 'active' && teacher.deletedAt === null)
    .map((teacher) => teacher.id));
}

export function teacherLinksForProfile(snapshot: SchoolSnapshot, profileId: string, classId?: string): ClassTeacher[] {
  const teacherIds = teacherIdsForProfile(snapshot, profileId);
  return snapshot.classTeachers.filter((link) =>
    active(link) && teacherIds.has(link.teacherId) && (classId === undefined || link.classId === classId));
}

export function teacherCanViewClass(snapshot: SchoolSnapshot, profileId: string, classId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId, classId).length > 0;
}

export function teacherCanViewStudent(snapshot: SchoolSnapshot, profileId: string, studentId: string): boolean {
  const classIds = new Set(teacherLinksForProfile(snapshot, profileId).map((link) => link.classId));
  return snapshot.enrollments.some((enrollment) =>
    enrollment.studentId === studentId && enrollment.status === 'active' && classIds.has(enrollment.classId));
}

/** Advisors can read every subject in an assigned class; subject staff can read their subject. */
export function teacherCanViewScore(
  snapshot: SchoolSnapshot, profileId: string, classId: string, subjectId: string | null
): boolean {
  return teacherLinksForProfile(snapshot, profileId, classId).some((link) =>
    link.subjectId === null || link.subjectId === subjectId);
}

/** Only the one active primary teacher assigned to this class/subject may mutate its scores/content. */
export function teacherCanEditSubject(
  snapshot: SchoolSnapshot, profileId: string, classId: string, subjectId: string | null, academicTermId?: string
): boolean {
  if (!subjectId) return false;
  const classroom = snapshot.classes.find((item) => item.id === classId);
  if (academicTermId && classroom?.academicTermId !== academicTermId) return false;
  return teacherLinksForProfile(snapshot, profileId, classId).some((link) =>
    responsibilityOf(link) === 'SUBJECT_OWNER' && link.subjectId === subjectId);
}

export function teacherOwnedSubjectIds(snapshot: SchoolSnapshot, profileId: string, classId?: string): Set<string> {
  return new Set(teacherLinksForProfile(snapshot, profileId, classId)
    .filter((link) => responsibilityOf(link) === 'SUBJECT_OWNER' && link.subjectId)
    .map((link) => link.subjectId as string));
}

export function canManageAcademicItem(
  snapshot: SchoolSnapshot, role: Role, profileId: string, classId: string, subjectId: string | null
): boolean {
  return role === 'admin' || (role === 'teacher' && teacherCanEditSubject(snapshot, profileId, classId, subjectId));
}
