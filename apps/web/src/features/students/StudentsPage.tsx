import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, classIdOfStudent, rosterFor, studentsByName } from '../../data/selectors';
import { ProfileAvatar } from '../avatars/ProfileAvatar';
import { AvatarDesigner } from '../avatars/AvatarDesigner';
import { configForAvatarId } from '../avatars/avatarCatalog';
import type { AvatarConfigV2 } from '../avatars/avatarSchema';
import type { Student } from '../../domain/types';
import { nextStudentCode, previewQuickAdd, previewQuickAddTable } from './quickAdd';
import { acceptedImportExtensions, readImportFile } from '../../data/importParsing';
import { requireSupabase } from '../../services/supabase';
import { useSyncStatus } from '../../sync/SyncStatusContext';
import { provisionManagedAccount, setManagedAccountPassword } from '../auth/adminAccount';
import { EraseAccountButton } from '../auth/EraseAccountButton';
import { ManagedPasswordFields } from '../auth/ManagedPasswordFields';
import { activateMemberLogin, describeActivatedLogin } from '../auth/identityActivation';
import {
  AutoTextarea, Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, FieldGroup,
  Modal, PageHeader, SearchInput, Segmented, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

type AddMode = 'one' | 'list' | 'file';

export function StudentsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const sync = useSyncStatus();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useState('');
  const [open, setOpen] = useState(false);
  /*
   * Where the new names land, chosen in the dialog rather than inherited from the filter above it.
   *
   * The room was taken from whatever the roster filter happened to be showing, which meant the one
   * question that decides where a child ends up was answered by a control the administrator was
   * using to look at something else. `''` is a real answer here — "not in a room yet" — because a
   * child who has enrolled but not been placed is an ordinary Monday, and the class can be given
   * later from this screen or from ห้องเรียน.
   */
  const [destination, setDestination] = useState('');
  const [addMode, setAddMode] = useState<AddMode>('one');
  const [pasted, setPasted] = useState('');
  const [readingFile, setReadingFile] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [query, setQuery] = useState('');
  const { toast } = useToast();
  const [studioStudent, setStudioStudent] = useState<Student | null>(null);
  const [renaming, setRenaming] = useState<Student | null>(null);
  const [passwordStudent, setPasswordStudent] = useState<Student | null>(null);
  const [removing, setRemoving] = useState<Student | null>(null);

  const selectedClassId = classId || classes[0]?.id || '';
  const canEdit = membership.role === 'admin';
  const isStudentView = membership.role === 'student';
  /*
   * Two views the room filter could not express: everybody, and nobody's room yet.
   *
   * Adding a child before placing them is now a supported order of events, so the screen has to be
   * able to show the children that leaves — otherwise a name is saved and then disappears from the
   * only list that could put it in a class.
   */
  const placedStudentIds = useMemo(
    () => new Set(snapshot.enrollments.filter((item) => item.status === 'active').map((item) => item.studentId)),
    [snapshot.enrollments]
  );
  /*
   * A room keeps the order its register is called in; every other list is by name.
   *
   * "ทั้งหมด" and "ยังไม่มีห้อง" handed back whatever order the rows arrived in, which is insertion
   * order — so the school-wide list had no order at all and the only way to find somebody was the
   * search box. `rosterFor` already puts one room in student-code order, which is the order a
   * register is read in, and that stays.
   */
  const roster = useMemo(() => {
    if (selectedClassId === 'all') return studentsByName(snapshot.students);
    if (selectedClassId === 'unplaced') return studentsByName(snapshot.students.filter((student) => !placedStudentIds.has(student.id)));
    return selectedClassId ? rosterFor(snapshot, selectedClassId) : studentsByName(snapshot.students);
  }, [placedStudentIds, snapshot, selectedClassId]);
  const unplacedCount = useMemo(
    () => snapshot.students.filter((student) => !placedStudentIds.has(student.id)).length,
    [placedStudentIds, snapshot.students]
  );
  // Forty names is more than a screen holds, and finding one of them was a scroll.
  const students = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((student) => `${student.displayName} ${student.studentCode}`.toLowerCase().includes(needle));
  }, [roster, query]);
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];

  const existingCodes = useMemo(
    () => new Set(snapshot.students.map((item) => item.studentCode)),
    [snapshot.students]
  );
  const quickPreview = useMemo(() => previewQuickAdd(pasted, existingCodes), [existingCodes, pasted]);
  // The single-student form starts on the next free number, because typing one that is already
  // taken is the mistake this screen used to answer with "รหัสนักเรียนนี้มีอยู่แล้ว" after the fact.
  const suggestedCode = useMemo(() => nextStudentCode(existingCodes), [existingCodes]);

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
      if (destination) {
        if (!term) throw new Error('ยังไม่มีภาคเรียนในเครื่องนี้ · ซิงก์ข้อมูลก่อน แล้วจึงเพิ่มนักเรียนเข้าห้อง');
        await repository.enrollStudent(id, destination, term.id);
      }
      if (mode === 'cloud') {
        // The roster row is written locally and queued, and the account is bound to it by id on the
        // server. Provisioning before that queue drains asks the server about a student it has not
        // been told about yet, which it answers with NOT_FOUND — so the name and the account behind
        // it never arrived, on exactly the runs where the network was slower than the sync debounce.
        await sync?.syncNow();
        await provisionManagedAccount({ schoolId: membership.schoolId, role: 'student', recordId: id, displayName, password });
      }
      form.reset();
      setOpen(false);
      const room = classes.find((item) => item.id === destination)?.name;
      toast(room ? `เพิ่ม ${displayName} เข้าห้อง ${room} แล้ว` : `เพิ่ม ${displayName} แล้ว · ยังไม่ได้เข้าห้อง`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    }
  }

  /**
   * Reads a file the same way the paste box reads text.
   *
   * A spreadsheet, a Word table, a CSV: the reader hands back columns and rows, and from there the
   * two paths are one, so a file and a paste can never disagree about what they were going to create.
   */
  async function pickRosterFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReadingFile(true);
    try {
      const parsed = await readImportFile(file);
      const preview = previewQuickAddTable(parsed.table, existingCodes);
      if (preview.rows.length === 0 && preview.problems.length === 0) {
        toast('ไม่พบรายชื่อในไฟล์นี้', { tone: 'error' });
        return;
      }
      setPasted(preview.rows.map((row) => `${row.studentCode}\t${row.displayName}`).join('\n'));
      toast(`อ่านไฟล์ได้ ${preview.rows.length} รายชื่อ · ตรวจแล้วกดบันทึก`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'อ่านไฟล์ไม่สำเร็จ', { tone: 'error' });
    } finally {
      setReadingFile(false);
    }
  }

  /** Writes everything the preview promised, one record at a time, and says what actually landed. */
  async function saveQuickAdd() {
    if (quickPreview.rows.length === 0) return;
    setBulkSaving(true);
    let saved = 0;
    try {
      for (const row of quickPreview.rows) {
        const id = crypto.randomUUID();
        await repository.saveStudent({
          id, studentCode: row.studentCode, displayName: row.displayName,
          avatarIndex: (snapshot.students.length + saved) * 7
        });
        if (destination) {
          if (!term) throw new Error('ยังไม่มีภาคเรียนในเครื่องนี้ · ซิงก์ข้อมูลก่อน แล้วจึงเพิ่มนักเรียนเข้าห้อง');
          await repository.enrollStudent(id, destination, term.id);
        }
        saved += 1;
      }
      setPasted('');
      const room = classes.find((item) => item.id === destination)?.name;
      toast(room ? `เพิ่มนักเรียน ${saved} คนเข้าห้อง ${room} แล้ว` : `เพิ่มนักเรียน ${saved} คนแล้ว · ยังไม่ได้เข้าห้อง`);
      setOpen(false);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : `บันทึกได้ ${saved} คนแล้วหยุดที่ข้อผิดพลาด`, { tone: 'error' });
    } finally {
      setBulkSaving(false);
    }
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
          <Button
            variant="primary"
            icon={<Icon name="plus" size={16} />}
            onClick={() => {
              // The dialog opens on the room being looked at, which is the usual intent, and the
              // administrator can still say "not yet" without leaving the dialog.
              setDestination(classes.some((item) => item.id === selectedClassId) ? selectedClassId : '');
              setOpen((value) => !value);
            }}
          >
            เพิ่มนักเรียน
          </Button>
        )}
      />

      <Toolbar>
        <label>
          ห้องเรียน
          <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            {canEdit && <option value="all">ทุกห้อง</option>}
            {canEdit && <option value="unplaced">ยังไม่เข้าห้อง{unplacedCount > 0 ? ` (${unplacedCount})` : ''}</option>}
          </select>
        </label>
        <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อหรือเลขประจำตัว" />
      </Toolbar>

      {/*
        Adding children, without the wizard.
        The full importer is for the once-a-year job — a whole school, four kinds of record, a
        column-mapping table. Adding the six children who arrived this week went through it too, and
        that is the trip this replaces: one dialog, three ways in (type one, paste a list, open a
        file), the same preview under all three, and one button that writes exactly what the preview
        showed and puts them in the room chosen at the top.
      */}
      {open && canEdit && (
        <Modal
          title="เพิ่มนักเรียน"
          description="บันทึกรายชื่อก่อน แล้วเลือกห้องได้ทันทีหรือค่อยจัดห้องทีหลัง"
          onClose={() => setOpen(false)}
          wide
        >
          <Field label="เข้าห้องเรียน" hint="เลือก “ยังไม่เข้าห้อง” ถ้าจะจัดห้องทีหลัง · หาได้จากตัวกรองห้องด้านบน">
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="">ยังไม่เข้าห้อง</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>

          <Segmented
            ariaLabel="วิธีเพิ่มนักเรียน"
            value={addMode}
            onChange={setAddMode}
            options={[
              { value: 'one' as const, label: 'ทีละคน' },
              { value: 'list' as const, label: 'วางรายชื่อ' },
              { value: 'file' as const, label: 'จากไฟล์' }
            ]}
          />

          {addMode === 'one' && (
            <form onSubmit={(event) => void addStudent(event)}>
              <FieldGroup>
                <Field label="ชื่อจริง"><input name="firstName" required /></Field>
                <Field label="นามสกุล"><input name="lastName" required /></Field>
                <Field label="เลขประจำตัวนักเรียน" hint="นักเรียนใช้เลขนี้เข้าสู่ระบบคู่กับชื่อ">
                  <input name="code" defaultValue={suggestedCode} required />
                </Field>
                <Field label="รหัสผ่านเริ่มต้น" hint="อย่างน้อย 8 ตัวอักษร · แอดมินเปลี่ยนภายหลังได้">
                  <input name="password" type="password" minLength={8} autoComplete="new-password" required />
                </Field>
              </FieldGroup>
              <div className="ui-form-actions">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
                <Button variant="primary" type="submit">{destination ? 'บันทึกและเข้าห้อง' : 'บันทึกรายชื่อ'}</Button>
              </div>
            </form>
          )}

          {addMode !== 'one' && (
            <>
              {addMode === 'list' ? (
                <Field
                  label="วางรายชื่อ"
                  hint="บรรทัดละหนึ่งคน · ใส่เลขประจำตัวหน้าหรือหลังชื่อก็ได้ ถ้าไม่ใส่ ระบบจะออกเลขต่อจากเลขล่าสุดให้"
                >
                  <AutoTextarea value={pasted} onChange={setPasted} minRows={5} maxRows={14} />
                </Field>
              ) : (
                <Field
                  label="ไฟล์รายชื่อ"
                  hint="รองรับ Excel (.xlsx), CSV, Word (.docx) และ PDF ที่เป็นตัวอักษร · อ่านแล้วยังตรวจแก้ได้ก่อนบันทึก"
                >
                  <input type="file" accept={acceptedImportExtensions} onChange={(event) => void pickRosterFile(event)} />
                </Field>
              )}

              {readingFile && <p className="ui-field-hint">กำลังอ่านไฟล์…</p>}

              {quickPreview.rows.length > 0 && (
                <ol className="quick-add-preview">
                  {quickPreview.rows.slice(0, 30).map((row) => (
                    <li key={`${row.lineNumber}-${row.studentCode}`}>
                      <strong>{row.displayName}</strong>
                      <span>
                        เลขประจำตัว {row.studentCode}
                        {row.generatedCode && <em> · ออกเลขให้อัตโนมัติ</em>}
                      </span>
                    </li>
                  ))}
                  {quickPreview.rows.length > 30 && (
                    <li className="quick-add-more">และอีก {quickPreview.rows.length - 30} คน</li>
                  )}
                </ol>
              )}

              {quickPreview.problems.length > 0 && (
                <ul className="quick-add-problems" role="status">
                  {quickPreview.problems.slice(0, 5).map((problem) => (
                    <li key={problem.lineNumber}>บรรทัด {problem.lineNumber}: {problem.message}</li>
                  ))}
                  {quickPreview.problems.length > 5 && <li>และอีก {quickPreview.problems.length - 5} บรรทัดที่ยังอ่านไม่ได้</li>}
                </ul>
              )}

              <div className="ui-form-actions">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
                <Button
                  variant="primary"
                  loading={bulkSaving}
                  disabled={quickPreview.rows.length === 0}
                  onClick={() => void saveQuickAdd()}
                >
                  บันทึก {quickPreview.rows.length} คน{destination ? ' เข้าห้องนี้' : ''}
                </Button>
              </div>
              <p className="ui-field-hint">
                การเพิ่มแบบรายการยังไม่ตั้งรหัสผ่านให้ · เปิดการเข้าใช้งานทีหลังได้จากปุ่มในรายชื่อ
              </p>
            </>
          )}
        </Modal>
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
              // Creating the account here binds it to the roster row by id, so the same rule as the
              // add form applies: the row has to have reached the server first. Changing a password
              // needs no such wait — the profile it names already exists.
              void (passwordStudent.profileId
                ? setManagedAccountPassword({ schoolId: membership.schoolId, role: 'student', profileId: passwordStudent.profileId, password })
                : Promise.resolve(sync?.syncNow()).then(() => provisionManagedAccount({ schoolId: membership.schoolId, role: 'student', recordId: passwordStudent.id, displayName: passwordStudent.displayName, password })))
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
        <AvatarDesigner
          displayName={studioStudent.displayName}
          currentAvatarId={studioStudent.avatarId ?? null}
          currentConfig={(studioStudent.avatarConfig ?? null) as AvatarConfigV2 | null}
          onClose={() => setStudioStudent(null)}
          /*
           * A teacher dressing a pupil is not spending that child's points, so no prices are shown
           * and every drawer is open. Both saves go through the roster write a teacher already has,
           * rather than the RPC a student uses on their own record.
           */
          onSave={(chosenId) => {
            // A teacher writes the look rather than the id: `saveStudentAvatar` is the only avatar
            // write on the roster side, and the catalogue entry is exactly a config.
            const config = configForAvatarId(chosenId);
            if (!config) { toast('ไม่พบ avatar ที่เลือก', { tone: 'error' }); return; }
            void repository.saveStudentAvatar(studioStudent.id, config)
              .then(() => { setStudioStudent(null); toast('บันทึกอวตารแล้ว'); })
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกอวตารไม่สำเร็จ', { tone: 'error' }));
          }}
          onSaveConfig={(config) => {
            void repository.saveStudentAvatar(studioStudent.id, config)
              .then(() => { setStudioStudent(null); toast('บันทึกอวตารแล้ว'); })
              .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'บันทึกอวตารไม่สำเร็จ', { tone: 'error' }));
          }}
        />
      )}

    </>
  );
}
