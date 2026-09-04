import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AutoTextarea, Badge, Button, Field, FieldGroup, Modal, Segmented
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { forget, recallRecord, rememberRecord } from '../../app/deviceMemory';
import { defaultReminderOffsets, reminderPresets } from '../../academic/reminderEngine';
import { workloadWarningFor } from '../../academic/workload';
import { rubricMaxScore } from '../../academic/rubric';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import type { Assignment, Rubric, Subject, WorkType } from '../../domain/types';
import type { AssignmentInput } from '../../data/schoolRepository';

const workTypeOptions: Array<{ value: WorkType; label: string }> = [
  { value: 'homework', label: 'การบ้าน' },
  { value: 'assignment', label: 'งานที่มอบหมาย' },
  { value: 'project', label: 'โครงงาน' },
  { value: 'activity', label: 'กิจกรรม' }
];

const workTypeLabels: Record<WorkType, string> = {
  homework: 'การบ้าน', assignment: 'งานที่มอบหมาย', project: 'โครงงาน', activity: 'กิจกรรม'
};

/**
 * The form as a short list of named parts, rather than as one column to scroll.
 *
 * A wizard was the other option and it is the wrong shape here: eight fields split across six steps
 * is five extra clicks and five chances to be sent back for something you already answered. Sections
 * keep everything on screen, and the rail above them says which parts still need you — which is the
 * information a stepper was going to be used for anyway.
 */
const sections = [
  { id: 'basics', label: 'ข้อมูลพื้นฐาน' },
  { id: 'detail', label: 'รายละเอียด' },
  { id: 'due', label: 'กำหนดส่ง' },
  { id: 'score', label: 'คะแนน' },
  { id: 'files', label: 'ไฟล์แนบ' },
  { id: 'reminders', label: 'การแจ้งเตือน' }
] as const;

type SectionId = typeof sections[number]['id'];

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** A due date somebody would otherwise assemble by hand out of the picker, at the school day's end. */
function inDays(days: number): string {
  const when = new Date();
  when.setDate(when.getDate() + days);
  when.setHours(16, 0, 0, 0);
  return toLocalInput(when.toISOString());
}

interface Draft {
  workType: WorkType; subjectId: string; title: string; instructions: string;
  dueAt: string; maxScore: string; rubricId: string; offsets: number[];
}

/** One unsent draft per class per teacher; editing an existing work keeps its own slot. */
const draftKey = (classId: string, editingId: string | null) =>
  `smart-classroom.work-draft.${classId}.${editingId ?? 'new'}`;

interface Props {
  classId: string;
  className: string;
  subjects: Subject[];
  rubrics: Rubric[];
  works: Assignment[];
  editing: Assignment | null;
  /** Deadline the form opens with, in the local datetime-input format. */
  defaultDueAt?: string;
  /** Whose upload it is, when the form is editing a work that already exists. */
  actorProfileId?: string;
  onClose(): void;
  onSave(input: AssignmentInput, publish: boolean): Promise<void>;
}

/**
 * Creating or editing a piece of work: subject, type, schedule, marking scheme, files and reminder
 * plan, with the class workload checked before anything is published.
 *
 * What is typed here survives the tab closing. A teacher writing an assignment gets interrupted —
 * a bell, a question, a browser that reloads for an update — and losing the paragraph they had
 * written is the reason the next one gets written in a notes app instead.
 */
export function WorkFormModal({
  classId, className, subjects, rubrics, works, editing, defaultDueAt, actorProfileId, onClose, onSave
}: Props) {
  const storageKey = draftKey(classId, editing?.id ?? null);
  const saved = useMemo(() => recallRecord<Partial<Draft>>(storageKey, {}), [storageKey]);
  const [restored, setRestored] = useState(() => Object.keys(saved).length > 0);

  const [workType, setWorkType] = useState<WorkType>(saved.workType ?? editing?.workType ?? 'homework');
  const [subjectId, setSubjectId] = useState(saved.subjectId ?? editing?.subjectId ?? subjects[0]?.id ?? '');
  const [title, setTitle] = useState(saved.title ?? editing?.title ?? '');
  const [instructions, setInstructions] = useState(saved.instructions ?? editing?.instructions ?? '');
  const [dueAt, setDueAt] = useState(saved.dueAt ?? (toLocalInput(editing?.dueAt ?? null) || (defaultDueAt ?? '')));
  const [maxScore, setMaxScore] = useState(saved.maxScore ?? String(editing?.maxScore ?? 10));
  const [rubricId, setRubricId] = useState(saved.rubricId ?? editing?.rubricId ?? '');
  const [offsets, setOffsets] = useState<number[]>(saved.offsets ?? editing?.reminderOffsets ?? defaultReminderOffsets('homework'));

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPublish, setPendingPublish] = useState<AssignmentInput | null>(null);
  const body = useRef<HTMLDivElement | null>(null);

  // The id is decided here so the caller can publish exactly the record it just saved.
  const workId = useMemo(() => editing?.id ?? crypto.randomUUID(), [editing?.id]);
  const rubric = rubrics.find((item) => item.id === rubricId) ?? null;
  const effectiveMax = rubric ? rubricMaxScore(rubric) : Number(maxScore);

  /*
   * Autosave, debounced.
   *
   * Writing on every keystroke serialises the whole form for each character, which a cheap tablet
   * feels in the text field itself. Half a second is longer than a pause between words and shorter
   * than the gap before somebody is interrupted.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      rememberRecord(storageKey, { workType, subjectId, title, instructions, dueAt, maxScore, rubricId, offsets });
    }, 500);
    return () => clearTimeout(timer);
  }, [storageKey, workType, subjectId, title, instructions, dueAt, maxScore, rubricId, offsets]);

  const titleError = touched.title && !title.trim() ? 'ตั้งชื่องานก่อน เช่น "ใบงานบทที่ 3"' : undefined;
  const scoreError = touched.maxScore && !(Number.isFinite(effectiveMax) && effectiveMax > 0)
    ? 'คะแนนเต็มต้องเป็นตัวเลขมากกว่า 0' : undefined;

  /** A section is done when the reader has nothing left to decide in it. */
  const done: Record<SectionId, boolean> = {
    basics: title.trim().length > 0,
    detail: instructions.trim().length > 0,
    due: dueAt !== '',
    score: Number.isFinite(effectiveMax) && effectiveMax > 0,
    files: true,
    reminders: offsets.length > 0
  };

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
      instructions: instructions.trim(),
      startAt: null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      maxScore: effectiveMax,
      rubricId: rubricId || null,
      reminderOffsets: offsets,
      status
    };
  }

  function focusSection(id: SectionId) {
    body.current?.querySelector(`#work-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submit(publish: boolean) {
    setTouched({ title: true, maxScore: true });
    if (!title.trim()) { setError('ตั้งชื่องานก่อน'); focusSection('basics'); return; }
    if (!Number.isFinite(effectiveMax) || effectiveMax <= 0) { setError('คะแนนเต็มต้องมากกว่า 0'); focusSection('score'); return; }

    const input = buildInput(publish ? 'published' : 'draft');
    if (publish && warning) { setPendingPublish(input); return; }

    setBusy(true);
    setError(null);
    try {
      await onSave(input, publish);
      // The draft has been superseded by the real record; keeping it would offer to restore an older
      // version of the work that now exists.
      forget(storageKey);
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
      forget(storageKey);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เผยแพร่ไม่สำเร็จ');
    } finally {
      setBusy(false);
      setPendingPublish(null);
    }
  }

  function discardDraft() {
    forget(storageKey);
    setWorkType(editing?.workType ?? 'homework');
    setSubjectId(editing?.subjectId ?? subjects[0]?.id ?? '');
    setTitle(editing?.title ?? '');
    setInstructions(editing?.instructions ?? '');
    setDueAt(toLocalInput(editing?.dueAt ?? null) || (defaultDueAt ?? ''));
    setMaxScore(String(editing?.maxScore ?? 10));
    setRubricId(editing?.rubricId ?? '');
    setOffsets(editing?.reminderOffsets ?? defaultReminderOffsets('homework'));
    setRestored(false);
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
            variant="ghost"
            icon={<Icon name="eye" size={16} />}
            aria-pressed={showPreview}
            onClick={() => setShowPreview((value) => !value)}
          >
            {showPreview ? 'กลับไปแก้ไข' : 'ดูตัวอย่างที่นักเรียนเห็น'}
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => void submit(false)}>บันทึกฉบับร่าง</Button>
          <Button variant="primary" loading={busy} onClick={() => void submit(true)}>เผยแพร่ให้นักเรียน</Button>
        </>
      }
    >
      <div ref={body}>
        {/* What is filled in and what is not, in one line, before any of it is scrolled past. */}
        <nav className="work-form-rail" aria-label="ส่วนของแบบฟอร์ม">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`work-form-rail-step ${done[section.id] ? 'done' : ''}`}
              onClick={() => { setShowPreview(false); focusSection(section.id); }}
            >
              <span className="work-form-rail-mark" aria-hidden="true">
                {done[section.id] ? <Icon name="check" size={12} /> : null}
              </span>
              {section.label}
            </button>
          ))}
        </nav>

        {restored && (
          <div className="inline-warning" role="status">
            <Badge tone="info">ฉบับร่างในเครื่อง</Badge>
            <span>กู้คืนสิ่งที่พิมพ์ค้างไว้ครั้งก่อนแล้ว · ยังไม่ได้บันทึกขึ้นระบบ</span>
            <Button variant="ghost" size="sm" onClick={discardDraft}>เริ่มใหม่</Button>
          </div>
        )}

        {showPreview ? (
          /* The student's copy, assembled from exactly what will be written. Nothing here is fetched
             or reformatted, so a preview that looks right cannot be followed by a record that is not. */
          <section className="work-preview" aria-label="ตัวอย่างงานที่นักเรียนจะเห็น">
            <header>
              <Badge tone="brand">{workTypeLabels[workType]}</Badge>
              {subjectId && <Badge tone="neutral">{subjects.find((item) => item.id === subjectId)?.name}</Badge>}
            </header>
            <h3>{title.trim() || 'ยังไม่ได้ตั้งชื่องาน'}</h3>
            <dl className="work-preview-facts">
              <div><dt>กำหนดส่ง</dt><dd>{dueAt ? new Date(dueAt).toLocaleString('th-TH') : 'ยังไม่กำหนด'}</dd></div>
              <div><dt>คะแนนเต็ม</dt><dd>{Number.isFinite(effectiveMax) && effectiveMax > 0 ? `${effectiveMax} คะแนน` : 'ยังไม่กำหนด'}</dd></div>
              <div><dt>แจ้งเตือน</dt><dd>{offsets.length > 0 ? `${offsets.length} ครั้งก่อนกำหนดส่ง` : 'ไม่แจ้งเตือน'}</dd></div>
            </dl>
            <p className="work-preview-instructions">{instructions.trim() || 'ยังไม่ได้เขียนคำสั่งงาน'}</p>
            <p className="ui-field-hint">นี่คือสิ่งที่นักเรียนจะเห็นหลังกด “เผยแพร่ให้นักเรียน”</p>
          </section>
        ) : (
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(false); }}>
            <div id="work-section-basics">
              <FieldGroup title="ข้อมูลพื้นฐาน">
                <Field label="ประเภทงาน" hint="เลือกให้ตรงกับสิ่งที่นักเรียนต้องทำ ระบบจะตั้งการแจ้งเตือนให้เหมาะกับประเภท">
                  <Segmented
                    ariaLabel="ประเภทงาน"
                    value={workType}
                    onChange={(next) => { setWorkType(next); setOffsets(defaultReminderOffsets(next)); }}
                    options={workTypeOptions}
                  />
                </Field>
                <Field label="รายวิชา" hint="เว้นเป็น “ไม่ระบุวิชา” ได้ถ้าเป็นงานของห้อง">
                  <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                    <option value="">ไม่ระบุวิชา</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                  </select>
                </Field>
                <Field
                  label="ชื่องาน"
                  hint="ชื่อที่นักเรียนเห็นในรายการงาน"
                  {...(titleError ? { error: titleError } : {})}
                >
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => setTouched((current) => ({ ...current, title: true }))}
                    placeholder="เช่น ใบงานบทที่ 3 เรื่องระบบสุริยะ"
                    required
                  />
                </Field>
              </FieldGroup>
            </div>

            <div id="work-section-detail">
              <FieldGroup title="รายละเอียด" columns={1}>
                <Field label="คำสั่งที่นักเรียนจะเห็น" hint="อธิบายสั้น ๆ ว่าต้องทำอะไรและส่งอย่างไร">
                  <AutoTextarea value={instructions} onChange={setInstructions} minRows={3} maxRows={12} />
                </Field>
              </FieldGroup>
            </div>

            <div id="work-section-due">
              <FieldGroup title="กำหนดส่ง">
                <Field label="วันและเวลาที่ต้องส่ง" hint="เว้นว่างได้ถ้ายังไม่กำหนด">
                  <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                </Field>
                {/*
                  * Most deadlines are one of three days away, at the end of the school day.
                  * Assembling that in a datetime picker is six interactions for the common case.
                  *
                  * These are deliberately NOT inside a `Field`. A button is a labelable element, so
                  * a wrapping `<label>` takes over its accessible name — all four would have
                  * announced as "ตั้งอย่างเร็ว", and a tap on the caption would have fired the
                  * first one. A group with its own label says the same thing and stays operable.
                  */}
                <div className="work-due-presets-block" role="group" aria-label="ตั้งกำหนดส่งอย่างเร็ว">
                  <span className="ui-field-label">ตั้งอย่างเร็ว</span>
                  <div className="work-due-presets">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDueAt(inDays(1))}>พรุ่งนี้</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDueAt(inDays(3))}>อีก 3 วัน</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDueAt(inDays(7))}>สัปดาห์หน้า</Button>
                    {dueAt && <Button type="button" variant="ghost" size="sm" onClick={() => setDueAt('')}>ล้างกำหนดส่ง</Button>}
                  </div>
                  <span className="ui-field-hint">ตั้งเป็นเวลา 16:00 น. ของวันนั้น แก้ไขต่อได้</span>
                </div>
              </FieldGroup>
            </div>

            <div id="work-section-score">
              <FieldGroup title="การให้คะแนน">
                <Field label="เกณฑ์ (rubric)" hint="เลือกได้ถ้าต้องการให้คะแนนแยกตามหัวข้อ">
                  <select value={rubricId} onChange={(event) => setRubricId(event.target.value)}>
                    <option value="">ให้คะแนนแบบคะแนนเดียว</option>
                    {rubrics.filter((item) => item.status === 'active').map((item) => (
                      <option key={item.id} value={item.id}>{item.title} ({rubricMaxScore(item)} คะแนน)</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="คะแนนเต็ม"
                  hint={rubric ? 'คำนวณจากผลรวมของเกณฑ์' : 'กรอกคะแนนเต็มของงานนี้'}
                  {...(scoreError ? { error: scoreError } : {})}
                >
                  <input
                    type="number" min="1" inputMode="numeric"
                    value={rubric ? rubricMaxScore(rubric) : maxScore}
                    disabled={Boolean(rubric)}
                    onChange={(event) => setMaxScore(event.target.value)}
                    onBlur={() => setTouched((current) => ({ ...current, maxScore: true }))}
                  />
                </Field>
              </FieldGroup>
            </div>

            <div id="work-section-files">
              <FieldGroup title="ไฟล์แนบ" columns={1}>
                {editing && actorProfileId ? (
                  <AttachmentPanel
                    ownerType="assignment" ownerId={editing.id} uploadedBy={actorProfileId}
                    canUpload title="เอกสารประกอบงานนี้"
                  />
                ) : (
                  /* Files belong to a record that exists. Offering an upload here would either write
                     an attachment against a work that was never saved, or hold the file in the tab
                     and lose it on the reload this form is otherwise built to survive. */
                  <p className="ui-field-hint">
                    บันทึกงานก่อนหนึ่งครั้ง แล้วเปิดงานนี้อีกครั้งเพื่อแนบเอกสารประกอบ · ฉบับร่างก็แนบไฟล์ได้
                  </p>
                )}
              </FieldGroup>
            </div>

            <div id="work-section-reminders">
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
            </div>

            {warning && (
              <div className="inline-warning" role="status">
                <Badge tone="warning">ภาระงานสูง</Badge>
                <span>วันที่ {new Date(warning.dueDate).toLocaleDateString('th-TH')} ห้องนี้มีงานครบกำหนด {warning.count} รายการ</span>
              </div>
            )}
            {error && <p className="ui-field-message" role="alert">{error}</p>}
          </form>
        )}
      </div>
    </Modal>
  );
}
