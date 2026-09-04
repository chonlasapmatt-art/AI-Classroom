import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, classIdOfStudent, rosterFor } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { AvatarStudio } from '../avatars/AvatarStudio';
import type { Student } from '../../domain/types';
import { previewStudentCsv } from './csvImport';
import { requireSupabase } from '../../services/supabase';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { EraseAccountButton } from '../auth/EraseAccountButton';
import { ManagedPasswordFields } from '../auth/ManagedPasswordFields';
import { activateMemberLogin, describeActivatedLogin } from '../auth/identityActivation';
import {
  AutoTextarea, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, FieldGroup,
  Modal, PageHeader, SearchInput, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

export function StudentsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useState('');
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [query, setQuery] = useState('');
  const { toast } = useToast();
  const [studioStudent, setStudioStudent] = useState<Student | null>(null);
  const [renaming, setRenaming] = useState<Student | null>(null);
  const [passwordStudent, setPasswordStudent] = useState<Student | null>(null);
  const [removing, setRemoving] = useState<Student | null>(null);

  const selectedClassId = classId || classes[0]?.id || '';
  const canEdit = membership.role === 'admin';
  const isStudentView = membership.role === 'student';
  const roster = useMemo(
    () => (selectedClassId ? rosterFor(snapshot, selectedClassId) : snapshot.students),
    [snapshot, selectedClassId]
  );
  // Forty names is more than a screen holds, and finding one of them was a scroll.
  const students = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((student) => `${student.displayName} ${student.studentCode}`.toLowerCase().includes(needle));
  }, [roster, query]);
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];

  /**
   * Students sign in with the name and student number already on this card, so there is nothing to
   * hand out — the only lever a teacher needs is the ability to close that door again when a record
   * is disputed or a device is lost. Turning access off also releases the account binding, which
   * ends any session already open against the record.
   */
  /**
   * Puts one student's record into every state the sign-in checks, and says what to type.
   *
   * "เปิดการเข้าใช้งาน" only flipped one switch; a record that was archived, soft-deleted or never
   * marked active stayed unreachable and the screen said nothing about which. This sets all of them.
   */
  async function activate(studentId: string) {
    try {
      toast(describeActivatedLogin(await activateMemberLogin({
        schoolId: membership.schoolId, role: 'student', recordId: studentId
      })));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ยืนยันไอดีไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function setAccess(student: Student, enabled: boolean) {
    try {
      const { error } = await requireSupabase().rpc('set_student_access', {
        p_student_id: student.id, p_enabled: enabled
      });
      if (error) throw error;
      toast(enabled
        ? `เปิดการเข้าใช้งานของ ${student.displayName} แล้ว`
        : `ปิดการเข้าใช้งานของ ${student.displayName} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ปรับสิทธิ์เข้าใช้งานไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const studentCode = String(data.get('code') ?? '').trim();
    const password = String(data.get('password') ?? '');
    // The student later signs in by typing this name back, so it is stored exactly as the two
    // fields the teacher filled in, with the whitespace between them normalised.
    const displayName = `${String(data.get('firstName') ?? '').trim()} ${String(data.get('lastName') ?? '').trim()}`
      .replace(/\s+/g, ' ').trim();
    if (!studentCode || !displayName) return;
    if (password.length < 8) { toast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    if (snapshot.students.some((item) => item.studentCode === studentCode)) {
      toast('รหัสนักเรียนนี้มีอยู่แล้ว');
      return;
    }
    try {
      const id = crypto.randomUUID();
      await repository.saveStudent({ id, studentCode, displayName, avatarIndex: snapshot.students.length * 7 });
      if (selectedClassId && term) await repository.enrollStudent(id, selectedClassId, term.id);
      if (mode === 'cloud') await provisionManagedAccount({ schoolId: membership.schoolId, role: 'student', recordId: id, displayName, password });
      form.reset();
      setOpen(false);
      toast(`เพิ่ม ${displayName} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function importCsv() {
    const existing = new Set(snapshot.students.map((item) => item.studentCode));
    const preview = previewStudentCsv(csv, existing);
    if (preview.errors.length > 0) toast(`ข้าม ${preview.errors.length} แถว: ${preview.errors[0]!.message}`);
    for (const row of preview.rows) {
      const id = crypto.randomUUID();
      await repository.saveStudent({ id, studentCode: row.studentCode, displayName: row.displayName, avatarIndex: row.rowNumber * 5 });
      if (selectedClassId && term) await repository.enrollStudent(id, selectedClassId, term.id);
    }
    if (preview.rows.length > 0) toast(`นำเข้า ${preview.rows.length} คนแล้ว`);
    setCsv('');
  }

  return (
    <>
      <PageHeader
        eyebrow="ข้อมูลตามสิทธิ์"
        title={isStudentView ? 'เพื่อนร่วมชั้น' : 'นักเรียน'}
        description={isStudentView
          ? `${roster.length} คนในห้องเรียนของคุณ`
          : `${roster.length} คนในขอบเขตที่คุณเข้าถึงได้`}
        action={canEdit && (
          <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setOpen((value) => !value)}>
            เพิ่มนักเรียน
          </Button>
        )}
      />

      <Toolbar>
        <label>
          ห้องเรียน
          <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรือเลขประจำตัว" />
      </Toolbar>

      {open && canEdit && (
        <Card as="section">
          <CardHeader
            title="เพิ่มนักเรียนใหม่"
            description="แอดมินกำหนดชื่อและรหัสผ่านให้ นักเรียนจึงเข้าใช้งานได้ทันทีจากหน้าเข้าสู่ระบบ"
          />
          <form onSubmit={(event) => void addStudent(event)}>
            <FieldGroup>
              <Field label="ชื่อจริง"><input name="firstName" required /></Field>
              <Field label="นามสกุล"><input name="lastName" required /></Field>
              <Field label="เลขประจำตัวนักเรียน" hint="นักเรียนใช้เลขนี้เข้าสู่ระบบคู่กับชื่อ">
                <input name="code" required />
              </Field>
              <Field label="รหัสผ่านเริ่มต้น" hint="อย่างน้อย 8 ตัวอักษร · แอดมินเปลี่ยนภายหลังได้">
                <input name="password" type="password" minLength={8} autoComplete="new-password" required />
              </Field>
            </FieldGroup>
            <div className="ui-page-actions"><Button variant="primary" type="submit">บันทึก</Button></div>
          </form>

          <CardHeader
            title="นำเข้าจาก CSV"
            description="วางข้อมูลที่มีหัวตาราง student_code,display_name · แถวที่ซ้ำหรือผิดรูปแบบจะถูกข้ามและรายงานให้"
          />
          <Field label="ข้อมูลที่จะนำเข้า">
            <AutoTextarea value={csv} onChange={setCsv} minRows={4} maxRows={12} />
          </Field>
          <div className="ui-page-actions">
            <Button variant="secondary" onClick={() => void importCsv()} disabled={!csv.trim()}>ตรวจและนำเข้า</Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`รายชื่อ ${students.length} คน`}
          {...(query.trim() ? { description: `กรองจากทั้งหมด ${roster.length} คน` } : {})}
        />
        {roster.length === 0 ? (
          <EmptyState
            icon={<Icon name="students" size={28} />}
            title="ยังไม่มีนักเรียนในห้องนี้"
            description={canEdit ? 'เพิ่มรายชื่อทีละคน หรือนำเข้าจากไฟล์ CSV' : 'เมื่อแอดมินเพิ่มรายชื่อแล้ว จะแสดงที่นี่'}
            {...(canEdit ? { action: <Button variant="primary" onClick={() => setOpen(true)}>เพิ่มนักเรียน</Button> } : {})}
          />
        ) : students.length === 0 ? (
          <EmptyState
            icon={<Icon name="search" size={28} />}
            title="ไม่พบนักเรียนที่ตรงกับคำค้น"
            description={`ไม่มีชื่อหรือเลขประจำตัวที่มีคำว่า "${query.trim()}"`}
            action={<Button variant="secondary" onClick={() => setQuery('')}>ล้างคำค้น</Button>}
          />
        ) : (
          <div className="student-grid">
            {students.map((student) => (
              <article key={student.id} className="student-card">
                <ProfileAvatar
                  displayName={student.displayName} avatarId={student.avatarId}
                  avatarIndex={student.avatarIndex} avatarConfig={student.avatarConfig} size={56}
                />
                <div>
                  <strong>{student.displayName}</strong>
                  <span>
                    {student.studentCode} · {classes.find((item) => item.id === classIdOfStudent(snapshot, student.id))?.name ?? 'ยังไม่มีห้อง'}
                  </span>
                  <div className="record-actions">
                    {student.profileId && <Badge tone="success">เคยเข้าใช้งานแล้ว</Badge>}
                    {!isStudentView && (
                      <Button variant="ghost" size="sm" onClick={() => setStudioStudent(student)}>ปรับแต่งอวตาร</Button>
                    )}
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => setRenaming(student)}>แก้ไข</Button>}
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => setPasswordStudent(student)}>
                        {student.profileId ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
                      </Button>
                    )}
                    {canEdit && mode === 'cloud' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => void activate(student.id)}>ยืนยันไอดี</Button>
                        <Button variant="ghost" size="sm" onClick={() => void setAccess(student, false)}>ปิดการเข้าใช้งาน</Button>
                        {student.profileId && (
                          <EraseAccountButton
                            schoolId={membership.schoolId} role="student" profileId={student.profileId}
                            displayName={student.displayName} onDone={toast}
                          />
                        )}
                      </>
                    )}
                    {canEdit && (
                      <Button variant="danger" size="sm" onClick={() => setRemoving(student)}>ลบ</Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {/*
        * Both of these were hand-built backdrops with none of a dialog's behaviour: no focus trap,
        * no Escape, no focus returned to whatever opened them, and a backdrop that swallowed every
        * click behind it. The shared Modal has all four.
        */}
      {renaming && canEdit && (
        <Modal
          title={`แก้ไข ${renaming.displayName}`}
          description="ชื่อและเลขประจำตัวคือสิ่งที่นักเรียนพิมพ์ตอนเข้าสู่ระบบ การแก้ไขเปลี่ยนสิ่งที่ต้องพิมพ์ด้วย"
          onClose={() => setRenaming(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void repository.saveStudent({
                id: renaming.id,
                studentCode: String(data.get('code') ?? '').trim(),
                displayName: String(data.get('name') ?? '').trim(),
                avatarIndex: renaming.avatarIndex
              }).then(() => { setRenaming(null); toast('บันทึกการแก้ไขแล้ว', { tone: 'success' }); });
            }}
          >
            <FieldGroup>
              <Field label="รหัสนักเรียน"><input name="code" defaultValue={renaming.studentCode} required /></Field>
              <Field label="ชื่อ-สกุล"><input name="name" defaultValue={renaming.displayName} required /></Field>
            </FieldGroup>
            <div className="ui-page-actions">
              <Button variant="ghost" type="button" onClick={() => setRenaming(null)}>ยกเลิก</Button>
              <Button variant="primary" type="submit">บันทึก</Button>
            </div>
          </form>
        </Modal>
      )}

      {passwordStudent && canEdit && (
        <Modal
          title={`${passwordStudent.profileId ? 'เปลี่ยนรหัสผ่าน' : 'สร้างบัญชี'} · ${passwordStudent.displayName}`}
          onClose={() => setPasswordStudent(null)}
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
              void (passwordStudent.profileId
                ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'student', profileId: passwordStudent.profileId, password })
                : provisionManagedAccount({ schoolId: membership.schoolId, role: 'student', recordId: passwordStudent.id, displayName: passwordStudent.displayName, password }))
                .then(() => { setPasswordStudent(null); toast('บันทึกรหัสผ่านนักเรียนแล้ว', { tone: 'success' }); })
                .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกรหัสผ่านไม่สำเร็จ', { tone: 'error' }));
            }}
          >
            <ManagedPasswordFields />
            <div className="ui-page-actions">
              <Button variant="ghost" type="button" onClick={() => setPasswordStudent(null)}>ยกเลิก</Button>
              <Button variant="primary" type="submit">บันทึก</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Removing a student takes their attendance, their marks and their submissions with them. It
          used to happen on the first click of a text link sitting between "แก้ไข" and a badge. */}
      {removing && canEdit && (
        <ConfirmDialog
          title={`ลบ ${removing.displayName} ออกจากระบบ?`}
          description={`เลขประจำตัว ${removing.studentCode} · ประวัติการเข้าเรียน คะแนน และงานที่ส่งของนักเรียนคนนี้จะหายไปด้วย`}
          confirmLabel="ลบนักเรียน"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            void repository.removeStudent(target.id)
              .then(() => toast(`ลบ ${target.displayName} แล้ว`))
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ', { tone: 'error' }));
          }}
        />
      )}

      {studioStudent && (
        <AvatarStudio
          avatarIndex={studioStudent.avatarIndex}
          config={studioStudent.avatarConfig}
          studentName={studioStudent.displayName}
          onClose={() => setStudioStudent(null)}
          onSave={(config) => {
            void repository.saveStudentAvatar(studioStudent.id, config)
              .then(() => { setStudioStudent(null); toast('บันทึกอวตารแล้ว'); })
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกอวตารไม่สำเร็จ', { tone: 'error' }));
          }}
        />
      )}

    </>
  );
}
