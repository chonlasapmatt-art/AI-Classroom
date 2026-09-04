import { useState, type CSSProperties, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import { standardSubjects, subjectColor, subjectColors, subjectIconKeys, subjectIconLabels } from '../../data/subjectCatalog';
import { SubjectIcon } from './SubjectIcon';
import type { Subject } from '../../domain/types';
import { Badge, Button, Card, CardHeader, EmptyState, Field, FieldGroup, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

export function SubjectsPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const { toast } = useToast();

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
      toast(editing ? 'แก้ไขรายวิชาแล้ว' : 'เพิ่มรายวิชาแล้ว', { tone: 'success' });
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    }
  }

  async function seedStandard() {
    for (const [index, seed] of missingStandard.entries()) {
      await repository.saveSubject({ ...seed, sortOrder: subjects.length + index });
    }
    toast(`เพิ่ม ${missingStandard.length} กลุ่มสาระมาตรฐานแล้ว`, { tone: 'success' });
  }

  function countFor(subjectId: string): number {
    return snapshot.assignments.filter((item) => item.subjectId === subjectId).length
      + snapshot.activities.filter((item) => item.subjectId === subjectId).length
      + snapshot.tests.filter((item) => item.subjectId === subjectId).length;
  }

  return (
    <>
      <PageHeader
        eyebrow="โครงสร้างหลักสูตร"
        title="รายวิชา"
        description={`${subjects.filter((item) => item.status === 'active').length} วิชาที่เปิดสอน · ใช้กับ ${classes.length} ห้องเรียน`}
        action={canEdit && (
          <Button
            variant="primary" icon={<Icon name="plus" size={16} />}
            onClick={() => { setEditing(null); setOpenForm((value) => !value); }}
          >
            เพิ่มรายวิชา
          </Button>
        )}
      />

      {canEdit && missingStandard.length > 0 && (
        <div className="inline-warning" role="status">
          <Badge tone="info">กลุ่มสาระมาตรฐาน</Badge>
          <span>ยังไม่มี {missingStandard.length} กลุ่มสาระมาตรฐานในโรงเรียนนี้</span>
          <Button variant="secondary" size="sm" onClick={() => void seedStandard()}>เพิ่มทั้งหมด</Button>
        </div>
      )}

      {/* The refusal is about the connection, not about the account: a school working offline can
          still take a register, and saying which of the two it is stops somebody hunting for a
          permission they already have. */}
      {!repository.canManageStructure && (membership.role === 'admin' || membership.role === 'teacher') && (
        <div className="inline-warning" role="status">
          <Badge tone="warning">ออฟไลน์</Badge>
          <span>รายวิชาเป็นข้อมูลฝั่งเซิร์ฟเวอร์ · ต้องเชื่อมต่อ Supabase ก่อนจึงจะเพิ่มหรือแก้ไขได้</span>
        </div>
      )}

      {(openForm || editing) && canEdit && (
        <Card as="section">
          <form onSubmit={(event) => void save(event)} key={editing?.id ?? 'new'}>
            <CardHeader
              title={editing ? `แก้ไข ${editing.name}` : 'เพิ่มรายวิชาใหม่'}
              description="รหัสและชื่อวิชาปรากฏบนงาน คะแนน และตารางสอนทุกที่ที่อ้างถึงวิชานี้"
            />
            <FieldGroup>
              <Field label="รหัสวิชา" hint="เช่น TH11 · ระบบจะแปลงเป็นตัวพิมพ์ใหญ่ให้">
                <input name="code" defaultValue={editing?.code ?? ''} required />
              </Field>
              <Field label="ชื่อวิชา">
                <input name="name" defaultValue={editing?.name ?? ''} required />
              </Field>
              <Field label="ชื่อภาษาอังกฤษ" hint="ไม่บังคับ">
                <input name="nameEn" defaultValue={editing?.nameEn ?? ''} />
              </Field>
              <Field label="สี" hint="ใช้แยกวิชาบนปฏิทินและตารางสอน">
                <select name="colorIndex" defaultValue={editing?.colorIndex ?? 0}>
                  {subjectColors.map((_color, index) => <option key={index} value={index}>สีที่ {index + 1}</option>)}
                </select>
              </Field>
              <Field label="ไอคอน">
                <select name="iconKey" defaultValue={editing?.iconKey ?? 'default'}>
                  {subjectIconKeys.map((key) => <option key={key} value={key}>{subjectIconLabels[key]}</option>)}
                </select>
              </Field>
            </FieldGroup>
            <div className="ui-page-actions">
              <Button variant="primary" type="submit">บันทึก</Button>
              {editing && <Button variant="ghost" type="button" onClick={() => setEditing(null)}>ยกเลิก</Button>}
            </div>
          </form>
        </Card>
      )}

      {subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="subjects" size={28} />}
            title="ยังไม่มีรายวิชาในโรงเรียนนี้"
            description={canEdit
              ? 'เพิ่มรายวิชาเอง หรือกด "เพิ่มทั้งหมด" เพื่อสร้างกลุ่มสาระมาตรฐานให้ครบในครั้งเดียว'
              : 'เมื่อแอดมินเพิ่มรายวิชาแล้ว รายการจะแสดงที่นี่'}
            {...(canEdit ? {
              action: <Button variant="primary" onClick={() => { setEditing(null); setOpenForm(true); }}>เพิ่มรายวิชา</Button>
            } : {})}
          />
        </Card>
      ) : (
        <section className="subject-grid">
          {subjects.map((subject) => {
            const color = subjectColor(subject.colorIndex);
            return (
              <article key={subject.id} className="subject-card" style={{ borderColor: color.solid }}>
                <div className="subject-card-head subject-tint" style={{ '--subject-color': color.solid } as CSSProperties}>
                  <span className="subject-card-icon"><SubjectIcon iconKey={subject.iconKey} size={22} /></span>
                  <div>
                    <strong>{subject.name}</strong>
                    <span>{subject.code}{subject.nameEn ? ` · ${subject.nameEn}` : ''}</span>
                  </div>
                </div>
                <p>{countFor(subject.id)} งาน/กิจกรรม/การสอบในระบบ</p>
                <div className="record-actions">
                  <Badge tone={subject.status === 'active' ? 'success' : 'warning'}>
                    {subject.status === 'active' ? 'เปิดสอน' : 'เก็บถาวร'}
                  </Badge>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(subject); setOpenForm(true); }}>แก้ไข</Button>
                      {subject.status === 'active' && (
                        <Button variant="ghost" size="sm" onClick={() => void repository.archiveSubject(subject.id)}>เก็บถาวร</Button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
