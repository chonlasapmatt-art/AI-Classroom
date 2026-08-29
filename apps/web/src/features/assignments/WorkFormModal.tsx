import { useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Field, FieldGroup, Modal, Segmented } from '../../ui/components';
import { defaultReminderOffsets, reminderPresets } from '../../academic/reminderEngine';
import { workloadWarningFor } from '../../academic/workload';
import { rubricMaxScore } from '../../academic/rubric';
import type { Assignment, Rubric, Subject, WorkType } from '../../domain/types';
import type { AssignmentInput } from '../../data/schoolRepository';

const workTypeOptions: Array<{ value: WorkType; label: string }> = [
  { value: 'homework', label: 'การบ้าน' },
  { value: 'assignment', label: 'งานที่มอบหมาย' },
  { value: 'project', label: 'โครงงาน' },
  { value: 'activity', label: 'กิจกรรม' }
];

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface Props {
  classId: string;
  className: string;
  subjects: Subject[];
  rubrics: Rubric[];
  works: Assignment[];
  editing: Assignment | null;
  /** Deadline the form opens with, in the local datetime-input format. */
  defaultDueAt?: string;
  onClose(): void;
  onSave(input: AssignmentInput, publish: boolean): Promise<void>;
}

/**
 * Creating or editing a piece of work: subject, type, schedule, marking scheme and reminder plan in
 * one grouped form, with the class workload checked before anything is published.
 */
export function WorkFormModal({ classId, className, subjects, rubrics, works, editing, defaultDueAt, onClose, onSave }: Props) {
  const [workType, setWorkType] = useState<WorkType>(editing?.workType ?? 'homework');
  const [subjectId, setSubjectId] = useState(editing?.subjectId ?? subjects[0]?.id ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [dueAt, setDueAt] = useState(toLocalInput(editing?.dueAt ?? null) || (defaultDueAt ?? ''));
  const [maxScore, setMaxScore] = useState(String(editing?.maxScore ?? 10));
  const [rubricId, setRubricId] = useState(editing?.rubricId ?? '');
  const [offsets, setOffsets] = useState<number[]>(editing?.reminderOffsets ?? defaultReminderOffsets('homework'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPublish, setPendingPublish] = useState<AssignmentInput | null>(null);
  // The id is decided here so the caller can publish exactly the record it just saved.
  const workId = useMemo(() => editing?.id ?? crypto.randomUUID(), [editing?.id]);

  const rubric = rubrics.find((item) => item.id === rubricId) ?? null;
  const effectiveMax = rubric ? rubricMaxScore(rubric) : Number(maxScore);

  const warning = useMemo(() => {
    if (!dueAt) return null;
    return workloadWarningFor(
      { id: editing?.id ?? 'new', classId, dueAt: new Date(dueAt).toISOString(), title, subjectId: subjectId || null },
      works,
      subjects
    );
  }, [dueAt, classId, editing?.id, title, subjectId, works, subjects]);

  function buildInput(status: Assignment['status']): AssignmentInput {
    return {
      id: workId,
      classId,
      subjectId: subjectId || null,
      workType,
      title: title.trim(),
      description: '',
      instructions: (document.getElementById('work-instructions') as HTMLTextAreaElement | null)?.value.trim() ?? '',
      startAt: null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      maxScore: effectiveMax,
      rubricId: rubricId || null,
      reminderOffsets: offsets,
      status
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>, publish: boolean) {
    event.preventDefault();
    if (!title.trim()) { setError('ตั้งชื่องานก่อน'); return; }
    if (!Number.isFinite(effectiveMax) || effectiveMax <= 0) { setError('คะแนนเต็มต้องมากกว่า 0'); return; }

    const input = buildInput(publish ? 'published' : 'draft');
    if (publish && warning) { setPendingPublish(input); return; }

    setBusy(true);
    setError(null);
    try {
      await onSave(input, publish);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPublish() {
    if (!pendingPublish) return;
    setBusy(true);
    try {
      await onSave(pendingPublish, true);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เผยแพร่ไม่สำเร็จ');
    } finally {
      setBusy(false);
      setPendingPublish(null);
    }
  }

  if (pendingPublish && warning) {
    return (
      <Modal
        title="ภาระงานค่อนข้างสูง"
        description={`ห้อง ${className} มีงานครบกำหนด ${warning.count} รายการในวันที่ ${new Date(warning.dueDate).toLocaleDateString('th-TH')}`}
        onClose={() => setPendingPublish(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setPendingPublish(null)}>เปลี่ยนวันส่ง</Button>
            <Button variant="primary" loading={busy} onClick={() => void confirmPublish()}>เผยแพร่ต่อ</Button>
          </>
        }
      >
        <ul className="workload-list">
          {warning.titles.map((item, index) => (
            <li key={`${item}-${index}`}>
              <Badge tone="warning">{warning.subjects[index] ?? 'ไม่ระบุวิชา'}</Badge>
              {item}
            </li>
          ))}
        </ul>
        <p className="ui-field-hint">คำเตือนนี้เป็นข้อมูลประกอบการตัดสินใจ ครูยังเผยแพร่ต่อได้</p>
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={editing ? `แก้ไข ${editing.title}` : 'สร้างงานใหม่'}
      description={`${className} · นักเรียนจะเห็นงานเมื่อกดเผยแพร่เท่านั้น`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="secondary"
            loading={busy}
            onClick={(event) => void submit(event as unknown as FormEvent<HTMLFormElement>, false)}
          >
            บันทึกฉบับร่าง
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={(event) => void submit(event as unknown as FormEvent<HTMLFormElement>, true)}
          >
            เผยแพร่ให้นักเรียน
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event, false)}>
        <FieldGroup title="รายละเอียดงาน">
          <Field label="ประเภทงาน">
            <Segmented
              ariaLabel="ประเภทงาน"
              value={workType}
              onChange={(next) => { setWorkType(next); setOffsets(defaultReminderOffsets(next)); }}
              options={workTypeOptions}
            />
          </Field>
          <Field label="รายวิชา">
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">ไม่ระบุวิชา</option>
              {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </Field>
          <Field label="ชื่องาน">
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="กำหนดส่ง" hint="เว้นว่างได้ถ้ายังไม่กำหนด">
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
          </Field>
        </FieldGroup>

        <FieldGroup title="คำสั่งงาน" columns={1}>
          <Field label="คำสั่งที่นักเรียนจะเห็น" hint="อธิบายสั้น ๆ ว่าต้องทำอะไรและส่งอย่างไร">
            <textarea id="work-instructions" rows={3} defaultValue={editing?.instructions ?? ''} />
          </Field>
        </FieldGroup>

        <FieldGroup title="การให้คะแนน">
          <Field label="เกณฑ์ (rubric)" hint="เลือกได้ถ้าต้องการให้คะแนนแยกตามหัวข้อ">
            <select value={rubricId} onChange={(event) => setRubricId(event.target.value)}>
              <option value="">ให้คะแนนแบบคะแนนเดียว</option>
              {rubrics.filter((item) => item.status === 'active').map((item) => (
                <option key={item.id} value={item.id}>{item.title} ({rubricMaxScore(item)} คะแนน)</option>
              ))}
            </select>
          </Field>
          <Field label="คะแนนเต็ม" hint={rubric ? 'คำนวณจากผลรวมของเกณฑ์' : 'กรอกคะแนนเต็มของงานนี้'}>
            <input
              type="number" min="1" value={rubric ? rubricMaxScore(rubric) : maxScore}
              disabled={Boolean(rubric)}
              onChange={(event) => setMaxScore(event.target.value)}
            />
          </Field>
        </FieldGroup>

        <FieldGroup title="การแจ้งเตือน" columns={1}>
          <div className="reminder-options">
            {reminderPresets.map((preset) => (
              <label key={preset.offsetMinutes} className="reminder-option">
                <input
                  type="checkbox"
                  checked={offsets.includes(preset.offsetMinutes)}
                  onChange={(event) => setOffsets((current) => event.target.checked
                    ? [...new Set([...current, preset.offsetMinutes])].sort((a, b) => b - a)
                    : current.filter((value) => value !== preset.offsetMinutes))}
                />
                {preset.label}
              </label>
            ))}
          </div>
          <p className="ui-field-hint">ฉบับร่างไม่ส่งการแจ้งเตือน · การแจ้งเตือนจะคำนวณใหม่อัตโนมัติเมื่อเปลี่ยนกำหนดส่ง</p>
        </FieldGroup>

        {warning && (
          <div className="inline-warning" role="status">
            <Badge tone="warning">ภาระงานสูง</Badge>
            <span>วันที่ {new Date(warning.dueDate).toLocaleDateString('th-TH')} ห้องนี้มีงานครบกำหนด {warning.count} รายการ</span>
          </div>
        )}
        {error && <p className="ui-field-message" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
