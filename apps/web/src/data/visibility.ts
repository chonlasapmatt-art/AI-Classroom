import type { Role } from '../domain/types';
import type { SchoolSnapshot } from './schoolRepository';

/** The projection a signed-in member is allowed to use on this device. */
export interface VisibilityScope {
  role: Role;
  profileId: string;
}

/**
 * Applies the same room boundary to the local projection that the database applies to cloud reads.
 * This matters after a role changes or when an older device still has rows from a wider session.
 */
export function scopeSchoolSnapshot(snapshot: SchoolSnapshot, scope: VisibilityScope): SchoolSnapshot {
  if (scope.role === 'admin') return snapshot;

  const ownTeacherIds = new Set(snapshot.teachers
    .filter((teacher) => teacher.profileId === scope.profileId && teacher.status === 'active')
    .map((teacher) => teacher.id));
  const ownStudentIds = scope.role === 'parent'
    ? new Set(snapshot.parentLinks
      .filter((link) => link.profileId === scope.profileId || link.lineUserId === scope.profileId)
      .filter((link) => link.status === 'linked')
      .map((link) => link.studentId))
    : new Set(snapshot.students
      .filter((student) => student.profileId === scope.profileId && student.status === 'active')
      .map((student) => student.id));

  const allowedClassIds = scope.role === 'teacher'
    ? new Set(snapshot.classTeachers
      .filter((link) => ownTeacherIds.has(link.teacherId))
      .map((link) => link.classId))
    : new Set(snapshot.enrollments
      .filter((enrollment) => ownStudentIds.has(enrollment.studentId) && enrollment.status === 'active')
      .map((enrollment) => enrollment.classId));
  const rosterStudentIds = scope.role === 'teacher' || scope.role === 'student'
    ? new Set(snapshot.enrollments
      .filter((enrollment) => allowedClassIds.has(enrollment.classId) && enrollment.status === 'active')
      .map((enrollment) => enrollment.studentId))
    : ownStudentIds;
  const allowedTermIds = new Set(snapshot.classes
    .filter((classroom) => allowedClassIds.has(classroom.id))
    .map((classroom) => classroom.academicTermId));
  const allowedClassTeacherIds = new Set(snapshot.classTeachers
    .filter((link) => allowedClassIds.has(link.classId))
    .map((link) => link.teacherId));
  const allowedAssignmentIds = new Set(snapshot.assignments
    .filter((assignment) => allowedClassIds.has(assignment.classId))
    .map((assignment) => assignment.id));
  const allowedActivityIds = new Set(snapshot.activities
    .filter((activity) => allowedClassIds.has(activity.classId))
    .map((activity) => activity.id));
  const allowedTestIds = new Set(snapshot.tests
    .filter((test) => allowedClassIds.has(test.classId))
    .map((test) => test.id));
  const ownProfileRecordIds = new Set([
    ...snapshot.students.filter((student) => student.profileId === scope.profileId).map((student) => student.id),
    ...snapshot.teachers.filter((teacher) => teacher.profileId === scope.profileId).map((teacher) => teacher.id),
    ...snapshot.parentLinks.filter((link) => link.profileId === scope.profileId || link.lineUserId === scope.profileId).map((link) => link.id)
  ]);
  const ownProfile = (profileId: string) => profileId === scope.profileId || ownProfileRecordIds.has(profileId);

  const visibleAttachments = snapshot.attachments.filter((attachment) => {
    if (attachment.ownerType === 'subject') return true;
    if (attachment.ownerType === 'profile') return ownProfile(attachment.ownerId);
    if (attachment.ownerType === 'assignment') return allowedAssignmentIds.has(attachment.ownerId);
    // Submission files use the stable `${assignmentId}:${studentId}` owner key.
    const [assignmentId, studentId] = attachment.ownerId.split(':');
    return !!assignmentId && !!studentId && allowedAssignmentIds.has(assignmentId) && ownStudentIds.has(studentId);
  });

  return {
    ...snapshot,
    terms: snapshot.terms.filter((term) => allowedTermIds.has(term.id)),
    classes: snapshot.classes.filter((classroom) => allowedClassIds.has(classroom.id)),
    classTeachers: snapshot.classTeachers.filter((link) => allowedClassIds.has(link.classId)),
    teachers: snapshot.teachers.filter((teacher) => allowedClassTeacherIds.has(teacher.id)),
    students: snapshot.students.filter((student) => rosterStudentIds.has(student.id)),
    enrollments: snapshot.enrollments.filter((enrollment) => rosterStudentIds.has(enrollment.studentId) && allowedClassIds.has(enrollment.classId)),
    assignments: snapshot.assignments.filter((assignment) => allowedAssignmentIds.has(assignment.id)),
    submissions: snapshot.submissions.filter((submission) => allowedAssignmentIds.has(submission.assignmentId) && ownStudentIds.has(submission.studentId)),
    activities: snapshot.activities.filter((activity) => allowedClassIds.has(activity.classId)),
    activityScores: snapshot.activityScores.filter((score) => allowedActivityIds.has(score.activityId) && ownStudentIds.has(score.studentId)),
    tests: snapshot.tests.filter((test) => allowedClassIds.has(test.classId)),
    testScores: snapshot.testScores.filter((score) => allowedTestIds.has(score.testId) && ownStudentIds.has(score.studentId)),
    attendance: snapshot.attendance.filter((record) => allowedClassIds.has(record.classId) && (scope.role === 'teacher' ? rosterStudentIds.has(record.studentId) : ownStudentIds.has(record.studentId))),
    parentLinks: snapshot.parentLinks.filter((link) => ownStudentIds.has(link.studentId)),
    attachments: visibleAttachments,
    notifications: snapshot.notifications.filter((notification) => ownStudentIds.has(notification.studentId) && allowedClassIds.has(notification.classId)),
    rubrics: scope.role === 'teacher' ? snapshot.rubrics : [],
    rubricScores: snapshot.rubricScores.filter((score) => allowedAssignmentIds.has(score.assignmentId) && ownStudentIds.has(score.studentId)),
    submissionVersions: snapshot.submissionVersions.filter((version) => allowedAssignmentIds.has(version.assignmentId) && ownStudentIds.has(version.studentId)),
    deadlineExtensions: snapshot.deadlineExtensions.filter((extension) => allowedAssignmentIds.has(extension.assignmentId) && ownStudentIds.has(extension.studentId)),
    announcements: snapshot.announcements.filter((announcement) => allowedClassIds.has(announcement.classId)),
    notificationPreferences: snapshot.notificationPreferences.filter((preference) => ownProfile(preference.profileId)),
    academicAudit: [],
    timetable: snapshot.timetable.filter((entry) => allowedClassIds.has(entry.classId)),
    achievements: snapshot.achievements.filter((achievement) => ownStudentIds.has(achievement.studentId)),
    scoreEvents: snapshot.scoreEvents.filter((event) => ownStudentIds.has(event.studentId) && (!event.classId || allowedClassIds.has(event.classId))),
  };
}
