// Giving points from the board, with the class watching.
//
// The whole panel is built around one motion: tap a student, tap a number, done. Everything that
// takes longer — choosing a category, typing a reason, entering an unusual amount — is available but
// never in the way. The award is written locally first, so the board changes before the network is
// consulted; if the device is offline it queues like every other write and syncs on reconnect.

import { useState, type FormEvent } from 'react';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { scoreEventsFor } from '../../data/selectors';
import type { Role, ScoreCategory, Student } from '../../domain/types';
import { canManageAcademicItem } from '../../data/teacherResponsibilities';

const quickAmounts = [-1, 1, 2, 5];

const categoryLabels: Record<ScoreCategory, string> = {
  bonus: 'คะแนนพิเศษ', participation: 'การมีส่วนร่วม', assignment: 'ใบงาน', activity: 'กิจกรรม',
  project: 'โครงงาน', test: 'แบบทดสอบ', exam: 'ข้อสอบ', manual: 'ให้เอง', other: 'อื่น ๆ'
};

/** The reasons a teacher reaches for most often, so the common case is one tap. */
const suggestedReasons = ['ช่วยงานห้องเรียน', 'ตอบคำถาม', 'กิจกรรมพิเศษ', 'พัฒนาการดี', 'ตั้งใจเรียน'];

interface Props {
  student: Student;
  classId: string;
  subjectId: string | null;
  actorProfileId: string;
  actorRole: Role;
  onClose(): void;
}

export function QuickScorePanel({ student, classId, subjectId, actorProfileId, actorRole, onClose }: Props) {
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [category, setCategory] = useState<ScoreCategory>('bonus');
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  const history = scoreEventsFor(snapshot, student.id);
  const awarded = history.reduce((sum, event) => sum + event.points, 0);
  const canAward = canManageAcademicItem(snapshot, actorRole, actorProfileId, classId, subjectId);

  async function award(points: number) {
    setBusy(true); setError(null);
    try {
      await repository.awardScoreEvent({
        studentId: student.id, classId, subjectId, category, points,
        reason: reason.trim(), sourceType: 'board', awardedBy: actorProfileId
      });
      setFlash(points);
      setCustom('');
      window.setTimeout(() => setFlash(null), 1200);
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : 'ให้คะแนนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  function submitCustom(event: FormEvent) {
    event.preventDefault();
    const points = Number(custom.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(points) || points === 0) { setError('กรอกคะแนนเป็นตัวเลข'); return; }
    void award(points);
  }

  return (
    <aside className="quick-score" role="dialog" aria-label={`ให้คะแนน ${student.displayName}`}>
      <header className="quick-score-header">
        <div>
          <strong>{student.displayName}</strong>
          <span>เลขประจำตัว {student.studentCode} · คะแนนพิเศษสะสม {awarded}</span>
        </div>
        <button type="button" className="text-button" onClick={onClose} aria-label="ปิด">✕</button>
      </header>

      {flash !== null && (
        <div className="score-flash" role="status">{flash > 0 ? `+${flash}` : flash}</div>
      )}

      {!canAward && <div className="alert warning" role="status">ดูประวัติได้ แต่การให้คะแนนต้องเป็นครูเจ้าของวิชานี้</div>}

      <div className="quick-amounts">
        {quickAmounts.map((amount) => (
          <button
            key={amount} type="button" className="amount-button" disabled={busy || !canAward}
            onClick={() => void award(amount)}
          >
            {amount > 0 ? `+${amount}` : amount}
          </button>
        ))}
      </div>

      <label>
        ประเภทคะแนน
        <select disabled={!canAward} value={category} onChange={(event) => setCategory(event.target.value as ScoreCategory)}>
          {(Object.keys(categoryLabels) as ScoreCategory[]).map((key) => (
            <option key={key} value={key}>{categoryLabels[key]}</option>
          ))}
        </select>
      </label>

      <div className="reason-chips">
        {suggestedReasons.map((suggestion) => (
          <button
            key={suggestion} type="button"
            className={`chip ${reason === suggestion ? 'active' : ''}`}
            onClick={() => setReason(reason === suggestion ? '' : suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <label>
        เหตุผล (ไม่บังคับ)
        <input disabled={!canAward} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น ช่วยเพื่อนอธิบายโจทย์" />
      </label>

      <form className="custom-score" onSubmit={submitCustom}>
        <label>
          กำหนดคะแนนเอง
          <input
            value={custom} disabled={!canAward} onChange={(event) => setCustom(event.target.value)}
            inputMode="decimal" placeholder="เช่น 10 หรือ -2"
          />
        </label>
        <button className="secondary-button" disabled={!canAward || busy || custom.trim().length === 0}>ให้คะแนน</button>
      </form>

      {error && <div className="alert error" role="alert">{error}</div>}

      <section className="score-history">
        <h3>ประวัติคะแนน</h3>
        {history.length === 0 ? (
          <p className="muted">ยังไม่มีคะแนนพิเศษ</p>
        ) : (
          <ul>
            {history.slice(0, 8).map((event) => (
              <li key={event.id}>
                <span className={`points ${event.points > 0 ? 'up' : 'down'}`}>
                  {event.points > 0 ? `+${event.points}` : event.points}
                </span>
                <span className="detail">
                  {categoryLabels[event.category]}{event.reason ? ` · ${event.reason}` : ''}
                </span>
                <span className="when">{new Date(event.occurredAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
