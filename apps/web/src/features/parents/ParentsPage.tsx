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
import { EraseAccountButton } from '../auth/EraseAccountButton';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, FieldGroup, Modal, PageHeader, SearchInput,
  Stat, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

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
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [passwordParent, setPasswordParent] = useState<PasswordTarget | null>(null);
  const [managedParents, setManagedParents] = useState<ManagedParent[]>([]);
  const [query, setQuery] = useState('');
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
      .catch(() => { if (!cancelled) toast('โหลดรายชื่อผู้ปกครองไม่สำเร็จ กรุณากดรีเฟรช'); });
    return () => { cancelled = true; };
  }, [canManageAccounts, membership.schoolId, mode, toast]);

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
      toast(`เชื่อมกับ ${nameOfStudent(studentId) || 'นักเรียน'} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? `เชื่อมนักเรียนไม่สำเร็จ (${reason.message})` : 'เชื่อมนักเรียนไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function setConsent(link: ManagedLink, granted: boolean) {
    setBusy(true);
    try {
      await repository.setParentConsent(link.linkId, granted, privacy.policyVersion);
      await refreshParents();
      toast(granted ? 'บันทึกความยินยอมแล้ว' : 'ถอนความยินยอมแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function unlink(link: ManagedLink) {
    setBusy(true);
    try {
      await repository.revokeParentLink(link.linkId);
      await refreshParents();
      toast('ยกเลิกการเชื่อมบัญชีแล้ว');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function activate(parentId: string) {
    try {
      toast(describeActivatedLogin(await activateMemberLogin({
        schoolId: membership.schoolId, role: 'parent', recordId: parentId
      })));
      setManagedParents(await loadManagedParents(membership.schoolId));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ยืนยันไอดีไม่สำเร็จ', { tone: 'error' });
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
      toast(`เพิ่มผู้ปกครอง ${displayName} แล้ว · ใช้ชื่อกับรหัสผ่านเข้าสู่ระบบได้เลย`);
      form.reset();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกผู้ปกครองไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // A guardian has one home, and it is "ลูกของฉัน". This screen used to render its own copy of that
  // one — the same panel, a second set of summary cards — so the menu offered two entries for the
  // same thing and every change had to be made in both.
  if (membership.role === 'parent') return <Navigate to="/my-children" replace />;

  const needle = query.trim().toLocaleLowerCase('th');
  const visibleRows = needle
    ? parentRows.filter((row) => row.parentName.toLocaleLowerCase('th').includes(needle)
      || row.contact.toLocaleLowerCase('th').includes(needle)
      || row.childNames.some((name) => name.toLocaleLowerCase('th').includes(needle)))
    : parentRows;
  const linkedCount = parentRows.filter((row) => row.childNames.length > 0).length;
  const consentedCount = parentRows.filter((row) => row.links.some((link) => link.consented && link.status !== 'revoked')).length;

  return (
    <>
      <PageHeader
        eyebrow="การเชื่อมบัญชีผู้ปกครอง"
        title="ผู้ปกครอง"
        description={canManageAccounts
          ? 'สร้างบัญชี ผูกกับนักเรียน และดูแลความยินยอมได้จากที่เดียว'
          : 'แสดงเฉพาะชื่อผู้ปกครองและนักเรียนที่เชื่อมกับห้องที่คุณสอน'}
      />

      {canManageAccounts && (
        <div className="ui-stat-grid">
          <Stat label="บัญชีผู้ปกครอง" value={parentRows.length} hint="ในโรงเรียนนี้" tone="brand" icon={<Icon name="parents" size={18} />} />
          <Stat label="ผูกกับนักเรียนแล้ว" value={linkedCount} hint={`ยังไม่ผูก ${parentRows.length - linkedCount} คน`} tone={linkedCount === parentRows.length ? 'success' : 'info'} icon={<Icon name="children" size={18} />} />
          <Stat
            label="ให้ความยินยอมแล้ว"
            value={consentedCount}
            hint="เห็นคะแนนและประกาศของบุตรหลานได้"
            tone={consentedCount > 0 ? 'success' : 'warning'}
            icon={<Icon name="check" size={18} />}
          />
        </div>
      )}

      {canManageAccounts && (
        <Card>
          <CardHeader
            title="เพิ่มผู้ปกครอง"
            description="กำหนดชื่อและรหัสผ่านให้เข้าใช้งานได้ทันที · ไม่ต้องใช้อีเมลและไม่ต้องให้ผู้ปกครองสมัครเอง"
          />
          <form onSubmit={(event) => void addParentAccount(event)}>
            <FieldGroup columns={2}>
              <Field label="ผูกกับนักเรียน" hint="เว้นไว้ก็ได้ ผู้ปกครองกด “เพิ่มลูก” เองหลังเข้าสู่ระบบ">
                <select name="studentId" defaultValue="">
                  <option value="">ยังไม่ผูกตอนนี้</option>
                  {snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
                </select>
              </Field>
              <Field label="ชื่อผู้ปกครอง" hint="ชื่อนี้ใช้เข้าสู่ระบบ"><input name="displayName" required minLength={2} /></Field>
              <Field label="ความสัมพันธ์"><input name="relationship" placeholder="มารดา / บิดา / ผู้ปกครอง" required /></Field>
              <Field label="เบอร์ติดต่อ" hint="ไม่บังคับ"><input name="phone" inputMode="tel" /></Field>
              <Field label="รหัสผ่านเริ่มต้น" hint="อย่างน้อย 8 ตัวอักษร · แอดมินเปลี่ยนภายหลังได้">
                <input name="password" type="password" minLength={8} autoComplete="new-password" required />
              </Field>
            </FieldGroup>
            <label className="checkbox-row">
              <input name="grantConsent" type="checkbox" />
              <span>
                <strong>อนุมัติความยินยอมให้เลย</strong>
                <small>ผู้ปกครองจะเห็นประกาศ คะแนน และการเข้าเรียนของนักเรียนที่ผูกไว้ทันที · ถอนภายหลังได้</small>
              </span>
            </label>
            <div className="ui-form-actions">
              <Button variant="primary" loading={busy} icon={<Icon name="plus" size={16} />}>บันทึกผู้ปกครอง</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader
          title="รายชื่อผู้ปกครองทั้งหมด"
          description="ดูได้ทันทีว่าผู้ปกครองแต่ละคนเชื่อมกับนักเรียนคนใดบ้าง"
          action={<Badge tone="neutral">{visibleRows.length} บัญชี</Badge>}
        />
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อผู้ปกครอง เบอร์ หรือชื่อนักเรียน" label="ค้นหาผู้ปกครอง" />
        </Toolbar>

        {visibleRows.length === 0 ? (
          <EmptyState
            icon={<Icon name={parentRows.length === 0 ? 'parents' : 'search'} size={28} />}
            title={parentRows.length === 0 ? 'ยังไม่มีผู้ปกครองในระบบ' : 'ไม่พบผู้ปกครองที่ค้นหา'}
            description={parentRows.length === 0
              ? 'เพิ่มบัญชีผู้ปกครองด้านบน แล้วผูกกับนักเรียนได้ทันที'
              : `ไม่มีชื่อ เบอร์ หรือนักเรียนที่ตรงกับ “${query}”`}
            {...(parentRows.length > 0 ? { action: <Button variant="secondary" onClick={() => setQuery('')}>ล้างการค้นหา</Button> } : {})}
          />
        ) : (
          <ul className="parent-list">
            {visibleRows.map((row) => {
              const activeLinks = row.links.filter((link) => link.status !== 'revoked');
              const usable = row.status === 'active' || row.status === 'linked';
              return (
                <li key={row.key} className="parent-card">
                  <div className="parent-card-top">
                    <div className="parent-card-title">
                      <strong>{row.parentName}</strong>
                      <span>{canManageAccounts
                        ? `${row.contact || 'ไม่ได้ระบุเบอร์ติดต่อ'} · ${activeLinks.length} ความสัมพันธ์`
                        : 'ผู้ปกครองที่เชื่อมกับห้องเรียนของคุณ'}</span>
                    </div>
                    {/* Was hardcoded to the success colour while the text could read "ปิดใช้งาน", so a
                        disabled account was shown in green. */}
                    <Badge tone={canManageAccounts ? (usable ? 'success' : 'neutral') : 'success'}>
                      {canManageAccounts ? (usable ? 'พร้อมใช้งาน' : 'ปิดใช้งาน') : 'เชื่อมแล้ว'}
                    </Badge>
                  </div>

                  <p className="parent-children">
                    <Icon name="children" size={14} />
                    {row.childNames.length > 0 ? row.childNames.join(' · ') : 'ยังไม่ได้เชื่อมนักเรียน'}
                  </p>

                  {canManageAccounts && mode === 'cloud' && (
                    <div className="parent-card-actions">
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void activate(row.key)}>ยืนยันไอดี</Button>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setPasswordParent({ profileId: row.profileId, parentName: row.parentName, studentId: '', relationship: 'ผู้ปกครอง', contact: row.contact })}
                      >
                        {row.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชีเข้าใช้'}
                      </Button>
                      {row.profileId && (
                        <EraseAccountButton
                          schoolId={membership.schoolId} role="parent" profileId={row.profileId}
                          displayName={row.parentName}
                          onDone={(text) => { toast(text); void refreshParents(); }}
                        />
                      )}
                    </div>
                  )}

                  {canManageAccounts && activeLinks.length > 0 && (
                    <ul className="parent-link-list">
                      {activeLinks.map((link) => (
                        <li key={link.linkId}>
                          <span className="parent-link-who">
                            <strong>{nameOfStudent(link.studentId) || 'นักเรียน'}</strong>
                            <small>{link.relationship}</small>
                          </span>
                          <Badge tone={link.consented ? 'success' : 'warning'}>{link.consented ? 'ยินยอมแล้ว' : 'ยังไม่ยินยอม'}</Badge>
                          <span className="parent-link-actions">
                            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void setConsent(link, !link.consented)}>
                              {link.consented ? 'ถอนความยินยอม' : 'บันทึกความยินยอม'}
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void unlink(link)}>ยกเลิกการเชื่อม</Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {canManageAccounts && mode === 'cloud' && (
                    // Attaching a second child used to mean filling in the create-account form again,
                    // password and all, for an account that already had one.
                    <form
                      className="parent-add-child"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void linkChild(row.key, String(data.get('studentId') ?? ''), String(data.get('relationship') ?? ''));
                        event.currentTarget.reset();
                      }}
                    >
                      <select name="studentId" defaultValue="" aria-label={`เพิ่มนักเรียนที่ ${row.parentName} ดูแล`} required>
                        <option value="">เพิ่มนักเรียนที่ดูแล…</option>
                        {snapshot.students
                          .filter((student) => !row.links.some((link) => link.studentId === student.id && link.status !== 'revoked'))
                          .map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
                      </select>
                      <input name="relationship" placeholder="ความสัมพันธ์ เช่น มารดา" aria-label={`ความสัมพันธ์ของ ${row.parentName}`} />
                      <Button variant="secondary" size="sm" disabled={busy} icon={<Icon name="plus" size={14} />}>เชื่อมนักเรียน</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* A guardian who adds a child by name is a claim, and this is where staff answer it. The panel
          existed and was never rendered, so every one of those requests waited for a screen that was
          not in the application. */}
      {mode === 'cloud' && <ParentRequestsPanel schoolId={membership.schoolId} />}

      {/* Was a hand-built backdrop with no focus trap, no Escape and no focus returned. */}
      {passwordParent && canManageAccounts && (
        <Modal
          title={`${passwordParent.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · ${passwordParent.parentName}`}
          onClose={() => setPasswordParent(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const password = String(data.get('password') ?? '');
              const confirm = String(data.get('confirm') ?? '');
              if (password.length < 8 || password !== confirm) {
                toast(password !== confirm ? 'รหัสผ่านไม่ตรงกัน' : 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', { tone: 'error' });
                return;
              }
              const action = passwordParent.profileId
                ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'parent', profileId: passwordParent.profileId, password })
                : provisionManagedAccount({
                  schoolId: membership.schoolId, role: 'parent', recordId: crypto.randomUUID(),
                  ...(passwordParent.studentId ? { studentId: passwordParent.studentId } : {}),
                  displayName: passwordParent.parentName, password,
                  relationship: passwordParent.relationship, phone: passwordParent.contact
                });
              void action
                .then(() => { setPasswordParent(null); toast('บันทึกรหัสผ่านผู้ปกครองแล้ว', { tone: 'success' }); })
                .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ', { tone: 'error' }));
            }}
          >
            <ManagedPasswordFields />
            <div className="ui-page-actions">
              <Button variant="ghost" type="button" onClick={() => setPasswordParent(null)}>ยกเลิก</Button>
              <Button variant="primary" type="submit">บันทึก</Button>
            </div>
          </form>
        </Modal>
      )}

    </>
  );
}
