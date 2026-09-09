import { isSubjectIconKey, subjectIconKeys, type SubjectIconKey } from './subjectCatalog';

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
  { icon: 'sport', words: ['สุขศึกษาและพลศึกษา', 'พลศึกษา', 'พละ', 'กีฬา', 'ว่ายน้ำ', 'ฟุตบอล', 'บาสเกตบอล', 'วอลเลย์บอล', 'แบดมินตัน', 'ตะกร้อ', 'กรีฑา', 'มวย', 'physical education', 'sport'] },
  { icon: 'health', words: ['สุขศึกษา', 'สุขภาพ', 'อนามัย', 'พยาบาล', 'เพศศึกษา', 'โภชนาการ', 'ยาเสพติด', 'health'] },
  { icon: 'atom', words: ['ฟิสิกส์', 'เคมี', 'physics', 'chemistry'] },
  { icon: 'leaf', words: ['ชีววิทยา', 'เกษตร', 'พฤกษ', 'biology', 'agricultur'] },
  { icon: 'science', words: ['วิทยาศาสตร์', 'วิทย์', 'ดาราศาสตร์', 'โลกและอวกาศ', 'ธรณี', 'science', 'lab'] },
  { icon: 'math', words: ['คณิตศาสตร์', 'คณิต', 'เลข', 'เรขาคณิต', 'พีชคณิต', 'แคลคูลัส', 'สถิติ', 'math', 'algebra', 'geometry', 'calculus', 'statistic'] },
  /*
   * หุ่นยนต์ and ปัญญาประดิษฐ์ come before both computers and code, which would otherwise take them:
   * a robotics club is neither a monitor nor a pair of angle brackets. The English "AI" is spelt out
   * — the two bare letters sit inside "Thai" and would repaint every English-named Thai class.
   */
  { icon: 'robot', words: ['หุ่นยนต์', 'ปัญญาประดิษฐ์', 'เอไอ', 'โรบอท', 'robot', 'artificial intelligence', 'a.i.', 'machine learning'] },
  { icon: 'computer', words: ['คอมพิวเตอร์', 'คอม', 'ไอที', 'สารสนเทศ', 'ดิจิทัล', 'computer', 'ict', 'digital', ' it '] },
  { icon: 'code', words: ['วิทยาการคำนวณ', 'เทคโนโลยี', 'โปรแกรม', 'โค้ด', 'coding', 'programming', 'software'] },
  /*
   * The arts come before the languages, and that is not a preference.
   *
   * A Thai school names its own version of a subject by suffixing ไทย — ดนตรีไทย, นาฏศิลป์ไทย,
   * จิตรกรรมไทย — and the rule for ภาษาไทย matches on ไทย alone, so with the languages first every
   * one of those was drawn as a pencil. Whatever the subject *is* has to be read before the country
   * it belongs to.
   */
  { icon: 'art', words: ['ออกแบบ', 'กราฟิก', 'ศิลปะ', 'วาด', 'ทัศนศิลป์', 'จิตรกรรม', 'ประติมากรรม', 'ปั้น', 'ถ่ายภาพ', 'design', 'graphic', 'art', 'photograph'] },
  { icon: 'music', words: ['ดนตรี', 'ขับร้อง', 'ดุริยางค์', 'โยธวาทิต', 'music'] },
  { icon: 'drama', words: ['นาฏศิลป์', 'ละคร', 'การแสดง', 'ลีลาศ', 'ฟ้อน', 'โขน', 'drama', 'theatre', 'dance'] },
  { icon: 'globe', words: ['ภาษาต่างประเทศ', 'ภาษาอังกฤษ', 'อังกฤษ', 'จีน', 'ญี่ปุ่น', 'เกาหลี', 'ฝรั่งเศส', 'เยอรมัน', 'สเปน', 'รัสเซีย', 'เวียดนาม', 'english', 'chinese', 'japanese', 'korean', 'french', 'german', 'foreign language'] },
  { icon: 'language', words: ['ภาษาไทย', 'ไทย', 'วรรณคดี', 'หลักภาษา', 'เรียงความ', 'ประพันธ์', 'เขียน', 'thai', 'writing', 'literature'] },
  { icon: 'history', words: ['ประวัติศาสตร์', 'อารยธรรม', 'โบราณคดี', 'history'] },
  { icon: 'map', words: ['ภูมิศาสตร์', 'geograph'] },
  { icon: 'social', words: ['สังคมศึกษา', 'สังคม', 'หน้าที่พลเมือง', 'เศรษฐศาสตร์', 'อาเซียน', 'กฎหมาย', 'วัฒนธรรม', 'social', 'civic', 'economic', 'asean'] },
  { icon: 'lotus', words: ['พระพุทธ', 'พุทธ', 'ศาสนา', 'ธรรม', 'บาลี', 'อิสลาม', 'คริสต์', 'buddhis', 'religio'] },
  { icon: 'work', words: ['การงานอาชีพ', 'การงาน', 'อาชีพ', 'ช่าง', 'คหกรรม', 'ธุรกิจ', 'บัญชี', 'การตลาด', 'career', 'vocation', 'occupation', 'business', 'account'] },
  { icon: 'book', words: ['ห้องสมุด', 'การอ่าน', 'ค้นคว้า', 'โครงงาน', 'library', 'reading', 'research', 'independent study'] },
  { icon: 'compass', words: ['แนะแนว', 'guidance', 'counsel'] },
  { icon: 'star', words: ['ชุมนุม', 'ชมรม', 'กิจกรรม', 'ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด', 'บำเพ็ญ', 'club', 'activity', 'scout'] }
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

/**
 * Which drawing a subject gets, given what is stored and what it is called.
 *
 * The stored key comes first and an unrecognised one falls through to the name, not to the
 * fallback — that order is the whole point. A subject typed into the teacher form is saved with
 * `iconKey: 'default'` because that form has no picker, and a subject an administrator deliberately
 * marked ทั่วไป is saved with exactly the same value, so the two cannot be told apart afterwards.
 * The guess therefore belongs at the moment of writing, where the person can see it and change it,
 * and this only reaches for it when there is nothing stored at all.
 */
export function subjectIconKeyFor(iconKey?: string, subject?: string): SubjectIconKey {
  if (iconKey && isSubjectIconKey(iconKey)) return iconKey;
  if (subject && subject.trim().length > 0) return subjectIconForName(subject);
  return 'default';
}

/** Every icon the matcher can produce is one the renderer knows. Guarded by a test. */
export const matchableIcons: SubjectIconKey[] = [...new Set(rules.map((rule) => rule.icon))]
  .filter((icon): icon is SubjectIconKey => subjectIconKeys.includes(icon));
