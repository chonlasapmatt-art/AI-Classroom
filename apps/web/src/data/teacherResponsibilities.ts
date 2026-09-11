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

/**
 * A responsibility on the room rather than on one of its subjects.
 *
 * The field is optional and nullable, and the two absences mean the same thing -- a link with no
 * subject is an advisor's link. Comparing against `null` alone read an omitted key as a
 * responsibility for a subject whose id happened to be undefined, so an advisor advised nothing.
 */
function isRoomWide(link: Pick<ClassTeacher, 'subjectId'>): boolean {
  return link.subjectId === null || link.subjectId === undefined;
}

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
    isRoomWide(link) || link.subjectId === subjectId);
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

/**
 * The rooms a teacher is on the staff list for.
 *
 * This is the outer gate on everything to do with marks. A teacher who was never put in charge of a
 * room has no business reading that room's marks, and a picker that offers every room in the school
 * is how a teacher ends up looking at one — so the picker is built from this rather than filtered
 * after the fact.
 */
export function teacherClassIds(snapshot: SchoolSnapshot, profileId: string): Set<string> {
  return new Set(teacherLinksForProfile(snapshot, profileId).map((link) => link.classId));
}

/** An advisor is on the room itself rather than on one of its subjects. */
export function teacherIsAdvisor(snapshot: SchoolSnapshot, profileId: string, classId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId, classId).some(isRoomWide);
}

/**
 * The rooms this teacher looks after, as opposed to the rooms they teach in.
 *
 * A narrower gate than `teacherClassIds`, and deliberately so. Teaching one subject in six rooms
 * makes somebody responsible for six columns of marks; being a room's advisor makes them
 * responsible for twenty-eight children's whole reports, and those are different jobs with
 * different screens. The room book is the second one's, so it asks this rather than asking who
 * teaches where.
 */
export function teacherAdvisedClassIds(snapshot: SchoolSnapshot, profileId: string): Set<string> {
  return new Set(teacherLinksForProfile(snapshot, profileId).filter(isRoomWide).map((link) => link.classId));
}

export interface TeacherClassScope {
  /** Whether the teacher is on this room at all. Everything else is meaningless when false. */
  assigned: boolean;
  /** An advisor reads the whole room: every subject, and the totals that combine them. */
  advisor: boolean;
  /** The subjects this teacher teaches in the room, whether as owner or as a co-teacher. */
  subjectIds: Set<string>;
  /** The subjects this teacher may write marks into: the ones they own. */
  editableSubjectIds: Set<string>;
}

/**
 * What one teacher may see and change in one room.
 *
 * Three separate answers, because they are genuinely three different rights: being on the room at
 * all, being allowed to read the room's combined marks, and being allowed to write a mark. A
 * subject teacher reads and writes their own subject and nothing else; the advisor reads everything
 * in their room, because a total that omits half the subjects is not a total; and a teacher who is
 * on neither gets nothing, which is the case that used to leak through a class picker listing every
 * room in the school.
 */
export function teacherClassScope(
  snapshot: SchoolSnapshot, profileId: string, classId: string
): TeacherClassScope {
  const links = teacherLinksForProfile(snapshot, profileId, classId);
  const advisor = links.some(isRoomWide);
  const subjectIds = new Set(links.filter((link) => link.subjectId).map((link) => link.subjectId as string));
  const editableSubjectIds = new Set(links
    .filter((link) => responsibilityOf(link) === 'SUBJECT_OWNER' && link.subjectId)
    .map((link) => link.subjectId as string));
  return { assigned: links.length > 0, advisor, subjectIds, editableSubjectIds };
}

/**
 * Whether this account may open the marks of a room at all.
 *
 * An administrator may; a teacher may when they are on the room's staff list. Nobody else does, and
 * that includes a teacher who teaches the same subject in a different room.
 */
export function canOpenClassMarks(
  snapshot: SchoolSnapshot, role: Role, profileId: string, classId: string
): boolean {
  if (role === 'admin') return true;
  if (role !== 'teacher') return false;
  return teacherClassScope(snapshot, profileId, classId).assigned;
}

/**
 * Whether this teacher looks after a room, anywhere in the school.
 *
 * An advisor or their assistant is on the room itself rather than on one of its subjects, and that
 * is the difference that decides who holds the guardians' screen: the person who would ring a
 * parent, not everybody who teaches the child something.
 */
export function teacherIsAdvisorAnywhere(snapshot: SchoolSnapshot, profileId: string): boolean {
  return teacherLinksForProfile(snapshot, profileId).some(isRoomWide);
}

/**
 * The teacher a subject is already assigned to, for filling in a timetable slot.
 *
 * Somebody has already answered "who takes this subject with this class" on the class screen, and
 * the timetable made them answer it again from a list of every member of staff — twice a period,
 * forty periods a week, with a picker that does not say which of those teachers has anything to do
 * with the subject just chosen. Mismatches followed: the register a teacher is offered comes from
 * the timetable entry, so a slip here hands the lesson to somebody who cannot mark it.
 *
 * The room's own assignment wins over a school-wide one, because a subject taught in six rooms
 * usually has six different people taking it and only this room's answer is about this lesson. The
 * owner of the subject wins over somebody co-teaching it. Ambiguity returns nothing rather than
 * guessing: two owners in one room is a question for a person, and a wrong name filled in
 * confidently is worse than an empty field that has to be answered.
 */
export function assignedTeacherForSubject(
  snapshot: SchoolSnapshot, classId: string, subjectId: string | null
): string | null {
  if (!subjectId) return null;
  const links = snapshot.classTeachers.filter((link) => active(link) && link.subjectId === subjectId);
  const here = links.filter((link) => link.classId === classId);
  for (const candidates of [here, links]) {
    for (const role of ['primary', 'assistant'] as const) {
      const named = new Set(candidates.filter((link) => link.role === role).map((link) => link.teacherId));
      if (named.size === 1) return [...named][0]!;
      if (named.size > 1) return null;
    }
  }
  return null;
}
