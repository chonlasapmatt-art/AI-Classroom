/**
 * The eight standard Thai learning areas every school starts with. Schools are free to add,
 * rename or archive subjects afterwards — this list only seeds a new school.
 */
export interface SubjectSeed {
  code: string;
  name: string;
  nameEn: string;
  colorIndex: number;
  iconKey: string;
}

export const standardSubjects: SubjectSeed[] = [
  { code: 'TH', name: 'ภาษาไทย', nameEn: 'Thai Language', colorIndex: 0, iconKey: 'language' },
  { code: 'MA', name: 'คณิตศาสตร์', nameEn: 'Mathematics', colorIndex: 1, iconKey: 'math' },
  { code: 'SC', name: 'วิทยาศาสตร์และเทคโนโลยี', nameEn: 'Science and Technology', colorIndex: 2, iconKey: 'science' },
  { code: 'SO', name: 'สังคมศึกษา ศาสนา และวัฒนธรรม', nameEn: 'Social Studies', colorIndex: 3, iconKey: 'social' },
  { code: 'PE', name: 'สุขศึกษาและพลศึกษา', nameEn: 'Health and Physical Education', colorIndex: 4, iconKey: 'sport' },
  { code: 'AR', name: 'ศิลปะ', nameEn: 'Arts', colorIndex: 5, iconKey: 'art' },
  { code: 'OC', name: 'การงานอาชีพ', nameEn: 'Occupations', colorIndex: 6, iconKey: 'work' },
  { code: 'EN', name: 'ภาษาต่างประเทศ', nameEn: 'Foreign Languages', colorIndex: 7, iconKey: 'globe' }
];

/**
 * Palette used for subject chips, cards and gradebook columns.
 *
 * Each `solid` has to be readable twice: as the label of an unselected chip sitting on its own
 * `soft`, and as the fill behind white when the chip is selected. Three of them cleared the second
 * and missed the first — Thai, Occupations and Social Studies measured 4.39, 4.43 and 4.45 against
 * a 4.5 requirement, which is exactly the kind of miss nobody sees by looking. They are a shade
 * deeper now and every pair is checked in the test beside this file.
 */
/*
 * Sixteen, not eight.
 *
 * A school with twelve subjects had four of them wearing a colour another subject already had, and
 * the colour is what a teacher scans a timetable by. The eight originals keep their index — a
 * subject stores the index, so reordering them would repaint every existing school — and eight more
 * follow, each measured against the same two rules as the first: readable as ink on its own soft
 * tint, and readable as white on its own fill.
 */
export const subjectColors = [
  { solid: '#ad390b', soft: '#ffe8d8', name: 'อิฐเผา' },
  { solid: '#4930d1', soft: '#e8e1ff', name: 'ม่วงคราม' },
  { solid: '#0f766e', soft: '#ccfbef', name: 'เขียวมรกต' },
  { solid: '#9c4a08', soft: '#fdf0d5', name: 'น้ำตาลทอง' },
  { solid: '#0369a1', soft: '#dbeeff', name: 'ฟ้าทะเล' },
  { solid: '#be185d', soft: '#ffe4f0', name: 'ชมพูบานเย็น' },
  { solid: '#456d0d', soft: '#e8f7cf', name: 'เขียวใบตอง' },
  { solid: '#7c3aed', soft: '#efe6ff', name: 'ม่วงลาเวนเดอร์' },
  { solid: '#b91c1c', soft: '#fee2e2', name: 'แดงชาด' },
  { solid: '#8a5206', soft: '#fef3c7', name: 'เหลืองอำพัน' },
  { solid: '#15803d', soft: '#dcfce7', name: 'เขียวป่า' },
  { solid: '#0e7490', soft: '#cffafe', name: 'ฟ้าคราม' },
  { solid: '#1d4ed8', soft: '#dbeafe', name: 'น้ำเงินหมึก' },
  { solid: '#4338ca', soft: '#e0e7ff', name: 'ครามเข้ม' },
  { solid: '#86198f', soft: '#fae8ff', name: 'ม่วงองุ่น' },
  { solid: '#44403c', soft: '#f5f5f4', name: 'เทาหิน' }
] as const;

/**
 * Icon keys a subject can use. The drawings live in features/subjects/SubjectIcon.tsx; this list is
 * the contract the picker and the renderer share.
 */
export type SubjectIconKey =
  | 'language' | 'math' | 'science' | 'social' | 'sport' | 'art' | 'work' | 'globe'
  | 'book' | 'music' | 'code' | 'atom' | 'leaf' | 'map' | 'history' | 'health'
  | 'computer' | 'drama' | 'compass' | 'lotus' | 'star' | 'robot' | 'default';

export const subjectIconKeys: SubjectIconKey[] = [
  'language', 'math', 'science', 'atom', 'social', 'history', 'map', 'globe',
  'sport', 'health', 'art', 'music', 'drama', 'work', 'leaf', 'computer',
  'code', 'robot', 'book', 'compass', 'lotus', 'star', 'default'
];

export const subjectIconLabels: Record<SubjectIconKey, string> = {
  language: 'ภาษาไทย', math: 'คณิตศาสตร์', science: 'วิทยาศาสตร์', atom: 'ฟิสิกส์ / เคมี',
  social: 'สังคมศึกษา', history: 'ประวัติศาสตร์', map: 'ภูมิศาสตร์', globe: 'ภาษาต่างประเทศ',
  sport: 'พลศึกษา', health: 'สุขศึกษา', art: 'ศิลปะ', music: 'ดนตรี', drama: 'นาฏศิลป์',
  work: 'การงานอาชีพ', leaf: 'เกษตร / ชีววิทยา', computer: 'คอมพิวเตอร์', code: 'เทคโนโลยี',
  robot: 'หุ่นยนต์ / ปัญญาประดิษฐ์', book: 'หนังสือ / ห้องสมุด', compass: 'แนะแนว',
  lotus: 'พระพุทธศาสนา', star: 'ชุมนุม / กิจกรรม', default: 'ทั่วไป'
};

/**
 * A colour's name, for the picker and for anybody reading a swatch with a screen reader. "สีที่ 7"
 * told a person nothing about the colour they were choosing.
 */
export function subjectColorName(colorIndex: number): string {
  return subjectColor(colorIndex).name;
}

export function subjectColor(colorIndex: number) {
  return subjectColors[Math.abs(Math.trunc(colorIndex)) % subjectColors.length]!;
}

export function isSubjectIconKey(value: string): value is SubjectIconKey {
  return (subjectIconKeys as string[]).includes(value);
}
