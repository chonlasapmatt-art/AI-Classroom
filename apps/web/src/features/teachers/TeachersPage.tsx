import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import type { TeacherVerificationStatus } from '../../domain/types';
import { responsibilityLabels, responsibilityOf, type TeacherResponsibility } from '../../data/teacherResponsibilities';
import { useSyncStatus } from '../../sync/SyncStatusContext';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { EraseAccountButton } from '../auth/EraseAccountButton';
import { ManagedPasswordFields } from '../auth/ManagedPasswordFields';
import { activateMemberLogin, describeActivatedLogin } from '../auth/identityActivation';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, FieldGroup, Modal, PageHeader, PromptDialog
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { RosterFileButton } from '../imports/RosterFileButton';
import { subjectIconForName } from '../../data/subjectIconMatch';
import { SubjectIcon } from '../subjects/SubjectIcon';

const verificationLabels: Record<TeacherVerificationStatus, string> = {
  teacher_requested: 'ขอสิทธิ์ครู', verification_pending: 'รอตรวจสอบ',
  verified_teacher: 'ยืนยันแล้ว', revoked: 'ถูกเพิกถอน'
};
const verificationTone: Record<TeacherVerificationStatus, 'warning' | 'success' | 'danger'> = {
  teacher_requested: 'warning', verification_pending: 'warning', verified_teacher: 'success', revoked: 'danger'
};

const responsibilityOptions: Array<{ value: TeacherResponsibility; label: string; needsSubject: boolean }> = [
  { value: 'CLASS_ADVISOR', label: responsibilityLabels.CLASS_ADVISOR, needsSubject: false },
  { value: 'ASSISTANT_ADVISOR', label: responsibilityLabels.ASSISTANT_ADVISOR, needsSubject: false },
  { value: 'SUBJECT_OWNER', label: responsibilityLabels.SUBJECT_OWNER, needsSubject: true },
  { value: 'SUBJECT_CO_TEACHER', label: responsibilityLabels.SUBJECT_CO_TEACHER, needsSubject: true }
];

export function TeachersPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const sync = useSyncStatus();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const [passwordTeacher, setPasswordTeacher] = useState<typeof snapshot.teachers[number] | null>(null);
  const [verifying, setVerifying] = useState<{ id: string; name: string } | null>(null);
  /*
   * One teacher, one room, as many subjects as they teach in it.
   *
   * The staff list has always been able to hold this -- a teacher's responsibilities are one row per
   * class and subject, and the server refuses only a second advisor or a second owner of the same
   * subject. The form could not express it: one subject select, one save, and no sight of what was
   * already there, so giving somebody three subjects meant three passes and remembering which had
   * gone through. It is a set now, and one press writes all of them.
   */
  const [assignment, setAssignment] = useState<{ teacherId: string; classId: string; responsibility: TeacherResponsibility; subjectIds: string[] }>({
    teacherId: '', classId: '', responsibility: 'CLASS_ADVISOR', subjectIds: []
  });
  const [assigning, setAssigning] = useState(false);

  const canEdit = membership.role === 'admin' && repository.canManageStructure;

  const needsSubject = responsibilityOptions.find((option) => option.value === assignment.responsibility)?.needsSubject ?? false;
  const activeSubjects = snapshot.subjects.filter((subject) => subject.status === 'active');
  // What the chosen teacher already holds in the chosen room, and which of that room’s subjects are
  // already spoken for by anybody -- the second is why a tick can be refused.
  const currentLinks = snapshot.classTeachers.filter((linkRow) =>
    linkRow.teacherId === assignment.teacherId && linkRow.classId === assignment.classId && linkRow.deletedAt === null);
  const heldSubjectIds = new Set(snapshot.classTeachers
    .filter((linkRow) => linkRow.classId === assignment.classId && linkRow.deletedAt === null && linkRow.role === 'primary' && linkRow.subjectId)
    .map((linkRow) => linkRow.subjectId as string));

  async function createTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const teacherId = crypto.randomUUID();
      const displayName = String(data.get('name') ?? '').trim();
      const password = String(data.get('password') ?? '');
      if (password.length < 8) throw new Error('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      const subject = String(data.get('subject') ?? '').trim();
      if (subject) {
        const subjectExists = snapshot.subjects.some((item) => item.status === 'active' && item.name.trim().toLowerCase() === subject.toLowerCase());
        if (!subjectExists) {
          await repository.saveSubject({
            id: crypto.randomUUID(),
            code: `CUSTOM-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`,
            name: subject,
            colorIndex: snapshot.subjects.length % 6,
            // This form has no icon picker, and every subject a school actually adds comes through
            // it — which is how six of nine subjects ended up drawn as the same grey label. The name
            // chooses a starting icon; the subject screen can still change it.
            iconKey: subjectIconForName(subject),
            sortOrder: snapshot.subjects.length
          });
        }
      }
      await repository.saveTeacher({
        id: teacherId,
        teacherCode: String(data.get('code') ?? '').trim(),
        displayName,
        email: '',
        subject
      });
      if (mode === 'cloud') {
        // Same ordering the roster needs: the staff row is queued locally, and the account binds to
        // it by id on the server, so the queue has to reach the server before the account is asked
        // for. Without this the provision races the sync debounce and loses on a slow connection.
        await sync?.syncNow();
        await provisionManagedAccount({ schoolId: membership.schoolId, role: 'teacher', recordId: teacherId, displayName, password });
      }
      toast(`เพิ่มครู ${displayName} แล้ว · ใช้ชื่อกับรหัสผ่านเข้าสู่ระบบได้เลย`);
      form.reset();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function activate(teacherId: string) {
    try {
      toast(describeActivatedLogin(await activateMemberLogin({
        schoolId: membership.schoolId, role: 'teacher', recordId: teacherId
      })));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ยืนยันไอดีไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function verify(teacherId: string, displayName: string, reason: string) {
    setVerifying(null);
    try {
      await repository.verifyTeacher(teacherId, reason);
      toast(`ยืนยันสถานะครูของ ${displayName} แล้ว`);
    } catch (reason2) {
      toast(reason2 instanceof Error ? reason2.message : 'ยืนยันสถานะไม่สำเร็จ');
    }
  }

  /**
   * Writes one responsibility per chosen subject, and says what happened to each.
   *
   * One subject being refused -- the room already has an owner for it -- is not a reason to drop the
   * other two, so each is attempted on its own and the failures are counted rather than thrown. A
   * silent partial success is the thing this is here to prevent: an administrator who ticks three
   * boxes has to be told that two of them landed.
   */
  async function assign() {
    if (!assignment.teacherId || !assignment.classId || assigning) return;
    const subjectRequired = assignment.responsibility === 'SUBJECT_OWNER' || assignment.responsibility === 'SUBJECT_CO_TEACHER';
    if (subjectRequired && assignment.subjectIds.length === 0) {
      toast('กรุณาเลือกอย่างน้อยหนึ่งวิชาสำหรับหน้าที่นี้', { tone: 'error' });
      return;
    }
    const role = assignment.responsibility === 'ASSISTANT_ADVISOR' || assignment.responsibility === 'SUBJECT_CO_TEACHER' ? 'assistant' : 'primary';
    const targets: Array<string | null> = subjectRequired ? assignment.subjectIds : [null];
    setAssigning(true);
    const done: string[] = [];
    const failed: string[] = [];
    for (const subjectId of targets) {
      const label = subjectId
        ? snapshot.subjects.find((item) => item.id === subjectId)?.name ?? 'วิชา'
        : responsibilityLabels[assignment.responsibility];
      try {
        await repository.assignTeacher(assignment.classId, assignment.teacherId, role, subjectId);
        done.push(label);
      } catch {
        failed.push(label);
      }
    }
    setAssigning(false);
    if (done.length > 0) setAssignment((current) => ({ ...current, subjectIds: [] }));
    if (failed.length === 0) {
      toast(`กำหนด${responsibilityLabels[assignment.responsibility]}แล้ว: ${done.join(', ')}`);
    } else if (done.length === 0) {
      toast(`กำหนดไม่สำเร็จ: ${failed.join(', ')} · วิชาที่มีครูเจ้าของอยู่แล้วต้องยกเลิกคนเดิมก่อน`, { tone: 'error' });
    } else {
      toast(`กำหนดแล้ว ${done.join(', ')} · ข้าม ${failed.join(', ')} เพราะมีผู้รับผิดชอบอยู่แล้ว`, { tone: 'error' });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="บุคลากร"
        title="ครู"
        description={`${snapshot.teachers.length} คน · ${snapshot.classTeachers.length} การมอบหมายห้องเรียน`}
      />

      {canEdit && (
        <Card as="section">
          <form onSubmit={(event) => void createTeacher(event)}>
            <CardHeader
              title="เพิ่มครู"
              description="ครูเข้าสู่ระบบด้วยชื่อและรหัสครู · รหัสผ่านที่ตั้งไว้ใช้กับบัญชีของครูคนนั้นโดยตรง"
              action={(
                /*
                  A whole staff list at once, next to the form for one.
                  This used to live on a screen of its own, which meant leaving the teachers page to
                  add teachers. A file added here creates the records; the accounts are opened per
                  person afterwards, as they already were, because a password is not something a
                  spreadsheet should be carrying.
                */
                <RosterFileButton
                  target="teacher"
                  onSave={async (rows) => {
                    let saved = 0;
                    for (const row of rows) {
                      await repository.saveTeacher({
                        teacherCode: (row.teacherCode ?? '').trim(),
                        displayName: (row.displayName ?? '').trim(),
                        email: (row.email ?? '').trim(),
                        subject: (row.subject ?? '').trim()
                      });
                      saved += 1;
                    }
                    return { saved, skipped: 0 };
                  }}
                />
              )}
            />
            <FieldGroup>
              <Field label="รหัสครู" hint="ใช้เป็นรหัสประจำตัวครู ไม่ใช่รหัสผ่าน">
                <input name="code" required placeholder="เช่น SC-003" />
              </Field>
              <Field label="ชื่อ-สกุล"><input name="name" required /></Field>
              <Field label="รหัสผ่านเริ่มต้น" hint="อย่างน้อย 8 ตัวอักษร · แอดมินเปลี่ยนภายหลังได้">
                <input name="password" type="password" minLength={8} autoComplete="new-password" required />
              </Field>
              <Field
                label="รายวิชาที่รับผิดชอบ"
                hint="เว้นว่างได้ แล้วค่อยมอบหมายภายหลัง · พิมพ์ชื่อวิชาใหม่ของโรงเรียนได้เช่นกัน"
              >
                <>
                  <input name="subject" list="teacher-subject-options" placeholder="เลือกจากรายการ หรือพิมพ์วิชาใหม่ เช่น Coding" />
                  <datalist id="teacher-subject-options">
                    {snapshot.subjects.map((subject) => <option key={subject.id} value={subject.name} />)}
                  </datalist>
                </>
              </Field>
            </FieldGroup>
            <div className="ui-page-actions"><Button variant="primary" type="submit">บันทึก</Button></div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader title={`รายชื่อครู ${snapshot.teachers.length} คน`} />
        {snapshot.teachers.length === 0 && (
          <EmptyState
            icon={<Icon name="teachers" size={28} />}
            title="ยังไม่มีครูในโรงเรียนนี้"
            description={canEdit ? 'เพิ่มครูจากแบบฟอร์มด้านบน แล้วมอบหมายห้องเรียนให้' : 'เมื่อแอดมินเพิ่มครูแล้ว รายชื่อจะแสดงที่นี่'}
          />
        )}
        <ul className="record-list">
          {snapshot.teachers.map((teacher) => {
            const links = snapshot.classTeachers.filter((item) => item.teacherId === teacher.id);
            return (
              <li key={teacher.id}>
                <div className="record-main">
                  <div>
                    <strong>{teacher.displayName}</strong>
                    <span>{teacher.teacherCode} · {teacher.subject || 'ยังไม่ได้ระบุรายวิชา'}</span>
                  </div>
                  <Badge tone={verificationTone[teacher.verificationStatus]}>
                    {verificationLabels[teacher.verificationStatus]}
                  </Badge>
                  <Badge tone={links.length > 0 ? 'success' : 'neutral'}>{links.length} ห้อง</Badge>
                </div>
                {membership.role === 'admin' && teacher.verificationStatus !== 'verified_teacher' && (
                  <div className="record-actions">
                    <Button variant="secondary" size="sm" onClick={() => setVerifying({ id: teacher.id, name: teacher.displayName })}>
                      ยืนยันสถานะครู
                    </Button>
                    <span className="ui-field-hint">ครูที่ยังไม่ยืนยันจะยังใช้งานข้อมูลห้องเรียนไม่ได้</span>
                  </div>
                )}
                {membership.role === 'admin' && teacher.verificationStatus === 'verified_teacher' && canEdit && (
                  <div className="record-actions">
                    {/* A teacher signs in with their name and code, and the gateway creates the Auth
                        identity on first use — so there is nothing to report about "having" an
                        account. What matters is whether the row is in a state the sign-in accepts,
                        and this makes it so in one click. */}
                    <Button variant="secondary" size="sm" onClick={() => void activate(teacher.id)}>ยืนยันไอดี</Button>
                    <Button variant="ghost" size="sm" onClick={() => setPasswordTeacher(teacher)}>
                      {teacher.profileId ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
                    </Button>
                    {teacher.profileId && (
                      <EraseAccountButton
                        schoolId={membership.schoolId} role="teacher" profileId={teacher.profileId}
                        displayName={teacher.displayName} onDone={toast}
                      />
                    )}
                  </div>
                )}
                {links.length > 0 && (
                  <div className="record-actions">
                    {links.map((link) => {
                      const classroom = snapshot.classes.find((item) => item.id === link.classId);
                      return (
                        <span key={link.id} className="teacher-assignment">
                          <Badge tone="neutral">
                            {classroom?.name ?? 'ห้องที่ถูกลบ'} · {link.subjectId
                              ? (snapshot.subjects.find((subject) => subject.id === link.subjectId)?.name ?? 'วิชาที่ถูกลบ') + ' · '
                              : ''}{responsibilityLabels[responsibilityOf(link)]}
                          </Badge>
                          {canEdit && (
                            <Button variant="ghost" size="sm" onClick={() => void repository.unassignTeacher(link.id)}>ยกเลิก</Button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {canEdit && (
        <Card as="section">
          <CardHeader
            title="มอบหมายครูเข้าห้องเรียน"
            description="หน้าที่เป็นสิ่งที่ตัดสินว่าครูคนนี้แก้ไขอะไรได้บ้าง ไม่ใช่แค่ชื่อที่แสดง"
          />
          <FieldGroup>
            <Field label="ครู">
              <select value={assignment.teacherId} onChange={(event) => setAssignment({ ...assignment, teacherId: event.target.value })}>
                <option value="">เลือกครู</option>
                {snapshot.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
              </select>
            </Field>
            <Field label="ห้องเรียน">
              <select value={assignment.classId} onChange={(event) => setAssignment({ ...assignment, classId: event.target.value })}>
                <option value="">เลือกห้อง</option>
                {snapshot.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="หน้าที่">
              <select value={assignment.responsibility} onChange={(event) => setAssignment({
                ...assignment, responsibility: event.target.value as TeacherResponsibility,
                subjectIds: (event.target.value === 'SUBJECT_OWNER' || event.target.value === 'SUBJECT_CO_TEACHER') ? assignment.subjectIds : []
              })}>
                {responsibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          </FieldGroup>

          {/* Checkboxes rather than a select, because the answer is "these three" as often as it is
              "this one", and a select can only ever say one. Each chip is a 44px target and says
              whether it is on with a tick as well as with its colour. */}
          {needsSubject && (
            <div className="subject-choice-field">
              <span className="ui-field-label" id="teacher-subject-legend">วิชาที่รับผิดชอบ</span>
              <p className="ui-field-hint">
                เลือกได้หลายวิชา · ครูเจ้าของวิชามีได้หนึ่งคนต่อหนึ่งวิชาในห้องหนึ่ง วิชาที่มีเจ้าของแล้วจะถูกข้าม
              </p>
              <div className="subject-choice" role="group" aria-labelledby="teacher-subject-legend">
                {activeSubjects.map((subject) => {
                  const chosen = assignment.subjectIds.includes(subject.id);
                  const held = heldSubjectIds.has(subject.id);
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      role="checkbox"
                      aria-checked={chosen}
                      title={held ? subject.name + " · มีครูเจ้าของอยู่แล้ว" : subject.name}
                      className={`subject-choice-chip${chosen ? " is-chosen" : ""}${held ? " is-held" : ""}`}
                      onClick={() => setAssignment((current) => ({
                        ...current,
                        subjectIds: current.subjectIds.includes(subject.id)
                          ? current.subjectIds.filter((id) => id !== subject.id)
                          : [...current.subjectIds, subject.id]
                      }))}
                    >
                      <SubjectIcon iconKey={subject.iconKey} size={17} />
                      <span>{subject.name}</span>
                      {chosen && <Icon name="check" size={14} />}
                    </button>
                  );
                })}
              </div>
              {activeSubjects.length === 0 && (
                <p className="ui-field-hint">ยังไม่มีรายวิชาในโรงเรียนนี้ · เพิ่มที่เมนู “รายวิชา” ก่อน</p>
              )}
            </div>
          )}

          {/* What this teacher already holds in the chosen room, so an administrator adds to a list
              they can see rather than to one they have to remember. */}
          {assignment.teacherId && assignment.classId && (
            <div className="subject-choice-field">
              <span className="ui-field-label">หน้าที่ปัจจุบันในห้องนี้</span>
              {currentLinks.length === 0 ? (
                <p className="ui-field-hint">ยังไม่ได้รับหน้าที่ใดในห้องนี้</p>
              ) : (
                <div className="record-actions">
                  {currentLinks.map((linkRow) => (
                    <span key={linkRow.id} className="teacher-assignment">
                      <Badge tone="neutral">
                        {linkRow.subjectId
                          ? (snapshot.subjects.find((item) => item.id === linkRow.subjectId)?.name ?? "วิชาที่ถูกลบ") + " · "
                          : ""}{responsibilityLabels[responsibilityOf(linkRow)]}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => void repository.unassignTeacher(linkRow.id)}>ยกเลิก</Button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="ui-page-actions">
            <Button variant="secondary" loading={assigning} onClick={() => void assign()}>
              {needsSubject && assignment.subjectIds.length > 1
                ? `บันทึก ${assignment.subjectIds.length} วิชา`
                : "บันทึกการมอบหมาย"}
            </Button>
          </div>
        </Card>
      )}

      {/* Was a hand-built backdrop with no focus trap, no Escape and no focus returned. */}
      {passwordTeacher && canEdit && (
        <Modal
          title={`${passwordTeacher.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · ${passwordTeacher.displayName}`}
          onClose={() => setPasswordTeacher(null)}
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
              void (passwordTeacher.profileId
                ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'teacher', profileId: passwordTeacher.profileId, password })
                : provisionManagedAccount({ schoolId: membership.schoolId, role: 'teacher', recordId: passwordTeacher.id, displayName: passwordTeacher.displayName, password }))
                .then(() => { setPasswordTeacher(null); toast('บันทึกรหัสผ่านครูแล้ว', { tone: 'success' }); })
                .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ', { tone: 'error' }));
            }}
          >
            <ManagedPasswordFields />
            <div className="ui-page-actions">
              <Button variant="ghost" type="button" onClick={() => setPasswordTeacher(null)}>ยกเลิก</Button>
              <Button variant="primary" type="submit">บันทึก</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* The reason is written into the audit record, so it is asked for in the product rather than
          in a browser box that could not show the minimum length it was demanding. */}
      {verifying && (
        <PromptDialog
          title={`ยืนยันสถานะครูของ ${verifying.name}`}
          description="เหตุผลนี้จะถูกบันทึกไว้ในประวัติการตรวจสอบ และผู้ดูแลคนอื่นอ่านได้ภายหลัง"
          label="เหตุผลในการยืนยัน"
          hint="อย่างน้อย 4 ตัวอักษร"
          defaultValue="ตรวจสอบเอกสารประจำตัวแล้ว"
          minLength={4}
          confirmLabel="ยืนยันสถานะครู"
          onCancel={() => setVerifying(null)}
          onConfirm={(reason) => void verify(verifying.id, verifying.name, reason)}
        />
      )}
    </>
  );
}
