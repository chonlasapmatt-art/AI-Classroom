import { useMemo, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, attendanceSummary, rosterFor } from '../../data/selectors';
import type { AttendanceStatus } from '../../domain/types';
import { ProfileAvatar } from '../avatars/ProfileAvatar';

const labels: Record<AttendanceStatus, string> = { present: 'มาเรียน', late: 'สาย', absent: 'ขาด', leave: 'ลา' };
const order: AttendanceStatus[] = ['present', 'late', 'absent', 'leave'];

export function AttendancePage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);

  const selectedClassId = classId || classes[0]?.id || '';
  const roster = useMemo(() => rosterFor(snapshot, selectedClassId), [snapshot, selectedClassId]);
  const canMark = membership.role === 'admin' || membership.role === 'teacher';
  const summary = attendanceSummary(snapshot, { classId: selectedClassId, date });

  const statusOf = (studentId: string): AttendanceStatus | null =>
    snapshot.attendance.find((item) => item.classId === selectedClassId && item.studentId === studentId && item.attendanceDate === date)?.status ?? null;

  async function mark(studentId: string, status: AttendanceStatus) {
    try {
      await repository.setAttendance({ classId: selectedClassId, studentId, attendanceDate: date, status });
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    }
  }

  async function markAllPresent() {
    const unmarked = roster.filter((student) => statusOf(student.id) === null).map((student) => student.id);
    if (unmarked.length === 0) { setMessage('เช็กชื่อครบทุกคนแล้ว'); return; }
    await repository.setAttendanceForStudents(selectedClassId, date, 'present', unmarked);
    setMessage(`บันทึก "มาเรียน" ${unmarked.length} คน`);
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">บันทึกรายวัน</span>
          <h1>เช็กชื่อ</h1>
          <p>มา {summary.present} · สาย {summary.late} · ขาด {summary.absent} · ลา {summary.leave} จาก {roster.length} คน</p>
        </div>
        {canMark && <button className="primary-button" onClick={() => void markAllPresent()}>มาเรียนทั้งหมด</button>}
      </section>

      <div className="toolbar">
        <label>
          ห้องเรียน
          <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>วันที่<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <div className={`sync-pill ${roster.length > 0 && summary.total === roster.length ? 'online' : 'offline'}`}>
          <span />{summary.total}/{roster.length} เช็กแล้ว
        </div>
      </div>

      <section className="panel data-panel">
        {roster.length === 0 ? (
          <div className="empty-state"><span>✓</span><h3>ยังไม่มีนักเรียนในห้องนี้</h3><p>เพิ่มนักเรียนหรือย้ายเข้าห้องก่อนเช็กชื่อ</p></div>
        ) : (
          <div className="attendance-list">
            {roster.map((student) => {
              const status = statusOf(student.id);
              return (
                <article key={student.id}>
                  <ProfileAvatar displayName={student.displayName} avatarId={student.avatarId} avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={56} animation={status === 'present' ? 'wave' : 'idle'} />
                  <div className="student-name"><strong>{student.displayName}</strong><span>{student.studentCode}</span></div>
                  <div className="segmented">
                    {order.map((value) => (
                      <button
                        key={value}
                        className={status === value ? `active ${value}` : ''}
                        disabled={!canMark}
                        onClick={() => void mark(student.id, value)}
                      >
                        {labels[value]}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
