import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import { standardSubjects, subjectColor, subjectColors, subjectIconKeys, subjectIconLabels } from '../../data/subjectCatalog';
import { SubjectIcon } from './SubjectIcon';
import type { Subject } from '../../domain/types';

export function SubjectsPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = membership.role === 'admin' && repository.canManageStructure;
  const classes = activeClasses(snapshot);
  const subjects = [...snapshot.subjects].sort((a, b) => a.sortOrder - b.sortOrder);
  const missingStandard = standardSubjects.filter((seed) => !subjects.some((subject) => subject.code === seed.code));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await repository.saveSubject({
        ...(editing ? { id: editing.id } : {}),
        code: String(data.get('code') ?? '').trim().toUpperCase(),
        name: String(data.get('name') ?? '').trim(),
        nameEn: String(data.get('nameEn') ?? '').trim(),
        colorIndex: Number(data.get('colorIndex') ?? 0),
        iconKey: String(data.get('iconKey') ?? 'default')
      });
      form.reset();
      setEditing(null);
      setOpenForm(false);
      setMessage(editing ? 'แก้ไขรายวิชาแล้ว' : 'เพิ่มรายวิชาแล้ว');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    }
  }

  async function seedStandard() {
    for (const [index, seed] of missingStandard.entries()) {
      await repository.saveSubject({ ...seed, sortOrder: subjects.length + index });
    }
    setMessage(`เพิ่ม ${missingStandard.length} กลุ่มสาระมาตรฐานแล้ว`);
  }

  function countFor(subjectId: string): number {
    return snapshot.assignments.filter((item) => item.subjectId === subjectId).length
      + snapshot.activities.filter((item) => item.subjectId === subjectId).length
      + snapshot.tests.filter((item) => item.subjectId === subjectId).length;
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">โครงสร้างหลักสูตร</span>
          <h1>รายวิชา</h1>
          <p>{subjects.filter((item) => item.status === 'active').length} วิชาที่เปิดสอน · ใช้กับ {classes.length} ห้องเรียน</p>
        </div>
        {canEdit && (
          <button className="primary-button" onClick={() => { setEditing(null); setOpenForm((value) => !value); }}>
            + เพิ่มรายวิชา
          </button>
        )}
      </section>

      {canEdit && missingStandard.length > 0 && (
        <div className="alert">
          ยังไม่มี {missingStandard.length} กลุ่มสาระมาตรฐาน
          <button className="text-button" onClick={() => void seedStandard()}>เพิ่มทั้งหมด</button>
        </div>
      )}

      {(openForm || editing) && canEdit && (
        <form className="panel inline-form" onSubmit={(event) => void save(event)} key={editing?.id ?? 'new'}>
          <div className="panel-heading"><h2>{editing ? `แก้ไข ${editing.name}` : 'เพิ่มรายวิชาใหม่'}</h2></div>
          <div className="form-grid">
            <label>รหัสวิชา<input name="code" defaultValue={editing?.code ?? ''} required /></label>
            <label>ชื่อวิชา<input name="name" defaultValue={editing?.name ?? ''} required /></label>
            <label>ชื่อภาษาอังกฤษ<input name="nameEn" defaultValue={editing?.nameEn ?? ''} /></label>
            <label>
              สี
              <select name="colorIndex" defaultValue={editing?.colorIndex ?? 0}>
                {subjectColors.map((_color, index) => <option key={index} value={index}>สีที่ {index + 1}</option>)}
              </select>
            </label>
            <label>
              ไอคอน
              <select name="iconKey" defaultValue={editing?.iconKey ?? 'default'}>
                {subjectIconKeys.map((key) => <option key={key} value={key}>{subjectIconLabels[key]}</option>)}
              </select>
            </label>
          </div>
          <div className="record-actions">
            <button className="primary-button">บันทึก</button>
            {editing && <button type="button" className="text-button" onClick={() => setEditing(null)}>ยกเลิก</button>}
          </div>
        </form>
      )}

      {!repository.canManageStructure && membership.role === 'admin' && (
        <div className="alert">ต้องเชื่อมต่อ Supabase ก่อนจึงจะเพิ่มหรือแก้ไขรายวิชาได้ (รายวิชาเป็นข้อมูลฝั่งเซิร์ฟเวอร์)</div>
      )}

      <section className="subject-grid">
        {subjects.map((subject) => {
          const color = subjectColor(subject.colorIndex);
          return (
            <article key={subject.id} className="subject-card" style={{ borderColor: color.solid }}>
              <div className="subject-card-head" style={{ background: color.soft, color: color.solid }}>
                <span className="subject-card-icon"><SubjectIcon iconKey={subject.iconKey} size={22} /></span>
                <div>
                  <strong>{subject.name}</strong>
                  <span>{subject.code}{subject.nameEn ? ` · ${subject.nameEn}` : ''}</span>
                </div>
              </div>
              <p>{countFor(subject.id)} งาน/กิจกรรม/การสอบในระบบ</p>
              <div className="record-actions">
                <span className={`status-chip ${subject.status === 'active' ? 'success' : 'warning'}`}>
                  {subject.status === 'active' ? 'เปิดสอน' : 'เก็บถาวร'}
                </span>
                {canEdit && (
                  <>
                    <button className="text-button" onClick={() => { setEditing(subject); setOpenForm(true); }}>แก้ไข</button>
                    {subject.status === 'active' && (
                      <button className="text-button" onClick={() => void repository.archiveSubject(subject.id)}>เก็บถาวร</button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
