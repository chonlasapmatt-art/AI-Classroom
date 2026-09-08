import type { ClassroomNotification, StudentAchievement } from '../domain/types';
import { achievementFor } from '../features/achievements/achievementCatalog';
import { honourTierLabels, tierFor } from '../features/achievements/honours';

/**
 * A medal, told to the child who was given it.
 *
 * The medals screen is a teacher's: it lists every child in the school and what each of them holds,
 * which is why a student no longer has it in their menu. But being given one is news, and news that
 * only the giver can see is not news — so the award becomes a notice addressed to the one student
 * it belongs to, alongside the returned work and the changed deadlines they already read there.
 *
 * The award rows themselves are what sync carries; this reads them on the student's own device and
 * writes the notice locally, so nothing new travels the protocol and no other child's award can
 * produce a notice here. The dedupe key is the award's own id, which means a resync, a second
 * device or a re-award of the same badge never says it twice.
 */
export interface AchievementNoticeDraft {
  studentId: string;
  classId: string;
  dedupeKey: string;
  title: string;
  body: string;
  /** The moment the medal was given, so the notice sorts by when it happened. */
  awardedAt: string;
}

export const achievementNoticeKey = (awardId: string) => `achievement:${awardId}`;

export function achievementNoticesFor(input: {
  awards: StudentAchievement[];
  studentId: string;
  classId: string;
  existing: Pick<ClassroomNotification, 'dedupeKey'>[];
}): AchievementNoticeDraft[] {
  const said = new Set(input.existing.map((row) => row.dedupeKey));
  return input.awards
    .filter((award) => award.studentId === input.studentId && !award.deletedAt)
    .filter((award) => !said.has(achievementNoticeKey(award.id)))
    .map((award) => {
      const badge = achievementFor(award.achievementKey);
      const tier = honourTierLabels[tierFor(award.achievementKey)];
      return {
        studentId: award.studentId,
        classId: input.classId,
        dedupeKey: achievementNoticeKey(award.id),
        title: `ได้รับเหรียญ${tier}: ${badge.label}`,
        // The teacher's own words come first when there are any: "ช่วยเพื่อนทั้งคาบ" means more to a
        // child than the catalogue sentence that is the same for everybody who holds the badge.
        body: award.note.trim() || badge.description,
        awardedAt: award.awardedAt
      };
    })
    .sort((left, right) => left.awardedAt.localeCompare(right.awardedAt));
}
