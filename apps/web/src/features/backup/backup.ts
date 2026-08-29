import { db, LOCAL_SCHEMA_VERSION } from '../../db/database';

interface BackupEnvelope { format: 'smart-classroom-backup'; schemaVersion: number; exportedAt: string; deviceId: string; schoolId: string; encrypted: boolean; salt?: string; iv?: string; payload: string; checksum: string; }
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function base64(bytes: Uint8Array): string { let text = ''; bytes.forEach((byte) => { text += String.fromCharCode(byte); }); return btoa(text); }
function bytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
async function digest(value: string) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function keyFromPassword(password: string, salt: Uint8Array) { const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations: 310_000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }

export async function createEncryptedBackup(schoolId: string, deviceId: string, password: string): Promise<BackupEnvelope> {
  if (password.length < 12) throw new Error('รหัสสำรองข้อมูลต้องยาวอย่างน้อย 12 ตัวอักษร');
  const data = await db.transaction('r', [db.academicTerms, db.classes, db.students, db.enrollments, db.assignments, db.submissions, db.activities, db.activityScores, db.tests, db.testScores, db.attendance, db.syncQueue, db.syncState], async () => ({
    academicTerms: await db.academicTerms.where('schoolId').equals(schoolId).toArray(), classes: await db.classes.where('schoolId').equals(schoolId).toArray(), students: await db.students.where('schoolId').equals(schoolId).toArray(), enrollments: await db.enrollments.where('schoolId').equals(schoolId).toArray(), assignments: await db.assignments.where('schoolId').equals(schoolId).toArray(), submissions: await db.submissions.where('schoolId').equals(schoolId).toArray(), activities: await db.activities.where('schoolId').equals(schoolId).toArray(), activityScores: await db.activityScores.where('schoolId').equals(schoolId).toArray(), tests: await db.tests.where('schoolId').equals(schoolId).toArray(), testScores: await db.testScores.where('schoolId').equals(schoolId).toArray(), attendance: await db.attendance.where('schoolId').equals(schoolId).toArray(), syncQueue: await db.syncQueue.where('schoolId').equals(schoolId).toArray(), syncState: await db.syncState.where('schoolId').equals(schoolId).toArray()
  }));
  const plain = JSON.stringify(data); const checksum = await digest(plain); const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await keyFromPassword(password, salt); const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain));
  return { format: 'smart-classroom-backup', schemaVersion: LOCAL_SCHEMA_VERSION, exportedAt: new Date().toISOString(), deviceId, schoolId, encrypted: true, salt: base64(salt), iv: base64(iv), payload: base64(new Uint8Array(encrypted)), checksum };
}

export async function decryptBackup(envelope: BackupEnvelope, password: string, expectedSchoolId: string): Promise<Record<string, unknown[]>> {
  if (envelope.format !== 'smart-classroom-backup' || !envelope.encrypted || !envelope.salt || !envelope.iv) throw new Error('รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง');
  if (envelope.schoolId !== expectedSchoolId) throw new Error('ไฟล์สำรองข้อมูลเป็นของโรงเรียนอื่น');
  if (envelope.schemaVersion > LOCAL_SCHEMA_VERSION) throw new Error('ไฟล์ถูกสร้างจากเวอร์ชันที่ใหม่กว่า');
  const key = await keyFromPassword(password, bytes(envelope.salt)); const iv = bytes(envelope.iv); const ciphertext = bytes(envelope.payload); const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, ciphertext as unknown as BufferSource); const plain = decoder.decode(decrypted);
  if (await digest(plain) !== envelope.checksum) throw new Error('การตรวจสอบความสมบูรณ์ของไฟล์ล้มเหลว');
  return JSON.parse(plain) as Record<string, unknown[]>;
}

export function downloadBackup(envelope: BackupEnvelope) { const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `smart-classroom-${envelope.schoolId}-${envelope.exportedAt.slice(0, 10)}.scbackup`; link.click(); URL.revokeObjectURL(url); }
