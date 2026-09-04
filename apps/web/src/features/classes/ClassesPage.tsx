import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { rosterFor } from '../../data/selectors';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, FieldGroup, Modal,
  PageHeader, ProgressBar, SearchInput, Segmented, Stat, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import type { Classroom } from '../../domain/types';
import { requireSupabase } from '../../services/supabase';
import { useSyncStatus } from '../../sync/SyncStatusContext';
import { useToast } from '../../ui/toastContext';

interface StudentSearchResult {
  studentId: string;
  displayName: string;
  studentCode: string;
  currentClassId: string | null;
  currentClassName: string | null;
}

type StatusFilter = 'all' | 'active' | 'archived';

/** Full, nearly full, or room to spare — the reason an administrator opens this screen. */
function capacityTone(enrolled: number, capacity: number): 'danger' | 'warning' | 'success' {
  if (enrolled >= capacity) return 'danger';
  return enrolled / capacity > 0.85 ? 'warning' : 'success';
}

export function ClassesPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const sync = useSyncStatus();
  const { toast } = useToast();
  const [transfer, setTransfer] = useState<{ studentId: string; classId: string } | null>(null);
  const [editing, setEditing] = useState<Classroom | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Classroom | null>(null);
  const [capacity, setCapacity] = useState<number>(40);
  const [customCapacity, setCustomCapacity] = useState('');
  const [rosterClassId, setRosterClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [classQuery, setClassQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const isOperator = membership.role === 'admin' || membership.role === 'teacher';
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];
  const canEdit = isOperator && repository.canManageStructure && Boolean(term);
  const classes = [...snapshot.classes].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  const activeClassrooms = classes.filter((item) => item.status === 'active');

  const visibleClasses = classes.filter((classroom) => {
    if (statusFilter !== 'all' && (statusFilter === 'active') !== (classroom.status === 'active')) return false;
    const needle = classQuery.trim().toLocaleLowerCase('th');
    if (!needle) return true;
    return classroom.name.toLocaleLowerCase('th').includes(needle)
      || classroom.gradeLevel.toLocaleLowerCase('th').includes(needle);
  });

  const totals = useMemo(() => {
    const enrolled = activeClassrooms.reduce((sum, classroom) => sum + rosterFor(snapshot, classroom.id).length, 0);
    const seats = activeClassrooms.reduce((sum, classroom) => sum + classroom.capacity, 0);
    const full = activeClassrooms.filter((classroom) => rosterFor(snapshot, classroom.id).length >= classroom.capacity).length;
    return { enrolled, seats, full };
  }, [activeClassrooms, snapshot]);

  /** Names the class a student sits in today, so the transfer picker is not eight hundred bare names. */
  const studentOptions = useMemo(() => [...snapshot.students]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'))
    .map((student) => {
      const enrollment = snapshot.enrollments.find((item) => item.studentId === student.id && item.status === 'active');
      const currentClass = snapshot.classes.find((item) => item.id === enrollment?.classId);
      return { id: student.id, label: currentClass ? `${student.displayName} · ${currentClass.name}` : `${student.displayName} · ยังไม่มีห้อง` };
    }), [snapshot]);

  function openCreate() {
    setEditing(null);
    setCapacity(40);
    setCustomCapacity('');
    setOpenForm(true);
  }

  function openEdit(classroom: Classroom) {
    setEditing(classroom);
    setCapacity(classroom.capacity);
    setCustomCapacity('');
    setOpenForm(true);
  }

  function closeForm() {
    setEditing(null);
    setOpenForm(false);
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!term) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const chosen = customCapacity ? Number(customCapacity) : capacity;
      if (!Number.isInteger(chosen) || chosen <= 0 || chosen > 200) {
        toast('ความจุห้องเรียนต้องเป็นจำนวนเต็ม 1-200');
        return;
      }
      if (editing) {
        const enrolled = rosterFor(snapshot, editing.id).length;
        if (chosen < enrolled) {
          toast(`ห้องนี้มีนักเรียน ${enrolled} คน ต้องย้ายนักเรียนออกก่อนจึงจะลดความจุเหลือ ${chosen}`);
          return;
        }
      }
      await repository.saveClass({
        ...(editing ? { id: editing.id } : {}),
        name: String(data.get('name') ?? '').trim(),
        gradeLevel: String(data.get('gradeLevel') ?? '').trim(),
        academicTermId: editing?.academicTermId ?? term.id,
        capacity: chosen
      });
      form.reset();
      toast(editing ? 'แก้ไขห้องเรียนแล้ว' : 'สร้างห้องเรียนแล้ว');
      closeForm();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกห้องเรียนไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function removeClass(classroom: Classroom) {
    try {
      await repository.deleteClass(classroom.id);
      toast(`ลบห้อง ${classroom.name} แล้ว`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ลบห้องเรียนไม่สำเร็จ', { tone: 'error' });
    } finally {
      setConfirmDelete(null);
    }
  }

  async function moveStudent() {
    if (!transfer || !term) return;
    try {
      await repository.transferStudent(transfer.studentId, transfer.classId, term.id);
      toast('ย้ายห้องเรียนแล้ว');
      setTransfer(null);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ย้ายห้องไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function searchStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const classId = rosterClassId || activeClassrooms[0]?.id || '';
    if (!classId || searchQuery.trim().length < 2) {
      toast('เลือกห้องและพิมพ์ชื่อนักเรียนอย่างน้อย 2 ตัวอักษร');
      return;
    }
    setSearching(true);
    try {
      if (mode === 'cloud') {
        const { data, error } = await requireSupabase().rpc('search_school_students', {
          p_school_id: membership.schoolId,
          p_class_id: classId,
          p_query: searchQuery.trim()
        });
        if (error) throw error;
        const rows = (data ?? []) as {
          student_id: string; display_name: string; student_code: string;
          current_class_id: string | null; current_class_name: string | null;
        }[];
        setSearchResults(rows.map((row) => ({
          studentId: String(row.student_id),
          displayName: String(row.display_name),
          studentCode: String(row.student_code),
          currentClassId: row.current_class_id ? String(row.current_class_id) : null,
          currentClassName: row.current_class_name ? String(row.current_class_name) : null
        })));
      } else {
        setSearchResults(snapshot.students
          .filter((student) => student.displayName.toLocaleLowerCase('th').includes(searchQuery.trim().toLocaleLowerCase('th')))
          .slice(0, 20)
          .map((student) => {
            const enrollment = snapshot.enrollments.find((item) => item.studentId === student.id && item.status === 'active');
            const currentClass = snapshot.classes.find((item) => item.id === enrollment?.classId);
            return { studentId: student.id, displayName: student.displayName, studentCode: student.studentCode, currentClassId: currentClass?.id ?? null, currentClassName: currentClass?.name ?? null };
          }));
      }
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ค้นหานักเรียนไม่สำเร็จ', { tone: 'error' });
    } finally { setSearching(false); }
  }

  async function inviteStudent(student: StudentSearchResult) {
    const classId = rosterClassId || activeClassrooms[0]?.id || '';
    if (!classId || !term) return;
    try {
      if (mode === 'cloud') {
        const { data, error } = await requireSupabase().rpc('invite_student_to_class', {
          p_school_id: membership.schoolId,
          p_class_id: classId,
          p_student_id: student.studentId
        });
        if (error) throw error;
        const result = data as { status?: string } | null;
        if (result?.status === 'already_enrolled_elsewhere') {
          toast(`${student.displayName} อยู่ใน ${student.currentClassName ?? 'ห้องอื่น'} แล้ว กรุณาใช้เมนูย้ายห้อง`);
          return;
        }
        // The RPC is authoritative, but it does not write the new row into this tab's Dexie
        // projection. Pull immediately so the room count and roster change without waiting for
        // the background interval (and without enqueueing the same enrollment a second time).
        if (result?.status === 'joined') await sync?.syncNow();
        toast(result?.status === 'already_member' ? `${student.displayName} อยู่ในห้องนี้แล้ว` : `เพิ่ม ${student.displayName} เข้าห้องแล้ว ระบบกำลังซิงค์รายชื่อ`);
      } else {
        await repository.enrollStudent(student.studentId, classId, term.id);
        toast(`เพิ่ม ${student.displayName} เข้าห้องแล้ว`);
      }
      setSearchResults((items) => items.map((item) => item.studentId === student.studentId ? { ...item, currentClassId: classId, currentClassName: classes.find((entry) => entry.id === classId)?.name ?? null } : item));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'เพิ่มนักเรียนเข้าห้องไม่สำเร็จ', { tone: 'error' });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="โครงสร้างโรงเรียน"
        title="ห้องเรียน"
        description={`ปีการศึกษา ${term?.academicYear ?? '—'} ภาคเรียนที่ ${term?.term ?? '—'}`}
        action={canEdit ? <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={openCreate}>เพิ่มห้องเรียน</Button> : undefined}
      />

      {!repository.canManageStructure && isOperator && (
        <Card>
          <EmptyState
            icon={<Icon name="sync" size={28} />}
            title="ยังแก้ไขห้องเรียนไม่ได้ในโหมดนี้"
            description="ห้องเรียนเป็นข้อมูลฝั่งเซิร์ฟเวอร์ ต้องเชื่อมต่อ Supabase ก่อนจึงจะสร้าง แก้ไข หรือลบได้ · ข้อมูลที่เห็นอยู่ยังอ่านได้ตามปกติ"
          />
        </Card>
      )}

      <div className="ui-stat-grid">
        <Stat label="ห้องที่เปิดสอน" value={activeClassrooms.length} hint={`จากทั้งหมด ${classes.length} ห้อง`} tone="brand" icon={<Icon name="classes" size={18} />} />
        <Stat label="นักเรียนที่มีห้องแล้ว" value={totals.enrolled} hint={`จากที่นั่งทั้งหมด ${totals.seats}`} tone="info" icon={<Icon name="students" size={18} />} />
        <Stat
          label="ห้องที่เต็มแล้ว"
          value={totals.full}
          hint={totals.full === 0 ? 'ทุกห้องยังรับได้' : 'ต้องเปิดห้องเพิ่มหรือขยายความจุ'}
          tone={totals.full === 0 ? 'success' : 'warning'}
          icon={<Icon name="warning" size={18} />}
        />
        <Stat
          label="ที่นั่งว่าง"
          value={Math.max(totals.seats - totals.enrolled, 0)}
          hint="รวมทุกห้องที่เปิดสอน"
          tone="neutral"
          icon={<Icon name="check" size={18} />}
        />
      </div>

      <Card>
        <CardHeader
          title="รายชื่อห้องเรียน"
          description="แถบความจุบอกว่าห้องไหนใกล้เต็ม กดแก้ไขเพื่อเปลี่ยนชื่อ ระดับชั้น หรือความจุ"
          action={<Badge tone="neutral">{visibleClasses.length} ห้อง</Badge>}
        />
        <Toolbar>
          <SearchInput value={classQuery} onChange={setClassQuery} placeholder="ค้นหาชื่อห้องหรือระดับชั้น" label="ค้นหาห้องเรียน" />
          <Segmented
            ariaLabel="กรองตามสถานะห้องเรียน"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all' as const, label: 'ทั้งหมด' },
              { value: 'active' as const, label: 'เปิดสอน' },
              { value: 'archived' as const, label: 'เก็บถาวร' }
            ]}
          />
        </Toolbar>

        {visibleClasses.length === 0 ? (
          <EmptyState
            icon={<Icon name={classes.length === 0 ? 'classes' : 'search'} size={28} />}
            title={classes.length === 0 ? 'ยังไม่มีห้องเรียน' : 'ไม่พบห้องที่ค้นหา'}
            description={classes.length === 0
              ? 'เริ่มจากสร้างห้องแรก แล้วค่อยเพิ่มนักเรียนเข้าห้อง'
              : 'ลองพิมพ์ชื่อห้องแบบสั้นลง หรือเปลี่ยนตัวกรองสถานะ'}
            action={classes.length === 0
              ? (canEdit ? <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={openCreate}>เพิ่มห้องเรียน</Button> : undefined)
              : <Button variant="secondary" onClick={() => { setClassQuery(''); setStatusFilter('all'); }}>ล้างตัวกรอง</Button>}
          />
        ) : (
          <ul className="class-grid">
            {visibleClasses.map((classroom) => {
              const roster = rosterFor(snapshot, classroom.id);
              const teacherNames = snapshot.classTeachers
                .filter((item) => item.classId === classroom.id)
                .map((link) => snapshot.teachers.find((teacher) => teacher.id === link.teacherId)?.displayName)
                .filter(Boolean)
                .join(', ');
              return (
                <li key={classroom.id} className="class-card">
                  <div className="class-card-top">
                    <div className="class-card-title">
                      <strong>{classroom.name}</strong>
                      <span>{classroom.gradeLevel}</span>
                    </div>
                    <Badge tone={classroom.status === 'active' ? 'success' : 'neutral'}>
                      {classroom.status === 'active' ? 'เปิดสอน' : 'เก็บถาวร'}
                    </Badge>
                  </div>
                  <p className="class-card-teacher">
                    <Icon name="teachers" size={14} />
                    {teacherNames || 'ยังไม่กำหนดครูประจำห้อง'}
                  </p>
                  <ProgressBar
                    value={roster.length}
                    max={classroom.capacity}
                    tone={capacityTone(roster.length, classroom.capacity)}
                    label={`${roster.length} / ${classroom.capacity} คน`}
                  />
                  {canEdit && (
                    <div className="class-card-actions">
                      <Button variant="secondary" icon={<Icon name="edit" size={16} />} onClick={() => openEdit(classroom)}>แก้ไข</Button>
                      {classroom.status === 'active' ? (
                        <Button variant="ghost" onClick={() => void repository.archiveClass(classroom.id)}>เก็บถาวร</Button>
                      ) : (
                        <Button variant="ghost" onClick={() => void repository.restoreClass(classroom.id)}>นำกลับมาใช้</Button>
                      )}
                      <Button variant="danger" icon={<Icon name="trash" size={16} />} onClick={() => setConfirmDelete(classroom)}>ลบ</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canEdit && activeClassrooms.length > 0 && (
        <Card>
          <CardHeader
            title="เพิ่มนักเรียนเข้าห้อง"
            description="ค้นหาเฉพาะนักเรียนในโรงเรียนเดียวกัน สิทธิ์และความจุห้องตรวจที่เซิร์ฟเวอร์"
          />
          <form onSubmit={(event) => void searchStudents(event)}>
            <FieldGroup columns={2}>
              <Field label="ห้องปลายทาง">
                <select value={rosterClassId} onChange={(event) => { setRosterClassId(event.target.value); setSearchResults([]); }} required>
                  <option value="">เลือกห้อง</option>
                  {activeClassrooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="ชื่อนักเรียน" hint="พิมพ์อย่างน้อย 2 ตัวอักษร">
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} minLength={2} placeholder="เช่น สมชาย" required />
              </Field>
            </FieldGroup>
            <div className="ui-form-actions">
              <Button variant="secondary" loading={searching} icon={<Icon name="search" size={16} />}>ค้นหานักเรียน</Button>
            </div>
          </form>

          {searchResults.length > 0 && (
            <ul className="invite-result-list">
              {searchResults.map((student) => {
                const alreadyHere = Boolean(rosterClassId && student.currentClassId === rosterClassId);
                return (
                  <li key={student.studentId}>
                    <div>
                      <strong>{student.displayName}</strong>
                      <span>รหัส {student.studentCode}{student.currentClassName ? ` · อยู่ห้อง ${student.currentClassName}` : ' · ยังไม่มีห้องในเทอมนี้'}</span>
                    </div>
                    <Button
                      variant={alreadyHere ? 'secondary' : 'primary'}
                      disabled={alreadyHere}
                      icon={<Icon name={alreadyHere ? 'check' : 'plus'} size={16} />}
                      onClick={() => void inviteStudent(student)}
                    >
                      {alreadyHere ? 'อยู่ในห้องนี้แล้ว' : 'เพิ่มเข้าห้อง'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <EmptyState
              icon={<Icon name="search" size={28} />}
              title="ยังไม่พบรายชื่อ"
              description="ลองตรวจการสะกด หรือพิมพ์เพียงบางส่วนของชื่อ"
            />
          )}
        </Card>
      )}

      {isOperator && (
        <Card>
          <CardHeader
            title="ย้ายนักเรียนระหว่างห้อง"
            description="ใช้เมื่อนักเรียนมีห้องอยู่แล้วและต้องย้ายไปอีกห้องในเทอมเดียวกัน"
          />
          <FieldGroup columns={2}>
            <Field label="นักเรียน" hint="วงเล็บท้ายชื่อคือห้องปัจจุบัน">
              <select
                value={transfer?.studentId ?? ''}
                onChange={(event) => setTransfer({ studentId: event.target.value, classId: transfer?.classId ?? '' })}
              >
                <option value="">เลือกนักเรียน</option>
                {studentOptions.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
              </select>
            </Field>
            <Field label="ย้ายไปห้อง">
              <select
                value={transfer?.classId ?? ''}
                onChange={(event) => setTransfer({ studentId: transfer?.studentId ?? '', classId: event.target.value })}
              >
                <option value="">เลือกห้อง</option>
                {activeClassrooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          </FieldGroup>
          <div className="ui-form-actions">
            <Button
              variant="primary"
              disabled={!transfer?.studentId || !transfer.classId}
              icon={<Icon name="promotion" size={16} />}
              onClick={() => void moveStudent()}
            >
              ยืนยันการย้ายห้อง
            </Button>
          </div>
        </Card>
      )}

      {/*
        Creating a room used to unfold a form above the list, which pushed every room down the page
        and left the person who pressed "เพิ่มห้องเรียน" looking at rooms that had moved. It is a
        modal now: the list stays where it was, and Escape closes it.
      */}
      {openForm && canEdit && (
        <Modal
          title={editing ? `แก้ไขห้อง ${editing.name}` : 'เพิ่มห้องเรียน'}
          description={editing ? 'การเปลี่ยนความจุจะไม่กระทบนักเรียนที่อยู่ในห้องแล้ว' : `ห้องนี้จะถูกสร้างในภาคเรียนที่ ${term?.term ?? '—'} ปีการศึกษา ${term?.academicYear ?? '—'}`}
          onClose={closeForm}
        >
          <form onSubmit={(event) => void saveClass(event)} key={editing?.id ?? 'new'} id="class-form">
            <FieldGroup columns={2}>
              <Field label="ชื่อห้อง"><input name="name" defaultValue={editing?.name ?? ''} placeholder="ป.5/3" required /></Field>
              <Field label="ระดับชั้น"><input name="gradeLevel" defaultValue={editing?.gradeLevel ?? ''} placeholder="ประถมศึกษาปีที่ 5" required /></Field>
            </FieldGroup>

            {/*
              The presets sit outside Field on purpose: a <button> inside a <label> takes the label's
              accessible name, so all eight would have announced themselves as "ความจุห้องเรียน".
            */}
            <div className="capacity-picker">
              <span className="ui-field-label" id="capacity-legend">ความจุห้องเรียน</span>
              <div className="capacity-options" role="group" aria-labelledby="capacity-legend">
                {[30, 40, 50, 60, 70, 80, 100].map((preset) => {
                  const selected = !customCapacity && capacity === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      className={`capacity-chip ${selected ? 'selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => { setCapacity(preset); setCustomCapacity(''); }}
                    >
                      {preset} คน
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`capacity-chip ${customCapacity ? 'selected' : ''}`}
                  aria-pressed={Boolean(customCapacity)}
                  onClick={() => setCustomCapacity(String(capacity))}
                >
                  กำหนดเอง
                </button>
              </div>
              {customCapacity !== '' && (
                <Field label="จำนวนที่กำหนดเอง" hint="จำนวนเต็ม 1-200">
                  <input
                    type="number" min="1" max="200" value={customCapacity}
                    onChange={(event) => setCustomCapacity(event.target.value)}
                  />
                </Field>
              )}
            </div>

            <div className="ui-form-actions">
              <Button type="button" variant="ghost" onClick={closeForm}>ยกเลิก</Button>
              <Button variant="primary" icon={<Icon name="check" size={16} />}>{editing ? 'บันทึกการแก้ไข' : 'สร้างห้องเรียน'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Was a hand-built backdrop: no focus trap, no Escape, and no focus returned to the control
          that opened it — on the one dialog in this screen that destroys something. */}
      {confirmDelete && (
        <ConfirmDialog
          title={`ลบห้อง ${confirmDelete.name}?`}
          description={
            `ตอนนี้มีนักเรียนในห้องนี้ ${rosterFor(snapshot, confirmDelete.id).length} คน · `
            + 'การลบจะเอาห้องนี้ออกจากรายการและยกเลิกการมอบหมายครูของห้องนี้ '
            + 'ประวัติเดิม (เช็กชื่อ คะแนน) ยังอยู่ในระบบ แต่จะไม่ผูกกับห้องที่เปิดสอนอีก '
            + 'และต้องย้ายนักเรียนออกให้หมดก่อนจึงจะลบได้'
          }
          confirmLabel="ยืนยันลบห้องเรียน"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void removeClass(confirmDelete)}
        />
      )}

    </>
  );
}
