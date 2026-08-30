import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { rosterFor } from '../../data/selectors';
import { Field, ProgressBar } from '../../ui/components';
import type { Classroom } from '../../domain/types';

export function ClassesPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ studentId: string; classId: string } | null>(null);
  const [editing, setEditing] = useState<Classroom | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Classroom | null>(null);
  const [capacity, setCapacity] = useState<number>(editing?.capacity ?? 40);
  const [customCapacity, setCustomCapacity] = useState('');

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
        setMessage('ความจุห้องเรียนต้องเป็นจำนวนเต็ม 1-200');
        return;
      }
      if (editing) {
        const enrolled = rosterFor(snapshot, editing.id).length;
        if (chosen < enrolled) {
          setMessage(`ห้องนี้มีนักเรียน ${enrolled} คน ต้องย้ายนักเรียนออกก่อนจึงจะลดความจุเหลือ ${chosen}`);
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
      setMessage(editing ? 'แก้ไขห้องเรียนแล้ว' : 'สร้างห้องเรียนแล้ว');
      setEditing(null);
      setOpenForm(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกห้องเรียนไม่สำเร็จ');
    }
  }

  async function removeClass(classroom: Classroom) {
    try {
      await repository.deleteClass(classroom.id);
      setMessage(`ลบห้อง ${classroom.name} แล้ว`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ลบห้องเรียนไม่สำเร็จ');
    } finally {
      setConfirmDelete(null);
    }
  }

  async function moveStudent() {
    if (!transfer || !term) return;
    try {
      await repository.transferStudent(transfer.studentId, transfer.classId, term.id);
      setMessage('ย้ายห้องเรียนแล้ว');
      setTransfer(null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'ย้ายห้องไม่สำเร็จ');
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

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
