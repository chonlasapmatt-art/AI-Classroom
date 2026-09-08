import type { AchievementKey } from '../../domain/types';
import type { IconName } from '../../ui/Icon';

/**
 * The badge catalogue. Recognition is positive only — every badge describes something a student did,
 * never something they failed to do — so nothing here can be phrased as a penalty.
 */
export interface AchievementDefinition {
  key: AchievementKey;
  label: string;
  description: string;
  /**
   * A drawing from the product's own icon set, not an emoji.
   *
   * Emoji were what this held before, and a badge is exactly where they fail: the same award came
   * out full-colour on one device, monochrome on another and as an empty box on a Thai system font
   * that has no glyph for it — on the one screen whose whole job is to make a child feel seen.
   */
  icon: IconName;
}

export const achievementCatalog: AchievementDefinition[] = [
  { key: 'on_time_submitter', label: 'ส่งงานตรงเวลา', description: 'ส่งงานครบตามกำหนดอย่างต่อเนื่อง', icon: 'clock' },
  { key: 'steady_attendance', label: 'มาเรียนสม่ำเสมอ', description: 'มาเรียนต่อเนื่องตลอดช่วงที่ผ่านมา', icon: 'calendar' },
  { key: 'score_improver', label: 'พัฒนาการดีขึ้น', description: 'คะแนนดีขึ้นจากครั้งก่อน', icon: 'trend-up' },
  { key: 'reader', label: 'นักอ่าน', description: 'อ่านและสรุปความได้ดี', icon: 'book' },
  { key: 'thinker', label: 'นักคิด', description: 'ตั้งคำถามและให้เหตุผลได้ชัดเจน', icon: 'bulb' },
  { key: 'experimenter', label: 'นักทดลอง', description: 'ออกแบบและลงมือทดลองด้วยตนเอง', icon: 'flask' },
  { key: 'creator', label: 'นักสร้างสรรค์', description: 'สร้างผลงานของตนเองอย่างตั้งใจ', icon: 'palette' },
  { key: 'helper', label: 'ผู้ช่วยเหลือเพื่อน', description: 'ช่วยเพื่อนเรียนรู้และทำงานร่วมกัน', icon: 'children' }
];

const byKey = new Map(achievementCatalog.map((item) => [item.key, item]));

export function achievementFor(key: AchievementKey): AchievementDefinition {
  return byKey.get(key) ?? { key, label: key, description: '', icon: 'star' };
}
