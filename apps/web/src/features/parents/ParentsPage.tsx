import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { attendanceDailySummary, classIdOfStudent, consentedStudents, privacyPolicyFrom, standingsFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { requireSupabase } from '../../services/supabase';
import { ChildLinkPanel } from './ChildLinkPanel';

type PasswordTarget = {
  profileId: string | null;
  parentName: string;
  studentId: string;
  relationship: string;
  contact: string;
};

type ManagedParent = {
  id: string;
  profileId: string | null;
  parentName: string;
  contact: string;
  status: string;
  childIds: string[];
};

async function loadManagedParents(schoolId: string): Promise<ManagedParent[]> {
  const client = requireSupabase();
  const load = () => Promise.all([
    client.from('parents').select('id,profile_id,display_name,phone,status').eq('school_id', schoolId).order('display_name'),
    client.from('parent_student_links').select('parent_id,student_id,status,deleted_at').eq('school_id', schoolId)
  ]);
  let [{ data: parents, error: parentsError }, { data: links, error: linksError }] = await load();
  const expired = [parentsError, linksError].some((error) => (error as { status?: number } | null)?.status === 401);
  if (expired) {
    const { error: refreshError } = await client.auth.refreshSession();
    if (!refreshError) [{ data: parents, error: parentsError }, { data: links, error: linksError }] = await load();
  }
  if (parentsError || linksError) throw parentsError ?? linksError;
  const childIdsByParent = new Map<string, string[]>();
  for (const link of (links ?? []) as { parent_id: string; student_id: string; status: string; deleted_at: string | null }[]) {
    if (link.deleted_at || link.status === 'revoked') continue;
    const childIds = childIdsByParent.get(link.parent_id) ?? [];
    childIds.push(link.student_id);
    childIdsByParent.set(link.parent_id, childIds);
  }
  return ((parents ?? []) as { id: string; profile_id: string | null; display_name: string; phone: string | null; status: string }[])
    .map((parent) => ({
      id: parent.id,
      profileId: parent.profile_id,
      parentName: parent.display_name,
      contact: parent.phone ?? '',
      status: parent.status,
      childIds: childIdsByParent.get(parent.id) ?? []
    }));
}

export function ParentsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordParent, setPasswordParent] = useState<PasswordTarget | null>(null);
  const [managedParents, setManagedParents] = useState<ManagedParent[]>([]);
  const privacy = privacyPolicyFrom(snapshot.settings);
  const canManageAccounts = membership.role === 'admin';

  useEffect(() => {
    if (mode !== 'cloud' || !canManageAccounts) {
      setManagedParents([]);
      return;
    }
    let cancelled = false;
    void loadManagedParents(membership.schoolId)
      .then((parents) => { if (!cancelled) setManagedParents(parents); })
      .catch(() => { if (!cancelled) setMessage('โหลดรายชื่อผู้ปกครองไม่สำเร็จ กรุณากดรีเฟรช'); });
    return () => { cancelled = true; };
  }, [canManageAccounts, membership.schoolId, mode]);

  const parentRows = useMemo(() => {
    if (mode === 'cloud' && canManageAccounts) {
      return managedParents.map((parent) => {
        const links = snapshot.parentLinks.filter((link) => link.profileId === parent.profileId);
        return {
          key: parent.id,
          parentName: parent.parentName,
          profileId: parent.profileId,
          contact: parent.contact,
          childNames: parent.childIds.map((studentId) => snapshot.students.find((student) => student.id === studentId)?.displayName).filter((name): name is string => Boolean(name)),
          links,
          status: parent.status
        };
      });
    }
    const grouped = new Map<string, { key: string; parentName: string; profileId: string | null; contact: string; childNames: string[]; links: typeof snapshot.parentLinks; status: string }>();
    for (const link of snapshot.parentLinks) {
      const key = link.profileId ?? `${link.parentName}|${link.contact}`;
      const row = grouped.get(key) ?? { key, parentName: link.parentName, profileId: link.profileId, contact: link.contact, childNames: [], links: [], status: link.status };
      const student = snapshot.students.find((item) => item.id === link.studentId);
      if (student && !row.childNames.includes(student.displayName)) row.childNames.push(student.displayName);
      row.links.push(link);
      if (link.status === 'linked') row.status = 'linked';
      grouped.set(key, row);
    }
    return Array.from(grouped.values());
  }, [canManageAccounts, managedParents, mode, snapshot]);

  async function addParentAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const studentId = String(data.get('studentId') ?? '').trim();
    const displayName = String(data.get('displayName') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const grantConsent = data.get('grantConsent') === 'on';
    setBusy(true);
    try {
      if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      if (mode === 'cloud') {
        const provisioned = await provisionManagedAccount({ schoolId: membership.schoolId, role: 'parent', recordId: crypto.randomUUID(), ...(studentId ? { studentId } : {}), displayName, password, relationship: String(data.get('relationship') ?? '').trim(), phone: String(data.get('phone') ?? '').trim() });
        if (studentId && grantConsent && provisioned.linkId) await repository.setParentConsent(provisioned.linkId, true, privacy.policyVersion);
        setManagedParents(await loadManagedParents(membership.schoolId));
      }
      else await repository.saveParentLink({ studentId, parentName: displayName, relationship: String(data.get('relationship') ?? '').trim(), contact: String(data.get('phone') ?? '').trim(), status: 'linked' });
      setMessage(`เพิ่มผู้ปกครอง ${displayName} แล้ว · ใช้ชื่อกับรหัสผ่านเข้าสู่ระบบได้เลย`);
      form.reset();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกผู้ปกครองไม่สำเร็จ');
    } finally {
      setBusy(false);
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
        {mode === 'cloud' && <ChildLinkPanel onChanged={() => window.location.reload()} />}
        <section className="panel data-panel">
          {children.length === 0 ? (
            <div className="empty-state"><span>♧</span><h3>ยังไม่มีการเชื่อมบัญชีที่ยินยอมแล้ว</h3><p>ติดต่อครูประจำชั้นเพื่อขอรหัสผูกบัญชี</p></div>
          ) : (
            <div className="student-grid">
              {children.map((student) => {
                const classId = classIdOfStudent(snapshot, student.id) ?? '';
                const summary = attendanceDailySummary(snapshot, { studentId: student.id });
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
          <p>{canManageAccounts
            ? `${parentRows.length} บัญชีผู้ปกครอง · ดูและจัดการการเชื่อมโยงได้ทั้งหมด`
            : `${parentRows.length} รายชื่อผู้ปกครองในห้องที่คุณสอน · แสดงเฉพาะชื่อผู้ปกครองและลูกที่เชื่อมแล้ว`}</p>
        </div>
      </section>

      {canManageAccounts && (
        <form className="panel inline-form" onSubmit={(event) => void addParentAccount(event)}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ส่วนที่ 1 · สร้างบัญชี</span>
              <h2>เพิ่มผู้ปกครอง</h2>
              <p>กำหนดชื่อและรหัสผ่านให้เข้าใช้งานได้ทันที พร้อมผูกนักเรียนตอนนี้หรือให้ผู้ปกครองผูกเองภายหลัง</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              ผูกกับนักเรียน
              <select name="studentId" defaultValue="">
                <option value="">ยังไม่ผูกตอนนี้ · ให้ผู้ปกครองเพิ่มเอง</option>
                {snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
              </select>
            </label>
            <label>ชื่อผู้ปกครอง<input name="displayName" required minLength={2} /></label>
            <label>ความสัมพันธ์<input name="relationship" placeholder="มารดา / บิดา / ผู้ปกครอง" required /></label>
            <label>เบอร์ติดต่อ<input name="phone" /></label>
            <label>รหัสผ่านเริ่มต้น<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          </div>
          <button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึกผู้ปกครอง'}</button>
          <label className="check-row"><input name="grantConsent" type="checkbox" /> อนุมัติให้ผู้ปกครองรับประกาศและข้อมูลของนักเรียนทันที</label>
          <p className="hint">ไม่ต้องใช้อีเมลหรือการสมัครเอง · ถ้ายังไม่ผูกลูก ผู้ปกครองจะกด “+ เพิ่มลูก” หลังเข้าสู่ระบบได้</p>
        </form>
      )}

      <section className="panel data-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ส่วนที่ 2 · ภาพรวมการเชื่อมโยง</span>
            <h2>รายชื่อผู้ปกครองทั้งหมด</h2>
            <p>ดูได้ทันทีว่าผู้ปกครองแต่ละคนเชื่อมกับนักเรียนคนใดบ้าง</p>
          </div>
          <span className="status-chip">{parentRows.length} บัญชี</span>
        </div>
        <ul className="record-list">
          {parentRows.map((row) => {
            return (
              <li key={row.key}>
                <div className="record-main">
                  <div>
                    <strong>{row.parentName}</strong>
                    <span className="parent-child-summary">เชื่อมกับ: {row.childNames.length > 0 ? row.childNames.join(' · ') : 'ยังไม่ได้เชื่อมนักเรียน'}</span>
                    {canManageAccounts
                      ? <span>{row.contact || 'ไม่ได้ระบุเบอร์ติดต่อ'} · {row.links.length} ความสัมพันธ์</span>
                      : <span>ผู้ปกครองที่เชื่อมกับห้องเรียนของคุณ</span>}
                  </div>
                  <span className="status-chip success">{canManageAccounts
                    ? (row.status === 'active' || row.status === 'linked' ? 'พร้อมใช้งาน' : 'ปิดใช้งาน')
                    : 'เชื่อมแล้ว'}</span>
                </div>
                {row.links.map((link) => canManageAccounts && link.status !== 'revoked' && (
                  <div className="record-actions" key={link.id}>
                    <span className="hint">{link.relationship} · {link.consentGrantedAt ? `ยินยอมแล้ว (${new Date(link.consentGrantedAt).toLocaleDateString('th-TH')})` : 'ยังไม่ยินยอม'}</span>
                    <button
                      className="secondary-button"
                      onClick={() => void repository.setParentConsent(link.id, !link.consentGrantedAt, privacy.policyVersion)
                        .then(() => setMessage(link.consentGrantedAt ? 'ถอนความยินยอมแล้ว' : 'บันทึกความยินยอมแล้ว'))
                        .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'ไม่สำเร็จ'))}
                    >
                      {link.consentGrantedAt ? 'ถอนความยินยอม' : 'บันทึกความยินยอม'}
                    </button>
                    <button className="text-button" onClick={() => void repository.revokeParentLink(link.id).then(() => setMessage('ยกเลิกการเชื่อมบัญชีแล้ว')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'ไม่สำเร็จ'))}>ยกเลิกการเชื่อม</button>
                    {canManageAccounts && <button className="text-button" onClick={() => setPasswordParent(link)}>{link.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชีเข้าใช้'}</button>}
                  </div>
                ))}
                {canManageAccounts && row.links.length === 0 && row.profileId && (
                  <div className="record-actions">
                    <span className="hint">บัญชีพร้อมใช้งาน รอผู้ปกครองผูกนักเรียน</span>
                    <button className="text-button" onClick={() => setPasswordParent({ profileId: row.profileId, parentName: row.parentName, studentId: '', relationship: 'ผู้ปกครอง', contact: row.contact })}>เปลี่ยนรหัสผ่าน</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {passwordParent && canManageAccounts && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ตั้งรหัสผ่านผู้ปกครอง">
          <section className="modal-card">
            <div className="panel-heading"><h2>{passwordParent.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · {passwordParent.parentName}</h2><button type="button" className="icon-button" onClick={() => setPasswordParent(null)} aria-label="ปิด">×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get('password') ?? ''); const confirm = String(data.get('confirm') ?? ''); if (password.length < 8 || password !== confirm) { setMessage(password !== confirm ? 'รหัสผ่านไม่ตรงกัน' : 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; } const action = passwordParent.profileId ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'parent', profileId: passwordParent.profileId, password }) : provisionManagedAccount({ schoolId: membership.schoolId, role: 'parent', recordId: crypto.randomUUID(), ...(passwordParent.studentId ? { studentId: passwordParent.studentId } : {}), displayName: passwordParent.parentName, password, relationship: passwordParent.relationship, phone: passwordParent.contact }); void action.then(() => { setPasswordParent(null); setMessage('บันทึกรหัสผ่านผู้ปกครองแล้ว'); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ')); }}>
              <label>รหัสผ่านใหม่<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              <label>ยืนยันรหัสผ่าน<input name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
              <div className="modal-actions"><button type="button" className="text-button" onClick={() => setPasswordParent(null)}>ยกเลิก</button><button className="primary-button">บันทึก</button></div>
            </form>
          </section>
        </div>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
