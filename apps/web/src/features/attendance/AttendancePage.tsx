import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, attendanceDailySummary, attendanceDayStatus, attendanceSummary, consentedStudents, rosterFor, subjectById } from '../../data/selectors';
import type { AttendanceStatus } from '../../domain/types';
import { Stat } from '../../ui/components';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

const labels: Record<AttendanceStatus, string> = { present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา' };
const order: AttendanceStatus[] = ['present', 'late', 'absent', 'leave'];
const dayLabels: Record<AttendanceStatus | 'unmarked', string> = { present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา', unmarked: 'ยังไม่เช็ก' };
type AttendanceSession = { key: string; label: string; type: 'daily' | 'class' | 'homeroom'; period: number | null; subjectId: string | null; timetableEntryId: string | null; time: string };

function isoWeekday(date: string): number { const day = new Date(`${date}T00:00:00`).getDay(); return day === 0 ? 7 : day; }
function sessionLabel(session: AttendanceSession, subjectName?: string): string {
  if (session.type === 'homeroom') return 'โฮมรูม';
  if (session.type === 'daily') return 'สรุปทั้งวัน';
  return `${subjectName ?? 'ไม่ระบุวิชา'} · คาบ ${session.period ?? '-'}`;
}

function ParentAttendanceSummary() {
  const snapshot = useSchoolSnapshot();
  const children = consentedStudents(snapshot);
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const child = children.find((item) => item.id === (studentId || children[0]?.id));
  const todayRows = useMemo(() => snapshot.attendance.filter((item) => item.studentId === child?.id && item.attendanceDate === date), [child?.id, date, snapshot.attendance]);
  const overall = useMemo(() => child ? attendanceDailySummary(snapshot, { studentId: child.id }) : null, [child, snapshot]);
  const classes = useMemo(() => new Map(activeClasses(snapshot).map((item) => [item.id, item.name])), [snapshot]);
  const subjectName = (subjectId: string | null | undefined) => subjectById(snapshot, subjectId ?? null)?.name;
  return (
    <>
      <section className="page-heading"><div><span className="eyebrow">มุมมองผู้ปกครอง · ดูอย่างเดียว</span><h1>การเข้าเรียนของลูก</h1><p>ดูภาพรวมตลอดวันของเฉพาะนักเรียนที่เชื่อมกับบัญชีนี้</p></div></section>
      <div className="toolbar"><label>นักเรียน<select value={child?.id ?? ''} onChange={(event) => setStudentId(event.target.value)}>{children.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><label>วันที่<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
      {!child ? <section className="panel"><div className="empty-state"><span>♧</span><h3>ยังไม่มีนักเรียนที่เชื่อมไว้</h3><p>เมื่อแอดมินเชื่อมบัญชีแล้ว ภาพรวมการเข้าเรียนจะแสดงที่นี่</p></div></section> : <>
        <section className="attendance-parent-hero panel"><div className="attendance-parent-profile"><ProfileAvatar displayName={child.displayName} avatarId={child.avatarId} avatarPhotoId={child.avatarPhotoId} avatarIndex={child.avatarIndex} avatarConfig={child.avatarConfig} size={72} animation="idle" /><div><span className="eyebrow">ข้อมูลของลูก</span><h2>{child.displayName}</h2><p>{child.studentCode}</p></div></div><div className="attendance-day-summary"><strong>{dayLabels[attendanceDayStatus(todayRows)]}</strong><span>{date} · บันทึกแล้ว {todayRows.length} คาบ</span></div></section>
        <div className="ui-stat-grid"><Stat label="มาเรียน" value={todayRows.filter((row) => row.status === 'present').length} hint="คาบวันนี้" tone="success" /><Stat label="สาย" value={todayRows.filter((row) => row.status === 'late').length} hint="คาบวันนี้" tone="warning" /><Stat label="ขาด" value={todayRows.filter((row) => row.status === 'absent').length} hint="คาบวันนี้" tone="danger" /><Stat label="อัตรามาเรียน" value={`${overall?.presentRate ?? 0}%`} hint={`จาก ${overall?.totalDays ?? 0} วันที่บันทึก`} tone="info" /></div>
        <section className="panel attendance-parent-detail"><div className="panel-heading"><div><h2>รายละเอียดของวันนี้</h2><p>สรุปตามคาบที่ครูบันทึกไว้ ผู้ปกครองไม่สามารถแก้ไขข้อมูลได้</p></div><span className="sync-pill"><span />{todayRows.length} คาบ</span></div>{todayRows.length === 0 ? <div className="empty-state compact"><span>◷</span><h3>ยังไม่มีข้อมูลของวันนี้</h3><p>ครูจะบันทึกแยกตามวิชาและคาบเรียนโดยอัตโนมัติ</p></div> : <div className="attendance-readonly-list">{todayRows.sort((a, b) => (a.period ?? 99) - (b.period ?? 99)).map((row) => <article key={row.id}><div><strong>{row.sessionType === 'homeroom' ? 'โฮมรูม' : subjectName(row.subjectId) ?? (row.sessionKey === 'daily' ? 'สรุปทั้งวัน' : 'ไม่ระบุวิชา')}</strong><span>{classes.get(row.classId) ?? 'ห้องเรียน'}{row.period ? ` · คาบ ${row.period}` : ''}</span></div><span className={`attendance-status ${row.status}`}>{labels[row.status]}</span></article>)}</div>}</section>
      </>}
    </>
  );
}

export function AttendancePage() {
  const { membership } = useSession();
  return membership.role === 'parent' ? <ParentAttendanceSummary /> : <StaffAttendancePage />;
}

function StaffAttendancePage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionKey, setSessionKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const selectedClassId = classId || classes[0]?.id || '';
  const roster = useMemo(() => rosterFor(snapshot, selectedClassId), [snapshot, selectedClassId]);
  const canMark = membership.role === 'admin' || membership.role === 'teacher';
  const sessions = useMemo<AttendanceSession[]>(() => {
    const classroom = classes.find((item) => item.id === selectedClassId);
    const entries = snapshot.timetable.filter((item) => item.classId === selectedClassId && item.academicTermId === classroom?.academicTermId && item.dayOfWeek === isoWeekday(date) && item.status === 'active').sort((a, b) => a.period - b.period);
    const classSessions = entries.map((entry) => ({ key: entry.id, label: '', type: 'class' as const, period: entry.period, subjectId: entry.subjectId, timetableEntryId: entry.id, time: `${entry.startTime}–${entry.endTime}` }));
    return [{ key: 'homeroom', label: 'โฮมรูม', type: 'homeroom', period: null, subjectId: null, timetableEntryId: null, time: '' }, ...classSessions, ...(classSessions.length === 0 ? [{ key: 'daily', label: 'สรุปทั้งวัน', type: 'daily' as const, period: null, subjectId: null, timetableEntryId: null, time: '' }] : [])];
  }, [classes, date, selectedClassId, snapshot.timetable]);
  const selectedSession = sessions.find((session) => session.key === sessionKey) ?? sessions[0];
  const summary = selectedSession ? attendanceSummary(snapshot, { classId: selectedClassId, date, sessionKey: selectedSession.key }) : attendanceSummary(snapshot, { classId: selectedClassId, date });
  const statusOf = (studentId: string): AttendanceStatus | null => selectedSession ? snapshot.attendance.find((item) => item.classId === selectedClassId && item.studentId === studentId && item.attendanceDate === date && (item.sessionKey ?? 'daily') === selectedSession.key)?.status ?? null : null;
  async function mark(studentId: string, status: AttendanceStatus) {
    if (!selectedSession) return;
    try { await repository.setAttendance({ classId: selectedClassId, studentId, attendanceDate: date, status, sessionKey: selectedSession.key, sessionType: selectedSession.type, period: selectedSession.period, subjectId: selectedSession.subjectId, timetableEntryId: selectedSession.timetableEntryId }); } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ'); }
  }
  async function markAllPresent() {
    if (!selectedSession) return;
    const unmarked = roster.filter((student) => statusOf(student.id) === null).map((student) => student.id);
    if (unmarked.length === 0) { setMessage('เช็กชื่อครบทุกคนแล้ว'); return; }
    await repository.setAttendanceForStudents(selectedClassId, date, 'present', unmarked, { sessionKey: selectedSession.key, sessionType: selectedSession.type, period: selectedSession.period, subjectId: selectedSession.subjectId, timetableEntryId: selectedSession.timetableEntryId });
    setMessage(`บันทึก "มาเรียน" ${unmarked.length} คน · ${selectedSession.label || sessionLabel(selectedSession, subjectById(snapshot, selectedSession.subjectId)?.name)}`);
  }
  return (
    <>
      <section className="page-heading"><div><span className="eyebrow">บันทึกการเข้าเรียนรายคาบ</span><h1>เช็กชื่อ</h1><p>{selectedSession ? `${selectedSession.label || sessionLabel(selectedSession, subjectById(snapshot, selectedSession.subjectId)?.name)} · มา ${summary.present} · สาย ${summary.late} · ขาด ${summary.absent} · ลา ${summary.leave}` : 'เลือกห้องเรียนเพื่อเริ่มเช็กชื่อ'}</p></div>{canMark && <button className="primary-button" onClick={() => void markAllPresent()}>มาเรียนทั้งหมด</button>}</section>
      <div className="toolbar attendance-toolbar"><label>ห้องเรียน<select value={selectedClassId} onChange={(event) => { setClassId(event.target.value); setSessionKey(''); }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>วันที่<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setSessionKey(''); }} /></label><label className="attendance-session-field">วิชา / คาบ<select value={selectedSession?.key ?? ''} onChange={(event) => setSessionKey(event.target.value)}>{sessions.map((session) => <option key={session.key} value={session.key}>{session.label || sessionLabel(session, subjectById(snapshot, session.subjectId)?.name)}{session.time ? ` · ${session.time}` : ''}</option>)}</select></label><div className={`sync-pill ${roster.length > 0 && summary.total === roster.length ? 'online' : 'offline'}`}><span />{summary.total}/{roster.length} เช็กแล้ว</div></div>
      {sessions.length === 1 && sessions[0]?.key === 'daily' && <div className="info-banner">ยังไม่มีตารางสอนของวันนี้ ระบบจึงเปิด “สรุปทั้งวัน” ให้บันทึกชั่วคราว · เพิ่มตารางสอนเพื่อแยกเช็กเป็นรายวิชา</div>}
      <section className="panel data-panel">{roster.length === 0 ? <div className="empty-state"><span>✓</span><h3>ยังไม่มีนักเรียนในห้องนี้</h3><p>เพิ่มนักเรียนหรือย้ายเข้าห้องก่อนเช็กชื่อ</p></div> : <div className="attendance-list">{roster.map((student) => { const status = statusOf(student.id); return <article key={student.id}><ProfileAvatar displayName={student.displayName} avatarId={student.avatarId} avatarPhotoId={student.avatarPhotoId} avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={56} animation={status === 'present' ? 'wave' : 'idle'} /><div className="student-name"><strong>{student.displayName}</strong><span>{student.studentCode}</span></div><div className="segmented">{order.map((value) => <button key={value} className={status === value ? `active ${value}` : ''} disabled={!canMark} onClick={() => void mark(student.id, value)}>{labels[value]}</button>)}</div></article>; })}</div>}</section>
      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
