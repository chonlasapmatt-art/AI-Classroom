import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { consentedStudents } from '../../data/selectors';
import type { SchoolSnapshot } from '../../data/schoolRepository';
import type { AchievementKey } from '../../domain/types';
import { achievementCatalog, achievementFor } from './achievementCatalog';

export function AchievementsPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canAward = membership.role === 'admin' || membership.role === 'teacher';
  const ownStudent = snapshot.students.find((student) => student.profileId === membership.profileId);

  // A student sees their own wall; a parent sees the children they are linked to; staff see everyone.
  const visibleStudents = useMemo(() => {
    if (canAward) return snapshot.students;
    if (ownStudent) return [ownStudent];
    return consentedStudents(snapshot);
  }, [canAward, ownStudent, snapshot]);

  const byStudent = useMemo(() => {
    const map = new Map<string, SchoolSnapshot['achievements']>();
    for (const badge of snapshot.achievements) {
      map.set(badge.studentId, [...(map.get(badge.studentId) ?? []), badge]);
    }
    return map;
  }, [snapshot.achievements]);

  async function award(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    try {
      await repository.awardAchievement({
        studentId: String(values.get('studentId') ?? ''),
        achievementKey: String(values.get('achievementKey') ?? '') as AchievementKey,
        note: String(values.get('note') ?? ''),
        awardedBy: membership.profileId
      });
      form.reset();
      setMessage('มอบเหรียญรางวัลแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'มอบเหรียญไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">การยกย่องเชิงบวก</span>
          <h1>เหรียญรางวัล</h1>
          <p>{snapshot.achievements.length} เหรียญที่มอบแล้ว · เหรียญที่ได้รับจะไม่ถูกเรียกคืน</p>
        </div>
      </section>

      {canAward && (
        <form className="panel inline-form" onSubmit={(event) => void award(event)}>
          <div className="panel-heading"><h2>มอบเหรียญ</h2></div>
          <div className="form-grid">
            <label>
              นักเรียน
              <select name="studentId" required defaultValue="">
                <option value="" disabled>เลือกนักเรียน</option>
                {snapshot.students.map((student) => (
                  <option key={student.id} value={student.id}>{student.displayName} · {student.studentCode}</option>
                ))}
              </select>
            </label>
            <label>
              เหรียญ
              <select name="achievementKey" required defaultValue="">
                <option value="" disabled>เลือกเหรียญ</option>
                {achievementCatalog.map((item) => (
                  <option key={item.key} value={item.key}>{item.icon} {item.label}</option>
                ))}
              </select>
            </label>
            <label>เหตุผล (ไม่บังคับ)<input name="note" maxLength={200} placeholder="เช่น ส่งงานครบ 5 ชิ้นติดต่อกัน" /></label>
          </div>
          <button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'มอบเหรียญ'}</button>
          <p className="hint">มอบเหรียญเดิมซ้ำจะไม่เกิดรายการซ้ำ ระบบถือว่าเหรียญนั้นได้มอบไปแล้ว</p>
        </form>
      )}

      <section className="panel data-panel">
        <div className="panel-heading"><h2>เหรียญของนักเรียน</h2></div>
        <ul className="record-list">
          {visibleStudents.map((student) => {
            const badges = byStudent.get(student.id) ?? [];
            return (
              <li key={student.id}>
                <div className="record-main">
                  <div>
                    <strong>{student.displayName}</strong>
                    <span>{student.studentCode}</span>
                  </div>
                  <span className={`status-chip ${badges.length > 0 ? 'success' : ''}`.trim()}>{badges.length} เหรียญ</span>
                </div>
                {badges.length > 0 && (
                  <div className="badge-row">
                    {badges.map((badge) => {
                      const definition = achievementFor(badge.achievementKey);
                      return (
                        <span key={badge.id} className="achievement-badge" title={badge.note || definition.description}>
                          <span aria-hidden="true">{definition.icon}</span>
                          {definition.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {visibleStudents.length === 0 && <p className="hint">ยังไม่มีนักเรียนที่ดูข้อมูลได้</p>}
      </section>

      <section className="panel data-panel">
        <div className="panel-heading"><h2>เหรียญทั้งหมดในระบบ</h2></div>
        <ul className="badge-catalog">
          {achievementCatalog.map((item) => (
            <li key={item.key}>
              <span aria-hidden="true" className="badge-icon">{item.icon}</span>
              <div><strong>{item.label}</strong><span>{item.description}</span></div>
            </li>
          ))}
        </ul>
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
