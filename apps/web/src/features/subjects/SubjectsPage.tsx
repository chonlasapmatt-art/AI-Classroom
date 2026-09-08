import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import { teacherLinksForProfile } from '../../data/teacherResponsibilities';
import {
  isSubjectIconKey, standardSubjects, subjectColor, subjectColors, subjectIconKeys, subjectIconLabels,
  type SubjectIconKey
} from '../../data/subjectCatalog';
import { SubjectIcon } from './SubjectIcon';
import type { Subject } from '../../domain/types';
import { Badge, Button, Card, CardHeader, EmptyState, Field, FieldGroup, LinkButton, PageHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

export function SubjectsPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const { toast } = useToast();

  // The two choices a person makes by looking rather than by reading. They are held here rather
  // than in the form's own fields because the preview above them has to change as they are made.
  const [colorIndex, setColorIndex] = useState(0);
  const [iconKey, setIconKey] = useState<SubjectIconKey>('default');
  const picked = subjectColor(colorIndex);

  /** Opening the form on a subject starts from what that subject already wears. */
  function edit(subject: Subject | null) {
    setEditing(subject);
    setColorIndex(subject?.colorIndex ?? 0);
    setIconKey(isSubjectIconKey(subject?.iconKey ?? '') ? subject!.iconKey as SubjectIconKey : 'default');
    setOpenForm(true);
  }

  const canEdit = membership.role === 'admin' && repository.canManageStructure;
  const classes = activeClasses(snapshot);

  /*
   * Who sees which subjects.
   *
   * A teacher sees the ones they teach: the catalogue of a school's whole curriculum is an
   * administrator's list, and a teacher scrolling past twenty subjects to find their two is a
   * teacher who stops using the screen. Everybody else sees the school's subjects, because the
   * lessons published inside them are for the school — a student watches them, a guardian reads
   * what their child is being taught, and neither of those is narrowed by who teaches it.
   */
  const teachingSubjectIds = useMemo(
    () => (membership.role === 'teacher'
      ? new Set(teacherLinksForProfile(snapshot, membership.profileId)
        .map((link) => link.subjectId)
        .filter((id): id is string => id !== null))
      : null),
    [membership.profileId, membership.role, snapshot]
  );
  const subjects = [...snapshot.subjects]
    .filter((item) => !teachingSubjectIds || teachingSubjectIds.has(item.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
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

  /** Lessons published under the subject itself, as opposed to work set inside a class. */
  function materialCountFor(subjectId: string): number {
    return snapshot.attachments.filter((item) => item.ownerType === 'subject' && item.ownerId === subjectId).length;
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
            onClick={() => (openForm && !editing ? setOpenForm(false) : edit(null))}
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
            </FieldGroup>

            {/*
              A colour and an icon are things you look at, so they are chosen by looking.
              Both used to be dropdowns — one of them listing "สีที่ 1" through "สีที่ 8", which
              names nothing a person can picture — and the only way to find out what a choice looked
              like was to save it and go back to the list. The swatches and the drawings are the
              control now, with the chosen pair previewed at the size the subject card draws it.
            */}
            <input type="hidden" name="colorIndex" value={colorIndex} />
            <input type="hidden" name="iconKey" value={iconKey} />

            <div className="subject-designer">
              <div className="subject-designer-preview" aria-hidden="true">
                <span
                  className="subject-medallion"
                  style={{ '--subject-color': picked.solid, '--subject-soft': picked.soft } as CSSProperties}
                >
                  <SubjectIcon iconKey={iconKey} size={26} />
                </span>
                <span className="subject-designer-preview-copy">
                  <strong>{subjectIconLabels[isSubjectIconKey(iconKey) ? iconKey : 'default']}</strong>
                  <small>{picked.name}</small>
                </span>
              </div>

              <div className="subject-designer-field">
                <span className="ui-field-label" id="subject-colour-legend">สีประจำวิชา</span>
                <p className="ui-field-hint">ใช้แยกวิชาบนปฏิทิน ตารางสอน และสมุดคะแนน</p>
                <div className="subject-swatches" role="radiogroup" aria-labelledby="subject-colour-legend">
                  {subjectColors.map((color, index) => (
                    <button
                      key={color.solid}
                      type="button"
                      role="radio"
                      aria-checked={colorIndex === index}
                      aria-label={color.name}
                      title={color.name}
                      className="subject-swatch"
                      style={{ '--subject-color': color.solid, '--subject-soft': color.soft } as CSSProperties}
                      onClick={() => setColorIndex(index)}
                    >
                      {colorIndex === index && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="subject-designer-field">
                <span className="ui-field-label" id="subject-icon-legend">ไอคอน</span>
                <p className="ui-field-hint">เลือกภาพที่ตรงกับวิชามากที่สุด · ใช้ทุกที่ที่อ้างถึงวิชานี้</p>
                <div className="subject-icon-choice" role="radiogroup" aria-labelledby="subject-icon-legend">
                  {subjectIconKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={iconKey === key}
                      aria-label={subjectIconLabels[key]}
                      title={subjectIconLabels[key]}
                      className="subject-icon-option"
                      style={{ '--subject-color': picked.solid, '--subject-soft': picked.soft } as CSSProperties}
                      onClick={() => setIconKey(key)}
                    >
                      <SubjectIcon iconKey={key} size={20} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
              action: <Button variant="primary" onClick={() => edit(null)}>เพิ่มรายวิชา</Button>
            } : {})}
          />
        </Card>
      ) : (
        <section className="subject-grid">
          {subjects.map((subject) => {
            const color = subjectColor(subject.colorIndex);
            return (
              <article key={subject.id} className="subject-card" style={{ borderColor: color.solid }}>
                <div
                  className="subject-card-head subject-tint"
                  style={{ '--subject-color': color.solid, '--subject-soft': color.soft } as CSSProperties}
                >
                  {/* The medallion: the subject's colour as a ring and a wash behind its drawing,
                      rather than a flat white square with a line icon dropped into it. */}
                  <span className="subject-medallion">
                    <SubjectIcon iconKey={subject.iconKey} size={24} title={subject.name} />
                  </span>
                  <div>
                    <strong>{subject.name}</strong>
                    <span>{subject.code}{subject.nameEn ? ` · ${subject.nameEn}` : ''}</span>
                  </div>
                </div>
                <p>
                  {countFor(subject.id)} งาน/กิจกรรม/การสอบในระบบ
                  {materialCountFor(subject.id) > 0 && ` · ${materialCountFor(subject.id)} บทเรียน`}
                </p>
                <div className="record-actions">
                  <Badge tone={subject.status === 'active' ? 'success' : 'warning'}>
                    {subject.status === 'active' ? 'เปิดสอน' : 'เก็บถาวร'}
                  </Badge>
                  {/* The subject's own page: its staff, its lessons, and the questions asked
                      about it. Everything else on this card is the catalogue entry. */}
                  <LinkButton to={`/subjects/${subject.id}`} size="sm" variant="secondary">
                    เปิดบทเรียน
                  </LinkButton>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => edit(subject)}>แก้ไข</Button>
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
