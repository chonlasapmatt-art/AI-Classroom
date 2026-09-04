import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { rosterFor } from '../../data/selectors';
import { Field, ProgressBar } from '../../ui/components';
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
  const [capacity, setCapacity] = useState<number>(editing?.capacity ?? 40);
  const [customCapacity, setCustomCapacity] = useState('');
  const [rosterClassId, setRosterClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const isOperator = membership.role === 'admin' || membership.role === 'teacher';
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];
  const canEdit = isOperator && repository.canManageStructure && Boolean(term);
  const classes = [...snapshot.classes].sort((a, b) => a.name.localeCompare(b.name, 'th'));

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
      setEditing(null);
      setOpenForm(false);
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
    const classId = rosterClassId || classes.find((item) => item.status === 'active')?.id || '';
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
    const classId = rosterClassId || classes.find((item) => item.status === 'active')?.id || '';
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
        toast(result?.status === 'already_member' ? `${student.displayName} อยู่ในห้องนี้แล้ว` : `เชิญ ${student.displayName} เข้าห้องแล้ว ระบบกำลังซิงค์รายชื่อ`);
      } else {
        await repository.enrollStudent(student.studentId, classId, term.id);
        toast(`เพิ่ม ${student.displayName} เข้าห้องแล้ว`);
      }
      setSearchResults((items) => items.map((item) => item.studentId === student.studentId ? { ...item, currentClassId: classId, currentClassName: classes.find((entry) => entry.id === classId)?.name ?? null } : item));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'เชิญนักเรียนไม่สำเร็จ', { tone: 'error' });
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">โครงสร้างโรงเรียน</span>
          <h1>ห้องเรียน</h1>
          <p>ปีการศึกษา {term?.academicYear ?? '—'} ภาคเรียนที่ {term?.term ?? '—'} · {classes.length} ห้อง</p>
        </div>
        {canEdit && (
          <button className="primary-button" onClick={() => { setEditing(null); setOpenForm((value) => !value); }}>
            + เพิ่มห้องเรียน
          </button>
        )}
      </section>

      {(openForm || editing) && canEdit && (
        <form className="panel inline-form" onSubmit={(event) => void saveClass(event)} key={editing?.id ?? 'new'}>
          <div className="panel-heading"><h2>{editing ? `แก้ไข ${editing.name}` : 'เพิ่มห้องเรียน'}</h2></div>
          <div className="form-grid">
            <label>ชื่อห้อง<input name="name" defaultValue={editing?.name ?? ''} placeholder="ป.5/3" required /></label>
            <label>ระดับชั้น<input name="gradeLevel" defaultValue={editing?.gradeLevel ?? ''} placeholder="ประถมศึกษาปีที่ 5" required /></label>
          </div>
          <div className="capacity-picker">
            <span className="ui-field-label">ความจุห้องเรียน</span>
            <div className="capacity-options">
              {[30, 40, 50, 60, 70, 80, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`capacity-chip ${!customCapacity && capacity === preset ? 'selected' : ''}`}
                  onClick={() => { setCapacity(preset); setCustomCapacity(''); }}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                className={`capacity-chip ${customCapacity ? 'selected' : ''}`}
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
          <div className="record-actions">
            <button className="primary-button">{editing ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>
            {editing && <button type="button" className="text-button" onClick={() => { setEditing(null); setOpenForm(false); }}>ยกเลิก</button>}
          </div>
        </form>
      )}

      {!repository.canManageStructure && isOperator && (
        <div className="alert">ต้องเชื่อมต่อ Supabase ก่อนจึงจะสร้าง แก้ไข หรือลบห้องเรียนได้ (ห้องเรียนเป็นข้อมูลฝั่งเซิร์ฟเวอร์)</div>
      )}

      <section className="panel data-panel">
        <ul className="record-list">
          {classes.map((classroom) => {
            const roster = rosterFor(snapshot, classroom.id);
            const teacherNames = snapshot.classTeachers
              .filter((item) => item.classId === classroom.id)
              .map((link) => snapshot.teachers.find((teacher) => teacher.id === link.teacherId)?.displayName)
              .filter(Boolean)
              .join(', ');
            return (
              <li key={classroom.id}>
                <div className="record-main">
                  <div>
                    <strong>{classroom.name}</strong>
                    <span>{classroom.gradeLevel} · ครู: {teacherNames || 'ยังไม่กำหนด'}</span>
                    <div className="capacity-meter">
                      <ProgressBar
                        value={roster.length}
                        max={classroom.capacity}
                        tone={roster.length >= classroom.capacity ? 'danger' : roster.length / classroom.capacity > 0.85 ? 'warning' : 'success'}
                        label={`${roster.length} / ${classroom.capacity} คน`}
                      />
                    </div>
                  </div>
                  <span className={`status-chip ${classroom.status === 'active' ? 'success' : 'warning'}`}>
                    {classroom.status === 'active' ? 'เปิดสอน' : 'เก็บถาวร'}
                  </span>
                </div>
                {canEdit && (
                  <div className="record-actions">
                    <button className="text-button" onClick={() => { setEditing(classroom); setCapacity(classroom.capacity); setCustomCapacity(''); setOpenForm(true); }}>เปลี่ยนชื่อ / แก้ไข</button>
                    {classroom.status === 'active' ? (
                      <button className="text-button" onClick={() => void repository.archiveClass(classroom.id)}>เก็บถาวร</button>
                    ) : (
                      <button className="text-button" onClick={() => void repository.restoreClass(classroom.id)}>นำกลับมาใช้</button>
                    )}
                    <button className="text-button danger" onClick={() => setConfirmDelete(classroom)}>ลบ</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {canEdit && classes.some((item) => item.status === 'active') && (
        <section className="panel roster-invite-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Invite แบบเกมออนไลน์</span><h2>ค้นหาและดึงนักเรียนเข้าห้อง</h2></div>
            <p>ค้นหาเฉพาะนักเรียนในโรงเรียนเดียวกัน ระบบตรวจสิทธิ์และความจุห้องที่เซิร์ฟเวอร์</p>
          </div>
          <form className="roster-search" onSubmit={(event) => void searchStudents(event)}>
            <label>ห้องเรียน<select value={rosterClassId} onChange={(event) => { setRosterClassId(event.target.value); setSearchResults([]); }} required><option value="">เลือกห้อง</option>{classes.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>ค้นหาชื่อนักเรียน<input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} minLength={2} placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร" required /></label>
            <button className="secondary-button" disabled={searching}>{searching ? 'กำลังค้นหา...' : 'ค้นหา'}</button>
          </form>
          {searchResults.length > 0 && <ul className="invite-result-list">{searchResults.map((student) => {
            const targetId = rosterClassId;
            const alreadyHere = Boolean(targetId && student.currentClassId === targetId);
            return <li key={student.studentId}><div><strong>{student.displayName}</strong><span>รหัส {student.studentCode}{student.currentClassName ? ` · อยู่ ${student.currentClassName}` : ' · ยังไม่มีห้องในเทอมนี้'}</span></div><button className={alreadyHere ? 'secondary-button' : 'primary-button'} disabled={alreadyHere} onClick={() => void inviteStudent(student)}>{alreadyHere ? 'อยู่ในห้องแล้ว' : '+ INV เข้าห้อง'}</button></li>;
          })}</ul>}
          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && <p className="empty-inline">ยังไม่พบรายชื่อ ลองตรวจการสะกดหรือใช้ชื่อบางส่วน</p>}
        </section>
      )}

      {isOperator && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>ย้ายนักเรียนระหว่างห้อง</h2></div>
          <div className="form-grid">
            <label>
              นักเรียน
              <select
                value={transfer?.studentId ?? ''}
                onChange={(event) => setTransfer({ studentId: event.target.value, classId: transfer?.classId ?? classes[0]?.id ?? '' })}
              >
                <option value="">เลือกนักเรียน</option>
                {snapshot.students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
              </select>
            </label>
            <label>
              ย้ายไปห้อง
              <select
                value={transfer?.classId ?? ''}
                onChange={(event) => setTransfer({ studentId: transfer?.studentId ?? '', classId: event.target.value })}
              >
                <option value="">เลือกห้อง</option>
                {classes.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <button className="secondary-button" disabled={!transfer?.studentId || !transfer.classId} onClick={() => void moveStudent()}>
            ยืนยันการย้ายห้อง
          </button>
        </section>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="ยืนยันการลบห้องเรียน">
          <section className="modal-card confirm-card">
            <h2>ลบห้อง {confirmDelete.name}?</h2>
            <p>
              การลบจะเอาห้องนี้ออกจากรายการและยกเลิกการมอบหมายครูของห้องนี้ ประวัติเดิม (เช็กชื่อ คะแนน)
              ยังอยู่ในระบบ แต่จะไม่ผูกกับห้องที่เปิดสอนอีก และต้องย้ายนักเรียนออกให้หมดก่อนจึงจะลบได้
            </p>
            <p className="muted">ตอนนี้มีนักเรียนในห้องนี้ {rosterFor(snapshot, confirmDelete.id).length} คน</p>
            <div className="modal-actions">
              <button className="text-button" onClick={() => setConfirmDelete(null)}>ยกเลิก</button>
              <button className="primary-button danger-button" onClick={() => void removeClass(confirmDelete)}>ยืนยันลบห้องเรียน</button>
            </div>
          </section>
        </div>
      )}

    </>
  );
}
