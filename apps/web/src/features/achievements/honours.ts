import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { AchievementKey, StudentAchievement } from '../../domain/types';
import type { IconName } from '../../ui/Icon';
import { achievementFor } from './achievementCatalog';

/**
 * A medal belongs to one student.
 *
 * The awards were already stored per student — every row in `achievements` carries the student it
 * was given to, who gave it, when, and why — but nothing in the product ever handed you one
 * student's medals as objects you could show beside their name. This does: an honour is the award
 * row joined to what the catalogue says the badge is, with a tier that decides how it looks.
 *
 * The rows themselves are untouched. This is a reading of them, so nothing here can lose an award,
 * and an award given before tiers existed simply reads at the tier its badge carries today.
 */
export type HonourTier = 'bronze' | 'silver' | 'gold';

export interface HonourItem {
  /** The award row's own id, which is what makes two copies of one badge distinguishable. */
  id: string;
  key: AchievementKey;
  studentId: string;
  name: string;
  description: string;
  icon: IconName;
  tier: HonourTier;
  /** Why it was given, in the words of whoever gave it. Empty when nobody wrote one. */
  note: string;
  awardedAt: string;
  awardedBy: string | null;
}

export const honourTierLabels: Record<HonourTier, string> = {
  bronze: 'ทองแดง', silver: 'เงิน', gold: 'ทอง'
};

/**
 * How rare each badge is meant to be, which is the only thing that decides its colour.
 *
 * Attendance and punctuality are steady habits, so they are the everyday tier. Reading, thinking and
 * making are things a teacher notices and names. The two that need somebody else in the room —
 * helping a classmate, and improving on your own past self — are the gold ones.
 */
const tiers: Record<AchievementKey, HonourTier> = {
  on_time_submitter: 'bronze',
  steady_attendance: 'bronze',
  reader: 'silver',
  thinker: 'silver',
  experimenter: 'silver',
  creator: 'silver',
  score_improver: 'gold',
  helper: 'gold'
};

export function tierFor(key: AchievementKey): HonourTier {
  return tiers[key] ?? 'bronze';
}

function toHonour(award: StudentAchievement): HonourItem {
  const definition = achievementFor(award.achievementKey);
  return {
    id: award.id,
    key: award.achievementKey,
    studentId: award.studentId,
    name: definition.label,
    description: definition.description,
    icon: definition.icon,
    tier: tierFor(award.achievementKey),
    note: award.note,
    awardedAt: award.awardedAt,
    awardedBy: award.awardedBy
  };
}

/** Everything one student has been given, newest first. Nobody else's medals are in this list. */
export function honoursFor(snapshot: SchoolSnapshot, studentId: string): HonourItem[] {
  if (!studentId) return [];
  return snapshot.achievements
    .filter((award) => award.studentId === studentId && !award.deletedAt)
    .map(toHonour)
    .sort((left, right) => right.awardedAt.localeCompare(left.awardedAt));
}

/** How many of each tier one student holds, for the line under their name. */
export function honourTally(honours: HonourItem[]): Record<HonourTier, number> {
  return honours.reduce<Record<HonourTier, number>>(
    (tally, honour) => ({ ...tally, [honour.tier]: tally[honour.tier] + 1 }),
    { bronze: 0, silver: 0, gold: 0 }
  );
}
