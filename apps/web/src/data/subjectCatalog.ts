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

/** Palette used for subject chips, cards and gradebook columns. */
export const subjectColors = [
  { solid: '#c2410c', soft: '#ffe8d8' },
  { solid: '#4930d1', soft: '#e8e1ff' },
  { solid: '#0f766e', soft: '#ccfbef' },
  { solid: '#b45309', soft: '#fdf0d5' },
  { solid: '#0369a1', soft: '#dbeeff' },
  { solid: '#be185d', soft: '#ffe4f0' },
  { solid: '#4d7c0f', soft: '#e8f7cf' },
  { solid: '#7c3aed', soft: '#efe6ff' }
] as const;

/**
 * Icon keys a subject can use. The drawings live in features/subjects/SubjectIcon.tsx; this list is
 * the contract the picker and the renderer share.
 */
export type SubjectIconKey =
  | 'language' | 'math' | 'science' | 'social' | 'sport' | 'art' | 'work' | 'globe'
  | 'book' | 'music' | 'code' | 'default';

export const subjectIconKeys: SubjectIconKey[] = [
  'language', 'math', 'science', 'social', 'sport', 'art', 'work', 'globe', 'book', 'music', 'code', 'default'
];

export const subjectIconLabels: Record<SubjectIconKey, string> = {
  language: 'ภาษา', math: 'คณิตศาสตร์', science: 'วิทยาศาสตร์', social: 'สังคมศึกษา',
  sport: 'พลศึกษา', art: 'ศิลปะ', work: 'การงานอาชีพ', globe: 'ภาษาต่างประเทศ',
  book: 'หนังสือ', music: 'ดนตรี', code: 'เทคโนโลยี', default: 'ทั่วไป'
};

export function subjectColor(colorIndex: number) {
  return subjectColors[Math.abs(Math.trunc(colorIndex)) % subjectColors.length]!;
}

export function isSubjectIconKey(value: string): value is SubjectIconKey {
  return (subjectIconKeys as string[]).includes(value);
}
