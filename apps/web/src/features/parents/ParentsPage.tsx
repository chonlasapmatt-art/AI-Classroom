import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { privacyPolicyFrom } from '../../data/selectors';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { ManagedPasswordFields } from '../auth/ManagedPasswordFields';
import { activateMemberLogin, describeActivatedLogin } from '../auth/identityActivation';
import { requireSupabase } from '../../services/supabase';
import { ParentRequestsPanel } from './ParentRequestsPanel';

type PasswordTarget = {
  profileId: string | null;
  parentName: string;
  studentId: string;
  relationship: string;
  contact: string;
};

/** Two guardian names are the same person when only spacing and case separate them. */
function sameName(left: string, right: string): boolean {
  const reduce = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  return reduce(left) === reduce(right) && reduce(left).length > 0;
}

/**
 * One relationship, as the server holds it.
 *
 * The administrator's screen used to read these out of the local projection, which is a copy that
 * arrives when a sync runs. A relationship created seconds ago on this screen is not in it yet, so
 * the row an administrator had just saved came back with no children and no buttons — the work
 * looked lost. The list is read from the server for the same reason it is written there.
 */
type ManagedLink = {
  linkId: string;
  studentId: string;
  relationship: string;
  status: string;
  consented: boolean;
};

type ManagedParent = {
  id: string;
  profileId: string | null;
  parentName: string;
  contact: string;
  status: string;
  links: ManagedLink[];
};

async function loadManagedParents(schoolId: string): Promise<ManagedParent[]> {
  const client = requireSupabase();
  const load = () => Promise.all([
    client.from('parents').select('id,profile_id,display_name,phone,status').eq('school_id', schoolId).order('display_name'),
    client.from('parent_student_links')
      .select('id,parent_id,student_id,relationship,status,consent_id,deleted_at').eq('school_id', schoolId)
  ]);
  let [{ data: parents, error: parentsError }, { data: links, error: linksError }] = await load();
  const expired = [parentsError, linksError].some((error) => (error as { status?: number } | null)?.status === 401);
  if (expired) {
    const { error: refreshError } = await client.auth.refreshSession();
    if (!refreshError) [{ data: parents, error: parentsError }, { data: links, error: linksError }] = await load();
  }
  if (parentsError || linksError) throw parentsError ?? linksError;
  const linksByParent = new Map<string, ManagedLink[]>();
  const linkRows = (links ?? []) as {
    id: string; parent_id: string; student_id: string; relationship: string | null;
    status: string; consent_id: string | null; deleted_at: string | null;
  }[];
  for (const link of linkRows) {
    if (link.deleted_at) continue;
    const rows = linksByParent.get(link.parent_id) ?? [];
    rows.push({
      linkId: link.id, studentId: link.student_id,
      relationship: link.relationship ?? 'ผู้ปกครอง', status: link.status,
      consented: Boolean(link.consent_id)
    });
    linksByParent.set(link.parent_id, rows);
  }
  return ((parents ?? []) as { id: string; profile_id: string | null; display_name: string; phone: string | null; status: string }[])
    .map((parent) => ({
      id: parent.id,
      profileId: parent.profile_id,
      parentName: parent.display_name,
      contact: parent.phone ?? '',
      status: parent.status,
      links: linksByParent.get(parent.id) ?? []
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

  type ParentRow = {
    key: string; parentName: string; profileId: string | null; contact: string;
    childNames: string[]; links: ManagedLink[]; status: string;
  };

  const nameOfStudent = useCallback(
    (studentId: string) => snapshot.students.find((student) => student.id === studentId)?.displayName ?? '',
    [snapshot.students]
  );

  const parentRows = useMemo<ParentRow[]>(() => {
    if (mode === 'cloud' && canManageAccounts) {
      return managedParents.map((parent) => ({
        key: parent.id,
        parentName: parent.parentName,
        profileId: parent.profileId,
        contact: parent.contact,
        childNames: parent.links
          .filter((link) => link.status !== 'revoked')
          .map((link) => nameOfStudent(link.studentId))
          .filter((name) => Boolean(name)),
        links: parent.links,
        status: parent.status
      }));
    }
    const grouped = new Map<string, ParentRow>();
    for (const link of snapshot.parentLinks) {
      const key = link.profileId ?? `${link.parentName}|${link.contact}`;
      const row = grouped.get(key) ?? { key, parentName: link.parentName, profileId: link.profileId, contact: link.contact, childNames: [], links: [], status: link.status };
      const name = nameOfStudent(link.studentId);
      if (name && !row.childNames.includes(name)) row.childNames.push(name);
      row.links.push({
        linkId: link.id, studentId: link.studentId, relationship: link.relationship,
        status: link.status, consented: Boolean(link.consentGrantedAt)
      });
      if (link.status === 'linked') row.status = 'linked';
      grouped.set(key, row);
    }
    return Array.from(grouped.values());
  }, [canManageAccounts, managedParents, mode, nameOfStudent, snapshot.parentLinks]);

  const refreshParents = useCallback(async () => {
    if (mode !== 'cloud' || !canManageAccounts) return;
    setManagedParents(await loadManagedParents(membership.schoolId));
  }, [canManageAccounts, membership.schoolId, mode]);

  /**
   * Attaches one more child to a guardian who already exists.
   *
   * The create-account form is the only other way to make this relationship, and it asks for a
   * password — so a sibling meant re-entering credentials for an account that already had them.
   */
  async function linkChild(parentId: string, studentId: string, relationship: string) {
    if (!studentId) return;
    setBusy(true);
    try {
      const { error } = await requireSupabase().rpc('admin_link_parent_child', {
        p_school_id: membership.schoolId, p_parent_id: parentId, p_student_id: studentId,
        p_relationship: relationship.trim() || 'ผู้ปกครอง'
      });
      if (error) throw new Error(error.message);
      await refreshParents();
      setMessage(`เชื่อมกับ ${nameOfStudent(studentId) || 'นักเรียน'} แล้ว`);
    } catch (reason) {
      setMessage(reason instanceof Error ? `เชื่อมนักเรียนไม่สำเร็จ (${reason.message})` : 'เชื่อมนักเรียนไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function setConsent(link: ManagedLink, granted: boolean) {
    setBusy(true);
    try {
      await repository.setParentConsent(link.linkId, granted, privacy.policyVersion);
      await refreshParents();
      setMessage(granted ? 'บันทึกความยินยอมแล้ว' : 'ถอนความยินยอมแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function unlink(link: ManagedLink) {
    setBusy(true);
    try {
      await repository.revokeParentLink(link.linkId);
      await refreshParents();
      setMessage('ยกเลิกการเชื่อมบัญชีแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function activate(parentId: string) {
    try {
      setMessage(describeActivatedLogin(await activateMemberLogin({
        schoolId: membership.schoolId, role: 'parent', recordId: parentId
      })));
      setManagedParents(await loadManagedParents(membership.schoolId));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ยืนยันไอดีไม่สำเร็จ');
    }
  }

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
        // Minting a fresh id on every save is what produced five guardians with one name inside
        // forty seconds: a second attempt on a form that looked like it had failed created a second
        // person rather than correcting the first. A name already on the roster means this is that
        // guardian, so the existing record is the one that gets updated.
        const existing = managedParents.find((parent) => sameName(parent.parentName, displayName));
        const provisioned = await provisionManagedAccount({ schoolId: membership.schoolId, role: 'parent', recordId: existing?.id ?? crypto.randomUUID(), ...(studentId ? { studentId } : {}), displayName, password, relationship: String(data.get('relationship') ?? '').trim(), phone: String(data.get('phone') ?? '').trim() });
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

  // A guardian has one home, and it is "ลูกของฉัน". This screen used to render its own copy of that
  // one — the same panel, a second set of summary cards — so the menu offered two entries for the
  // same thing and every change had to be made in both.
  if (membership.role === 'parent') return <Navigate to="/my-children" replace />;

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
                {canManageAccounts && mode === 'cloud' && (
                  <div className="record-actions">
                    <button className="secondary-button" disabled={busy} onClick={() => void activate(row.key)}>ยืนยันไอดี</button>
                    <button className="text-button" onClick={() => setPasswordParent({ profileId: row.profileId, parentName: row.parentName, studentId: '', relationship: 'ผู้ปกครอง', contact: row.contact })}>
                      {row.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชีเข้าใช้'}
                    </button>
                  </div>
                )}
                {row.links.map((link) => canManageAccounts && link.status !== 'revoked' && (
                  <div className="record-actions" key={link.linkId}>
                    <span className="hint">
                      {nameOfStudent(link.studentId) || 'นักเรียน'} · {link.relationship} · {link.consented ? 'ยินยอมแล้ว' : 'ยังไม่ยินยอม'}
                    </span>
                    <button className="secondary-button" disabled={busy} onClick={() => void setConsent(link, !link.consented)}>
                      {link.consented ? 'ถอนความยินยอม' : 'บันทึกความยินยอม'}
                    </button>
                    <button className="text-button" disabled={busy} onClick={() => void unlink(link)}>ยกเลิกการเชื่อม</button>
                  </div>
                ))}
                {canManageAccounts && mode === 'cloud' && (
                  // Attaching a second child used to mean filling in the create-account form again,
                  // password and all, for an account that already had one.
                  <form
                    className="record-actions"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void linkChild(row.key, String(data.get('studentId') ?? ''), String(data.get('relationship') ?? ''));
                      event.currentTarget.reset();
                    }}
                  >
                    <select name="studentId" defaultValue="" aria-label={`เชื่อมนักเรียนกับ ${row.parentName}`} required>
                      <option value="">เพิ่มนักเรียนที่ดูแล...</option>
                      {snapshot.students
                        .filter((student) => !row.links.some((link) => link.studentId === student.id && link.status !== 'revoked'))
                        .map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
                    </select>
                    <input name="relationship" placeholder="ความสัมพันธ์ เช่น มารดา" aria-label="ความสัมพันธ์" />
                    <button className="secondary-button" disabled={busy}>เชื่อมนักเรียน</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* A guardian who adds a child by name is a claim, and this is where staff answer it. The panel
          existed and was never rendered, so every one of those requests waited for a screen that was
          not in the application. */}
      {mode === 'cloud' && <ParentRequestsPanel schoolId={membership.schoolId} />}

      {passwordParent && canManageAccounts && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ตั้งรหัสผ่านผู้ปกครอง">
          <section className="modal-card">
            <div className="panel-heading"><h2>{passwordParent.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · {passwordParent.parentName}</h2><button type="button" className="icon-button" onClick={() => setPasswordParent(null)} aria-label="ปิด">×</button></div>
            <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get('password') ?? ''); const confirm = String(data.get('confirm') ?? ''); if (password.length < 8 || password !== confirm) { setMessage(password !== confirm ? 'รหัสผ่านไม่ตรงกัน' : 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; } const action = passwordParent.profileId ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'parent', profileId: passwordParent.profileId, password }) : provisionManagedAccount({ schoolId: membership.schoolId, role: 'parent', recordId: crypto.randomUUID(), ...(passwordParent.studentId ? { studentId: passwordParent.studentId } : {}), displayName: passwordParent.parentName, password, relationship: passwordParent.relationship, phone: passwordParent.contact }); void action.then(() => { setPasswordParent(null); setMessage('บันทึกรหัสผ่านผู้ปกครองแล้ว'); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ')); }}>
              <ManagedPasswordFields />
              <div className="modal-actions"><button type="button" className="text-button" onClick={() => setPasswordParent(null)}>ยกเลิก</button><button className="primary-button">บันทึก</button></div>
            </form>
          </section>
        </div>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
