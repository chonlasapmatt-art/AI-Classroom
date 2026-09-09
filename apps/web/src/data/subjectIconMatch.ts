import { subjectIconKeys, type SubjectIconKey } from './subjectCatalog';

/**
 * Guessing a subject's icon from its name.
 *
 * Six of the nine subjects in the live school were drawn as the fallback label — the same grey tag,
 * over and over — and the reason was never the drawings. A subject created by typing its name into
 * the teacher form was saved with `iconKey: 'default'` because that form has no icon picker, so
 * every subject a school actually adds arrived without one. A set of twenty-two distinct drawings is
 * worth nothing if the thing that creates subjects never chooses between them.
 *
 * So the name chooses. Thai school subjects have stable names — a school writing its own curriculum
 * still calls it วิทยาศาสตร์ — and matching on the words inside them gets the common cases right
 * without asking anybody anything. It is a guess, and it is only ever the *starting* value: the
 * subject screen still shows the icon picker, and a teacher who names something the list has never
 * heard of gets the label, which is honest.
 *
 * Order matters. The list is walked top to bottom and the first hit wins, so the more specific
 * phrase has to come first: "สุขศึกษาและพลศึกษา" is one subject in the Thai core curriculum and
 * would otherwise match สุขศึกษา and be drawn as a heart when it is mostly sport.
 */
interface Rule { icon: SubjectIconKey; words: string[] }

const rules: Rule[] = [
  // The compound name first, or its two halves would each claim it.
  { icon: 'sport', words: ['สุขศึกษาและพลศึกษา', 'พลศึกษา', 'พละ', 'กีฬา', 'physical education', 'sport'] },
  { icon: 'health', words: ['สุขศึกษา', 'สุขภาพ', 'อนามัย', 'พยาบาล', 'health'] },
  { icon: 'atom', words: ['ฟิสิกส์', 'เคมี', 'physics', 'chemistry'] },
  { icon: 'leaf', words: ['ชีววิทยา', 'เกษตร', 'พฤกษ', 'biology', 'agricultur'] },
  { icon: 'science', words: ['วิทยาศาสตร์', 'วิทย์', 'science', 'lab'] },
  { icon: 'math', words: ['คณิตศาสตร์', 'คณิต', 'เลข', 'math', 'algebra', 'geometry', 'calculus'] },
  { icon: 'computer', words: ['คอมพิวเตอร์', 'คอม', 'ไอที', 'computer', 'ict', ' it '] },
  { icon: 'code', words: ['เทคโนโลยี', 'โปรแกรม', 'โค้ด', 'coding', 'programming', 'software', 'robot'] },
  { icon: 'globe', words: ['ภาษาต่างประเทศ', 'ภาษาอังกฤษ', 'อังกฤษ', 'จีน', 'ญี่ปุ่น', 'english', 'chinese', 'japanese', 'language'] },
  { icon: 'language', words: ['ภาษาไทย', 'ไทย', 'วรรณคดี', 'เขียน', 'thai', 'writing', 'literature'] },
  { icon: 'history', words: ['ประวัติศาสตร์', 'history'] },
  { icon: 'map', words: ['ภูมิศาสตร์', 'geograph'] },
  { icon: 'social', words: ['สังคมศึกษา', 'สังคม', 'หน้าที่พลเมือง', 'social', 'civic'] },
  { icon: 'lotus', words: ['พระพุทธ', 'ศาสนา', 'ธรรม', 'buddhis', 'religio'] },
  { icon: 'art', words: ['ออกแบบ', 'กราฟิก', 'ศิลปะ', 'วาด', 'ทัศนศิลป์', 'design', 'graphic', 'art'] },
  { icon: 'music', words: ['ดนตรี', 'ขับร้อง', 'music'] },
  { icon: 'drama', words: ['นาฏศิลป์', 'ละคร', 'การแสดง', 'drama', 'theatre', 'dance'] },
  { icon: 'work', words: ['การงานอาชีพ', 'การงาน', 'อาชีพ', 'ช่าง', 'คหกรรม', 'career', 'vocation'] },
  { icon: 'book', words: ['ห้องสมุด', 'การอ่าน', 'library', 'reading'] },
  { icon: 'compass', words: ['แนะแนว', 'guidance', 'counsel'] },
  { icon: 'star', words: ['ชุมนุม', 'กิจกรรม', 'ลูกเสือ', 'club', 'activity', 'scout'] }
];

/**
 * The icon a subject called this should start with, or the label when nothing matches.
 *
 * Matching is case-insensitive and ignores spaces on both sides, because "Graphic Design" and
 * "graphicdesign" are the same subject typed by two different people.
 */
export function subjectIconForName(name: string): SubjectIconKey {
  const needle = name.toLocaleLowerCase('th').replace(/\s+/g, ' ').trim();
  if (needle.length === 0) return 'default';
  const tight = needle.replace(/\s+/g, '');
  for (const rule of rules) {
    for (const word of rule.words) {
      const candidate = word.toLocaleLowerCase('th').trim();
      if (needle.includes(candidate) || tight.includes(candidate.replace(/\s+/g, ''))) return rule.icon;
    }
  }
  return 'default';
}

/** Every icon the matcher can produce is one the renderer knows. Guarded by a test. */
export const matchableIcons: SubjectIconKey[] = [...new Set(rules.map((rule) => rule.icon))]
  .filter((icon): icon is SubjectIconKey => subjectIconKeys.includes(icon));
