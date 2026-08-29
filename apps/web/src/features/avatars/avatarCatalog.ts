export const avatarArchetypes = [
  'สายวิทยาศาสตร์', 'สายเทคโนโลยี', 'โปรแกรมเมอร์', 'นักอ่าน', 'นักคิด', 'นักคณิตศาสตร์',
  'นักสำรวจ', 'นักธรรมชาติ', 'สายศิลปะ', 'นักดนตรี', 'สายกีฬา', 'ผู้นำห้องเรียน',
  'นักประดิษฐ์', 'นักออกแบบ', 'นักสื่อสาร', 'นักทดลอง', 'นักสร้างสรรค์', 'นักแก้ปัญหา'
] as const;

export const avatarPalettes = [
  ['#5b3df5', '#b7a8ff'], ['#087ea4', '#74d9f7'], ['#007f5f', '#80ed99'], ['#c2410c', '#fdba74'],
  ['#be185d', '#f9a8d4'], ['#6d28d9', '#c4b5fd'], ['#0f766e', '#99f6e4'], ['#9f1239', '#fda4af']
] as const;

export function normalizeAvatarIndex(index: number): number { return Math.abs(Math.trunc(index)) % (avatarArchetypes.length * avatarPalettes.length); }
export function avatarIdentity(index: number) { const normalized = normalizeAvatarIndex(index); return { archetype: normalized % avatarArchetypes.length, palette: Math.floor(normalized / avatarArchetypes.length) % avatarPalettes.length }; }
