import type { AchievementKey } from '../../domain/types';

/**
 * The badge catalogue. Recognition is positive only — every badge describes something a student did,
 * never something they failed to do — so nothing here can be phrased as a penalty.
 */
export interface AchievementDefinition {
  key: AchievementKey;
  label: string;
  description: string;
  icon: string;
}

export const achievementCatalog: AchievementDefinition[] = [
  { key: 'on_time_submitter', label: 'ส่งงานตรงเวลา', description: 'ส่งงานครบตามกำหนดอย่างต่อเนื่อง', icon: '⏱' },
  { key: 'steady_attendance', label: 'มาเรียนสม่ำเสมอ', description: 'มาเรียนต่อเนื่องตลอดช่วงที่ผ่านมา', icon: '📅' },
  { key: 'score_improver', label: 'พัฒนาการดีขึ้น', description: 'คะแนนดีขึ้นจากครั้งก่อน', icon: '📈' },
  { key: 'reader', label: 'นักอ่าน', description: 'อ่านและสรุปความได้ดี', icon: '📖' },
  { key: 'thinker', label: 'นักคิด', description: 'ตั้งคำถามและให้เหตุผลได้ชัดเจน', icon: '💡' },
  { key: 'experimenter', label: 'นักทดลอง', description: 'ออกแบบและลงมือทดลองด้วยตนเอง', icon: '🔬' },
  { key: 'creator', label: 'นักสร้างสรรค์', description: 'สร้างผลงานของตนเองอย่างตั้งใจ', icon: '🎨' },
  { key: 'helper', label: 'ผู้ช่วยเหลือเพื่อน', description: 'ช่วยเพื่อนเรียนรู้และทำงานร่วมกัน', icon: '🤝' }
];

const byKey = new Map(achievementCatalog.map((item) => [item.key, item]));

export function achievementFor(key: AchievementKey): AchievementDefinition {
  return byKey.get(key) ?? { key, label: key, description: '', icon: '★' };
}
