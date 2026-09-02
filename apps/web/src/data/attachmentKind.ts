import type { AttachmentKind } from '../domain/types';

/** Maps a picked file to the kind used for icons, filters and validation messages. */
export function attachmentKindFor(fileName: string, mimeType: string): AttachmentKind {
  const name = fileName.toLowerCase();
  if (name.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || mimeType.includes('spreadsheet')) return 'spreadsheet';
  if (name.endsWith('.csv') || name.endsWith('.tsv') || mimeType === 'text/csv') return 'csv';
  if (name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.txt') || mimeType.startsWith('text/')) return 'document';
  if (name.endsWith('.ppt') || name.endsWith('.pptx') || name.endsWith('.odp') || mimeType.includes('presentation')) return 'presentation';
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz') || mimeType.includes('zip') || mimeType.includes('compressed')) return 'archive';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(name)) return 'video';
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(name)) return 'audio';
  return 'other';
}

export const attachmentIcons: Record<AttachmentKind, string> = {
  pdf: '▣', spreadsheet: '▦', csv: '▤', document: '▥', presentation: '▰', archive: '⌘', image: '◨', video: '▶', audio: '♫', other: '◆'
};

export const attachmentLabels: Record<AttachmentKind, string> = {
  pdf: 'PDF', spreadsheet: 'Excel', csv: 'CSV', document: 'เอกสาร', presentation: 'PowerPoint', archive: 'ไฟล์บีบอัด', image: 'รูปภาพ', video: 'วิดีโอ', audio: 'เสียง', other: 'ไฟล์'
};

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
