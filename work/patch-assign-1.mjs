import { patch } from './patchlib.mjs';

const old = `  const items = useMemo(() => calendarItemsFor(snapshot, {
    classIds: [effectiveClassId],
    studentId: ownStudent?.id ?? null,
    subjectId: subjectFilter || null,
    includeDrafts: isTeacher
  }), [snapshot, effectiveClassId, ownStudent?.id, subjectFilter, isTeacher]);`;

const neu = `  /**
   * Which work this person is shown, before any filter they chose themselves.
   *
   * A room's work used to arrive as one undifferentiated list for every member of staff, so the
   * maths teacher scrolled past the science homework, the art project and the computing worksheet
   * to find their own -- and could not tell at a glance which of the four rows in front of them
   * they were actually responsible for. Responsibility is already recorded: an advisor is attached
   * to the room with no subject and can see all of it, a subject teacher is attached to one subject
   * and sees that one. That is exactly the question teacherCanViewScore answers, and it is the same
   * question the gradebook asks, so the two screens now agree about what a teacher's room contains.
   *
   * An administrator sees everything, because somebody has to. A student sees the published work of
   * their own room, which calendarItemsFor has always given them.
   */
  const items = useMemo(() => {
    const everything = calendarItemsFor(snapshot, {
      classIds: [effectiveClassId],
      studentId: ownStudent?.id ?? null,
      subjectId: subjectFilter || null,
      includeDrafts: isTeacher
    });
    if (membership.role !== 'teacher') return everything;
    return everything.filter((item) =>
      teacherCanViewScore(snapshot, membership.profileId, item.work.classId, item.work.subjectId));
  }, [snapshot, effectiveClassId, ownStudent?.id, subjectFilter, isTeacher, membership.role, membership.profileId]);`;

patch('apps/web/src/features/assignments/AssignmentsPage.tsx', [[old, neu]]);
console.log('items scoped to the teacher own subjects');
