import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { attendanceSummary, classIdOfStudent, consentedStudents, privacyPolicyFrom, standingsFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { requireSupabase } from '../../services/supabase';
import { ParentRequestsPanel } from './ParentRequestsPanel';

const statusLabels = { invited: 'ส่งคำเชิญแล้ว', linked: 'เชื่อมบัญชีแล้ว', revoked: 'ยกเลิกแล้ว' } as const;

export function ParentsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const privacy = privacyPolicyFrom(snapshot.settings);
  const isStaff = membership.role === 'admin' || membership.role === 'teacher';

  /**
   * A guardian the school records itself. The account, when one is wanted, is invited against that
   * same record, so a parent who signs up later joins the guardian already on file.
   */
  async function addParentAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    setBusy(true);
    try {
      const { parentId } = await repository.saveParentAccount({
        studentId: String(data.get('studentId') ?? ''),
        displayName: String(data.get('displayName') ?? '').trim(),
        relationship: String(data.get('relationship') ?? '').trim(),
        phone: String(data.get('phone') ?? '').trim()
      });
      if (!email) {
        setMessage('บันทึกผู้ปกครองแล้ว เปิดบัญชีให้ภายหลังได้');
      } else {
        const { data: invitation, error } = await requireSupabase().functions.invoke('member-invitation', {
          body: { action: 'create', schoolId: membership.schoolId, role: 'parent', targetEntityId: parentId, email }
        });
        if (error) throw error;
        const code = (invitation as { code?: string } | null)?.code;
        setMessage(code ? `บันทึกแล้ว · รหัสคำเชิญ ${code} (ใช้ได้ 48 ชั่วโมง)` : 'บันทึกผู้ปกครองและสร้างคำเชิญแล้ว');
      }
      form.reset();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกผู้ปกครองไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await repository.saveParentLink({
        studentId: String(data.get('studentId') ?? ''),
        parentName: String(data.get('parentName') ?? '').trim(),
        relationship: String(data.get('relationship') ?? '').trim(),
        contact: String(data.get('contact') ?? '').trim()
      });
      form.reset();
      setMessage('สร้างคำเชิญผูกบัญชีแล้ว ส่งรหัสให้ผู้ปกครองทาง LINE');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'สร้างคำเชิญไม่สำเร็จ');
    }
  }

  if (membership.role === 'parent') {
    const children = consentedStudents(snapshot);
    return (
      <>
        <section className="page-heading">
          <div>
            <span className="eyebrow">Parent Portal</span>
            <h1>บุตรหลานของฉัน</h1>
            <p>แสดงเฉพาะข้อมูลที่ได้รับความยินยอมตามนโยบายเวอร์ชัน {privacy.policyVersion}</p>
          </div>
        </section>
        <section className="panel data-panel">
          {children.length === 0 ? (
            <div className="empty-state"><span>♧</span><h3>ยังไม่มีการเชื่อมบัญชีที่ยินยอมแล้ว</h3><p>ติดต่อครูประจำชั้นเพื่อขอรหัสผูกบัญชี</p></div>
          ) : (
            <div className="student-grid">
              {children.map((student) => {
                const classId = classIdOfStudent(snapshot, student.id) ?? '';
                const summary = attendanceSummary(snapshot, { studentId: student.id });
                const standing = standingsFor(snapshot, classId).find((entry) => entry.student.id === student.id);
                return (
                  <article key={student.id} className="student-card">
                    <ProfileAvatar displayName={student.displayName} avatarId={student.avatarId} avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={64} />
                    <div>
                      <strong>{student.displayName}</strong>
                      <span>เข้าเรียน {summary.presentRate}% · ขาด {summary.absent} วัน</span>
                      <span>
                        {privacy.shareScoresWithParents && standing
                          ? `คะแนนรวม ${standing.total.toFixed(2)} · เกรด ${standing.grade}`
                          : 'โรงเรียนปิดการแชร์คะแนนกับผู้ปกครอง'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">การเชื่อมบัญชีผู้ปกครอง</span>
          <h1>ผู้ปกครอง</h1>
          <p>{snapshot.parentLinks.filter((item) => item.status === 'linked').length} บัญชีเชื่อมแล้ว จากทั้งหมด {snapshot.parentLinks.length} รายการ</p>
        </div>
      </section>

      {isStaff && mode === 'cloud' && <ParentRequestsPanel schoolId={membership.schoolId} />}

      {isStaff && (
        <form className="panel inline-form" onSubmit={(event) => void invite(event)}>
          <div className="panel-heading"><h2>สร้างคำเชิญผูกบัญชี (one-time code)</h2></div>
          <div className="form-grid">
            <label>
              นักเรียน
              <select name="studentId" required>
                <option value="">เลือกนักเรียน</option>
                {snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
              </select>
            </label>
            <label>ชื่อผู้ปกครอง<input name="parentName" required /></label>
            <label>ความสัมพันธ์<input name="relationship" placeholder="มารดา / บิดา / ผู้ปกครอง" required /></label>
            <label>เบอร์ติดต่อ<input name="contact" required /></label>
          </div>
          <button className="primary-button">สร้างคำเชิญ</button>
          <p className="hint">เส้นทางนี้ใช้กับผู้ปกครองที่ผูกผ่าน LINE OA รหัสมีอายุจำกัดและใช้ได้ครั้งเดียว</p>
        </form>
      )}

      {isStaff && mode === 'cloud' && (
        <form className="panel inline-form" onSubmit={(event) => void addParentAccount(event)}>
          <div className="panel-heading">
            <h2>เพิ่มผู้ปกครองพร้อมบัญชีอีเมล</h2>
            <p>บันทึกผู้ปกครองไว้ก่อนได้ แล้วค่อยเปิดบัญชีให้เข้าใช้งานเมื่อพร้อม</p>
          </div>
          <div className="form-grid">
            <label>
              นักเรียน
              <select name="studentId" required defaultValue="">
                <option value="" disabled>เลือกนักเรียน</option>
                {snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
              </select>
            </label>
            <label>ชื่อผู้ปกครอง<input name="displayName" required minLength={2} /></label>
            <label>ความสัมพันธ์<input name="relationship" placeholder="มารดา / บิดา / ผู้ปกครอง" required /></label>
            <label>เบอร์ติดต่อ<input name="phone" /></label>
            <label>อีเมลสำหรับเปิดบัญชี (ไม่บังคับ)<input name="email" type="email" /></label>
          </div>
          <button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกผู้ปกครอง'}</button>
          <p className="hint">ถ้ากรอกอีเมล ระบบจะสร้างรหัสคำเชิญ 8 หลักให้ ผู้ปกครองสมัครด้วยอีเมลนั้นแล้วกรอกรหัสเพื่อผูกกับข้อมูลเดิม</p>
        </form>
      )}

      <section className="panel data-panel">
        <ul className="record-list">
          {snapshot.parentLinks.map((link) => {
            const student = snapshot.students.find((item) => item.id === link.studentId);
            return (
              <li key={link.id}>
                <div className="record-main">
                  <div>
                    <strong>{link.parentName}</strong>
                    <span>
                      {link.relationship} ของ {student?.displayName ?? 'ไม่พบนักเรียน'} · {link.contact}
                      {link.invitationCode && link.status === 'invited' && ` · รหัส ${link.invitationCode}`}
                    </span>
                    <span>
                      {link.consentGrantedAt
                        ? `ยินยอมนโยบายเวอร์ชัน ${link.consentVersion} เมื่อ ${new Date(link.consentGrantedAt).toLocaleDateString('th-TH')}`
                        : 'ยังไม่ได้บันทึกความยินยอม'}
                      {link.lineUserId ? ' · เชื่อม LINE แล้ว' : ' · ยังไม่เชื่อม LINE'}
                    </span>
                  </div>
                  <span className={`status-chip ${link.status === 'linked' ? 'success' : link.status === 'invited' ? 'warning' : 'danger'}`}>
                    {statusLabels[link.status]}
                  </span>
                </div>
                {isStaff && link.status !== 'revoked' && (
                  <div className="record-actions">
                    <button
                      className="secondary-button"
                      onClick={() => void repository.setParentConsent(link.id, !link.consentGrantedAt, privacy.policyVersion)
                        .then(() => setMessage(link.consentGrantedAt ? 'ถอนความยินยอมแล้ว' : 'บันทึกความยินยอมแล้ว'))
                        .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'ไม่สำเร็จ'))}
                    >
                      {link.consentGrantedAt ? 'ถอนความยินยอม' : 'บันทึกความยินยอม'}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => void repository.revokeParentLink(link.id)
                        .then(() => setMessage('ยกเลิกการเชื่อมบัญชีแล้ว'))
                        .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'ไม่สำเร็จ'))}
                    >
                      ยกเลิกการเชื่อม
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
