import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { AttendanceStatus } from '../../domain/types';

/**
 * What a child has earned, and what they have left to spend.
 *
 * Two sources, and they are deliberately different in kind:
 *
 *   * **turning up.** Every register mark is worth something, and the amounts are small and flat so
 *     that the reward for a term is the habit rather than one good week. Coming late still earns —
 *     a child who is late has come, and a scheme that pays nothing for arriving at 08:40 teaches
 *     them to stay away instead. Being ill earns nothing and costs nothing: illness is not a
 *     failure of conduct and must not read as one.
 *   * **being given points.** จิตพิสัย, the board at the front of the class, a correction typed on
 *     the scores page — all of it is already an append-only ledger of `score_events`, and this
 *     reads that rather than keeping a second total that could disagree with it.
 *
 * Attendance points are *derived* rather than recorded. A register is edited — a child marked absent
 * turns out to have been at the dentist — and a stored award would need an offsetting entry to
 * follow it, which is a second thing to get wrong. Computed from the marks, the total simply becomes
 * correct the moment the mark does.
 *
 * Spending is the one thing that is written down, because it is the only part that cannot be
 * recomputed: it lives on the child's own avatar record, which is the one row a student may write.
 */
export const attendanceXp: Record<AttendanceStatus, number> = {
  present: 2,
  late: 1,
  leave_sick: 0,
  leave_personal: 0,
  leave: 0,
  absent: 0
};

export const attendanceXpReasons: Record<AttendanceStatus, string> = {
  present: 'มาเรียน',
  late: 'มาสาย แต่มาเรียน',
  leave_sick: 'ลาป่วย',
  leave_personal: 'ลากิจ',
  leave: 'ลา',
  absent: 'ขาดเรียน'
};

export interface PointsBalance {
  /** Everything the child has earned, ever. */
  earned: number;
  /** Of that, the part that came from turning up. */
  fromAttendance: number;
  /** And the part a teacher gave them. */
  fromTeachers: number;
  /** What has already been exchanged for something. */
  spent: number;
  /** What is left to spend. Never negative: a price is refused before it can overdraw. */
  balance: number;
}

/** How many marks of each kind a child has, which is what the earning is made of. */
export function attendanceTallyFor(snapshot: SchoolSnapshot, studentId: string): Record<AttendanceStatus, number> {
  const tally: Record<AttendanceStatus, number> = {
    present: 0, late: 0, leave_sick: 0, leave_personal: 0, leave: 0, absent: 0
  };
  for (const record of snapshot.attendance) {
    if (record.studentId !== studentId || record.deletedAt) continue;
    tally[record.status] = (tally[record.status] ?? 0) + 1;
  }
  return tally;
}

export function attendancePointsFor(snapshot: SchoolSnapshot, studentId: string): number {
  const tally = attendanceTallyFor(snapshot, studentId);
  return (Object.keys(tally) as AttendanceStatus[])
    .reduce((sum, status) => sum + tally[status] * (attendanceXp[status] ?? 0), 0);
}

/**
 * Points a teacher has given, from the ledger that already records them.
 *
 * Only whole points count towards the shop: a mark of 7.5 out of 10 is a mark, and letting fractions
 * of it become spending money would make the shop a second gradebook. Anything a teacher awards
 * deliberately — the board, จิตพิสัย, a bonus — is whole by construction.
 */
export function teacherPointsFor(snapshot: SchoolSnapshot, studentId: string): number {
  const total = snapshot.scoreEvents
    .filter((event) => event.studentId === studentId && !event.deletedAt)
    .reduce((sum, event) => sum + event.points, 0);
  return Math.max(0, Math.floor(total));
}

/** What a child has already spent, read from their own avatar record. */
export function spentPointsFor(snapshot: SchoolSnapshot, studentId: string): number {
  const student = snapshot.students.find((item) => item.id === studentId);
  const raw = (student?.avatarConfig as { spentPoints?: unknown } | null | undefined)?.spentPoints;
  const spent = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
  return Math.max(0, spent);
}

/** The outfits this child has bought. The free ones are not in here; they were never locked. */
export function unlockedOutfitsFor(snapshot: SchoolSnapshot, studentId: string): Set<string> {
  const student = snapshot.students.find((item) => item.id === studentId);
  const raw = (student?.avatarConfig as { unlockedOutfits?: unknown } | null | undefined)?.unlockedOutfits;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((value): value is string => typeof value === 'string'));
}

export function pointsBalanceFor(snapshot: SchoolSnapshot, studentId: string): PointsBalance {
  const fromAttendance = attendancePointsFor(snapshot, studentId);
  const fromTeachers = teacherPointsFor(snapshot, studentId);
  const spent = spentPointsFor(snapshot, studentId);
  const earned = fromAttendance + fromTeachers;
  return { earned, fromAttendance, fromTeachers, spent, balance: Math.max(0, earned - spent) };
}
