import { db } from '../../db/database';
import { announceLocalMutation } from '../../db/localMutation';
import type { SyncEntityType, SyncQueueItem, SyncRecord } from '../../domain/types';

/**
 * The changes the server would not take, in words the person who made them can act on.
 *
 * A blocked change used to be a number on the operations screen and nothing else: "ต้องตรวจสอบ 10",
 * with the reason sitting in the local queue as a Postgres constraint name. Somebody who imported the
 * same roster twice saw the count and had no way to learn which row, or why, or what to do about it.
 */

const entityLabels: Record<SyncEntityType, string> = {
  student: 'นักเรียน', enrollment: 'การเข้าห้องเรียน', assignment: 'งานที่มอบหมาย',
  submission: 'งานที่ส่ง', activity: 'กิจกรรมเก็บคะแนน', activity_score: 'คะแนนกิจกรรม',
  test: 'รายการสอบ', test_score: 'คะแนนสอบ', attendance: 'การเช็กชื่อ', setting: 'การตั้งค่า',
  timetable_entry: 'คาบในตารางสอน', achievement: 'เหรียญรางวัล', score_event: 'คะแนนพิเศษ'
};

const localTables: Record<SyncEntityType, string> = {
  student: 'students', enrollment: 'enrollments', assignment: 'assignments', submission: 'submissions',
  activity: 'activities', activity_score: 'activityScores', test: 'tests', test_score: 'testScores',
  attendance: 'attendance', setting: 'settings', timetable_entry: 'timetable',
  achievement: 'achievements', score_event: 'scoreEvents'
};

/**
 * What the server said, and what it means here.
 *
 * The order matters: the first match wins, so the specific constraint names come before the general
 * "duplicate key" that all of them also contain.
 */
const reasons: Array<{ match: string; reason: string; fix: string }> = [
  {
    match: 'students_school_id_student_code_key',
    reason: 'เลขประจำตัวนักเรียนนี้มีอยู่แล้วในโรงเรียน',
    fix: 'ถ้าเป็นการนำเข้าไฟล์เดิมซ้ำ ให้ทิ้งรายการนี้ · ถ้าเป็นคนละคน ให้แก้เลขประจำตัวแล้วบันทึกใหม่'
  },
  {
    match: 'one_active_enrollment_per_term',
    reason: 'นักเรียนคนนี้อยู่ในห้องเรียนของภาคเรียนนี้แล้ว',
    fix: 'ย้ายห้องจากหน้ารายชื่อนักเรียนแทนการลงทะเบียนซ้ำ แล้วทิ้งรายการนี้'
  },
  {
    match: 'parents_unique_active_name',
    reason: 'มีผู้ปกครองชื่อนี้อยู่แล้วในโรงเรียน',
    fix: 'แก้ไขผู้ปกครองรายเดิม หรือใช้ชื่อที่ต่างกัน'
  },
  {
    match: 'duplicate key value',
    reason: 'ข้อมูลนี้มีอยู่แล้วในระบบ บันทึกซ้ำไม่ได้',
    fix: 'ถ้าบันทึกไปแล้วให้ทิ้งรายการนี้ได้'
  },
  {
    match: 'SYNC_CONFLICT',
    reason: 'มีเครื่องอื่นแก้ข้อมูลนี้ก่อน',
    fix: 'ตัดสินที่หัวข้อ “ข้อมูลขัดแย้ง” ด้านบนว่าจะใช้ข้อมูลของใคร'
  },
  {
    match: 'SUBJECT_OWNER_REQUIRED',
    reason: 'เฉพาะครูเจ้าของรายวิชานี้เท่านั้นที่บันทึกได้',
    fix: 'ให้ผู้ดูแลกำหนดเจ้าของรายวิชา หรือให้ครูเจ้าของวิชาเป็นผู้บันทึก'
  },
  {
    match: 'MEMBERSHIP_INACTIVE',
    reason: 'บัญชีนี้ถูกปิดใช้งานในโรงเรียนนี้',
    fix: 'ให้ผู้ดูแลเปิดสิทธิ์ให้ก่อน แล้วกดลองใหม่'
  },
  {
    match: 'DEVICE_REVOKED',
    reason: 'อุปกรณ์เครื่องนี้ถูกเพิกถอนสิทธิ์ซิงก์',
    fix: 'ให้ผู้ดูแลอนุญาตอุปกรณ์นี้อีกครั้ง แล้วกดลองใหม่'
  },
  {
    match: 'CLIENT_UPDATE_REQUIRED',
    reason: 'แอปรุ่นนี้เก่ากว่าที่เซิร์ฟเวอร์รองรับ',
    fix: 'รีเฟรชหน้าเพื่ออัปเดตแอป แล้วกดลองใหม่'
  },
  {
    match: 'FORBIDDEN',
    reason: 'บัญชีนี้ไม่มีสิทธิ์บันทึกรายการนี้',
    fix: 'ให้ผู้ดูแลตรวจสิทธิ์ หรือให้ผู้ที่มีสิทธิ์เป็นผู้บันทึก'
  },
  {
    match: 'VALIDATION_ERROR',
    reason: 'ข้อมูลไม่ครบหรือไม่อยู่ในรูปแบบที่ระบบรับได้',
    fix: 'แก้ข้อมูลแล้วบันทึกใหม่ จากนั้นทิ้งรายการนี้'
  }
];

export interface BlockedMutation {
  queueId: string;
  entityType: SyncEntityType;
  entityLabel: string;
  name: string;
  reason: string;
  fix: string;
  /** The server's own words, kept for the case nobody anticipated. */
  detail: string;
  blockedAt: string;
  /** True when the record never reached the server, so discarding removes it from this device too. */
  removesLocalRecord: boolean;
}

/** The most human thing in a payload: what a person would call this record. */
function nameOf(payload: Record<string, unknown>): string {
  for (const key of ['displayName', 'title', 'name', 'studentCode', 'attendanceDate']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

export function describeBlockedReason(lastError: string | null): { reason: string; fix: string; detail: string } {
  const raw = (lastError ?? '').trim();
  const known = reasons.find((candidate) => raw.includes(candidate.match));
  if (known) return { reason: known.reason, fix: known.fix, detail: raw };
  return {
    reason: 'เซิร์ฟเวอร์ไม่รับรายการนี้',
    // No invented explanation: the server's own words are what there is, and hiding them is how a
    // problem stays unsolved.
    fix: 'ส่งข้อความด้านล่างให้ผู้ดูแลระบบ',
    detail: raw || 'ไม่มีรายละเอียดจากเซิร์ฟเวอร์'
  };
}

export async function listBlockedMutations(schoolId: string): Promise<BlockedMutation[]> {
  const items = await db.syncQueue.where({ schoolId, status: 'blocked' }).toArray();
  const rows = await Promise.all(items.map(async (item) => {
    const { reason, fix, detail } = describeBlockedReason(item.lastError);
    const payload = item.payload as Record<string, unknown>;
    const local = await db.table<SyncRecord, string>(localTables[item.entityType]).get(item.entityId).catch(() => undefined);
    return {
      queueId: item.queueId,
      entityType: item.entityType,
      entityLabel: entityLabels[item.entityType] ?? item.entityType,
      name: nameOf(payload),
      reason, fix, detail,
      blockedAt: item.createdAt,
      // Version 0 means the server has never accepted this record, so the copy on this device is the
      // only one there is and dropping the change means dropping the record.
      removesLocalRecord: item.operation === 'upsert' && (local?.version ?? 0) === 0
    };
  }));
  return rows.sort((left, right) => right.blockedAt.localeCompare(left.blockedAt));
}

/** Puts one change back in the queue for the next sync. */
export async function retryBlockedMutation(queueId: string): Promise<void> {
  await db.syncQueue.update(queueId, {
    status: 'pending', attemptCount: 0, nextRetryAt: new Date().toISOString(), lastError: null
  });
}

/**
 * Drops one change for good.
 *
 * A record the server never accepted goes with it: keeping it would leave a row on this device that
 * exists nowhere else and that nothing will ever reconcile — the duplicate student an import made,
 * still sitting in the roster.
 */
export async function discardBlockedMutation(queueId: string): Promise<void> {
  const item = await db.syncQueue.get(queueId);
  if (!item) return;
  const table = db.table<SyncRecord, string>(localTables[item.entityType]);
  const local = await table.get(item.entityId).catch(() => undefined);
  await db.transaction('rw', db.syncQueue, table, async () => {
    await db.syncQueue.delete(queueId);
    if (item.operation === 'upsert' && local && (local.version ?? 0) === 0) await table.delete(item.entityId);
  });
  announceLocalMutation(item.schoolId);
}

export type { SyncQueueItem };
