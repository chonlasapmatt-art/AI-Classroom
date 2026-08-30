import type { Table } from 'dexie';
import { db, LOCAL_SCHEMA_VERSION } from '../../db/database';

export interface BackupEnvelope {
  format: 'smart-classroom-backup'; schemaVersion: number; exportedAt: string; deviceId: string; schoolId: string;
  encrypted: boolean; salt?: string; iv?: string; payload: string; checksum: string;
}

/**
 * Every local table a school's records live in, keyed by the name used inside the backup file.
 *
 * Attachments are deliberately absent: the bytes live in Supabase Storage and re-downloading them
 * is cheaper and safer than carrying tens of megabytes inside an encrypted JSON envelope. Their
 * metadata comes back with the next sync, so a restored device is not missing the file list.
 */
const backedUpTables = [
  'academicTerms', 'classes', 'subjects', 'teachers', 'classTeachers', 'parentLinks', 'students', 'enrollments',
  'assignments', 'submissions', 'submissionVersions', 'deadlineExtensions', 'activities', 'activityScores',
  'tests', 'testScores', 'attendance', 'notifications', 'notificationPreferences', 'announcements',
  'rubrics', 'rubricScores', 'academicAudit', 'timetable', 'achievements', 'settings', 'syncQueue', 'syncState'
] as const;

export type BackupTable = typeof backedUpTables[number];
export type BackupContents = Record<string, Record<string, unknown>[]>;

/** What a file holds, shown before anything is written back. */
export interface BackupSummary {
  exportedAt: string; schoolId: string; schemaVersion: number; deviceId: string;
  counts: { table: BackupTable; rows: number }[];
  totalRows: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
function base64(bytes: Uint8Array): string { let text = ''; bytes.forEach((byte) => { text += String.fromCharCode(byte); }); return btoa(text); }
function bytes(value: string): Uint8Array { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
async function digest(value: string) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function keyFromPassword(password: string, salt: Uint8Array) { const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations: 310_000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }

function tableOf(name: BackupTable): Table<Record<string, unknown>, string> {
  return db.table<Record<string, unknown>, string>(name);
}

export async function createEncryptedBackup(schoolId: string, deviceId: string, password: string): Promise<BackupEnvelope> {
  if (password.length < 12) throw new Error('รหัสสำรองข้อมูลต้องยาวอย่างน้อย 12 ตัวอักษร');
  const tables = backedUpTables.map((name) => tableOf(name));
  const data = await db.transaction('r', tables, async () => {
    const collected: BackupContents = {};
    for (const name of backedUpTables) {
      collected[name] = await tableOf(name).where('schoolId').equals(schoolId).toArray();
    }
    return collected;
  });
  const plain = JSON.stringify(data);
  const checksum = await digest(plain);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassword(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain));
  return {
    format: 'smart-classroom-backup', schemaVersion: LOCAL_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    deviceId, schoolId, encrypted: true, salt: base64(salt), iv: base64(iv),
    payload: base64(new Uint8Array(encrypted)), checksum
  };
}

export async function decryptBackup(envelope: BackupEnvelope, password: string, expectedSchoolId: string): Promise<BackupContents> {
  if (envelope.format !== 'smart-classroom-backup' || !envelope.encrypted || !envelope.salt || !envelope.iv) throw new Error('รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง');
  if (envelope.schoolId !== expectedSchoolId) throw new Error('ไฟล์สำรองข้อมูลเป็นของโรงเรียนอื่น');
  if (envelope.schemaVersion > LOCAL_SCHEMA_VERSION) throw new Error('ไฟล์ถูกสร้างจากเวอร์ชันที่ใหม่กว่า');
  const key = await keyFromPassword(password, bytes(envelope.salt));
  const iv = bytes(envelope.iv);
  const ciphertext = bytes(envelope.payload);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, ciphertext as unknown as BufferSource);
  const plain = decoder.decode(decrypted);
  if (await digest(plain) !== envelope.checksum) throw new Error('การตรวจสอบความสมบูรณ์ของไฟล์ล้มเหลว');
  return JSON.parse(plain) as BackupContents;
}

/** Reads a file well enough to describe it, so a person can decide before anything is overwritten. */
export async function inspectBackup(envelope: BackupEnvelope, password: string, expectedSchoolId: string): Promise<BackupSummary> {
  const contents = await decryptBackup(envelope, password, expectedSchoolId);
  const counts = backedUpTables.map((table) => ({ table, rows: contents[table]?.length ?? 0 }));
  return {
    exportedAt: envelope.exportedAt, schoolId: envelope.schoolId, schemaVersion: envelope.schemaVersion,
    deviceId: envelope.deviceId, counts, totalRows: counts.reduce((total, entry) => total + entry.rows, 0)
  };
}

export interface RestoreResult { written: number; skipped: number; tables: number }

/**
 * Writes a backup back into the local database.
 *
 * `merge` (the default) keeps whichever copy was updated most recently, so restoring onto a device
 * that has kept working never throws away newer local work. `replace` clears this school's rows
 * first and is the option to reach for when the local database is known to be damaged.
 *
 * Queued mutations are restored too: work that had not reached the server when the backup was taken
 * is still owed to the server afterwards.
 */
export async function restoreBackup(
  envelope: BackupEnvelope, password: string, expectedSchoolId: string, mode: 'merge' | 'replace' = 'merge'
): Promise<RestoreResult> {
  const contents = await decryptBackup(envelope, password, expectedSchoolId);
  const tables = backedUpTables.map((name) => tableOf(name));
  return db.transaction('rw', tables, async () => {
    let written = 0; let skipped = 0; let touched = 0;
    for (const name of backedUpTables) {
      const rows = contents[name];
      if (!rows || rows.length === 0) continue;
      touched += 1;
      const table = tableOf(name);
      const keyPath = name === 'syncQueue' ? 'queueId' : name === 'syncState' ? 'key' : 'id';
      if (mode === 'replace') {
        await table.where('schoolId').equals(expectedSchoolId).delete();
      }
      for (const row of rows) {
        if (row.schoolId !== expectedSchoolId) { skipped += 1; continue; }
        const key = row[keyPath];
        if (typeof key !== 'string') { skipped += 1; continue; }
        if (mode === 'merge') {
          const current = await table.get(key);
          const currentStamp = typeof current?.updatedAt === 'string' ? current.updatedAt : '';
          const incomingStamp = typeof row.updatedAt === 'string' ? row.updatedAt : '';
          if (current && currentStamp > incomingStamp) { skipped += 1; continue; }
        }
        await table.put(row);
        written += 1;
      }
    }
    return { written, skipped, tables: touched };
  });
}

export function downloadBackup(envelope: BackupEnvelope) {
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smart-classroom-${envelope.schoolId}-${envelope.exportedAt.slice(0, 10)}.scbackup`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Parses a chosen file into an envelope, refusing anything that is not one of ours. */
export async function readBackupFile(file: File): Promise<BackupEnvelope> {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error('อ่านไฟล์ไม่สำเร็จ ไฟล์อาจเสียหาย'); }
  const envelope = parsed as BackupEnvelope;
  if (envelope?.format !== 'smart-classroom-backup') throw new Error('ไม่ใช่ไฟล์สำรองข้อมูลของ Smart Classroom');
  return envelope;
}
