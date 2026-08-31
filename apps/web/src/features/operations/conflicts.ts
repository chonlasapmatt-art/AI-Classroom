// What a sync conflict is, and what about it a person actually has to decide.
//
// Kept apart from the screen so it can be tested on its own — and because a module that exports both
// a component and a plain function loses fast refresh, which matters on a screen edited while an
// incident is open.

export interface SyncConflict {
  conflictId: string;
  entityType: string;
  entityId: string;
  baseVersion: number;
  serverVersion: number;
  clientPayload: Record<string, unknown>;
  serverPayload: Record<string, unknown>;
  deviceName: string | null;
  createdAt: string;
}

export const conflictEntityLabels: Record<string, string> = {
  student: 'นักเรียน', enrollment: 'การลงทะเบียนเรียน', assignment: 'งานที่มอบหมาย',
  submission: 'งานที่ส่ง', activity: 'กิจกรรม', activity_score: 'คะแนนกิจกรรม',
  test: 'ข้อสอบ', test_score: 'คะแนนสอบ', attendance: 'การเช็กชื่อ', setting: 'การตั้งค่า',
  timetable_entry: 'ตารางสอน', achievement: 'เหรียญรางวัล', score_event: 'คะแนน'
};

// Bookkeeping that is different on every version by definition and tells a person nothing about
// which one is right.
const plumbing = new Set([
  'id', 'schoolId', 'school_id', 'version', 'createdAt', 'created_at', 'updatedAt', 'updated_at',
  'serverUpdatedAt', 'server_updated_at', 'deletedAt', 'deleted_at'
]);

export interface FieldDifference {
  key: string;
  mine: unknown;
  theirs: unknown;
}

/**
 * The fields that actually differ between the two versions.
 *
 * Showing the whole record twice and letting somebody find the difference is how the wrong version
 * gets chosen. The decision is the difference, so the difference is what the screen shows.
 */
export function differingFields(
  mine: Record<string, unknown>, theirs: Record<string, unknown>
): FieldDifference[] {
  const keys = new Set([...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})]);
  return [...keys]
    .filter((key) => !plumbing.has(key))
    .map((key) => ({ key, mine: mine?.[key], theirs: theirs?.[key] }))
    .filter((row) => JSON.stringify(row.mine) !== JSON.stringify(row.theirs));
}

/** One value, as a cell rather than as JSON nobody reads. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
