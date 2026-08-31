import { useState } from 'react';
import { Badge, Button, Field, Modal, Segmented } from '../../ui/components';
import {
  CHOICE_IDS, MAXIMUM_CHOICES, MINIMUM_CHOICES, difficultyLabels, questionTypeLabels, validateDraft,
  type Difficulty, type QuestionCategory, type QuestionDraft, type QuestionType
} from './questionBank';
import type { Subject } from '../../domain/types';

const typeOptions = (Object.keys(questionTypeLabels) as QuestionType[])
  .map((value) => ({ value, label: questionTypeLabels[value] }));
const difficultyOptions = (Object.keys(difficultyLabels) as Difficulty[])
  .map((value) => ({ value, label: difficultyLabels[value] }));

/**
 * Writing one question.
 *
 * The shape of the form follows the question type rather than showing every field at once: a
 * true/false question has no choices to write, and a short answer has no choices to pick a key from.
 * Switching type keeps what still applies and drops what cannot — the answer key especially, because
 * a key carried over from another shape marks every attempt wrong and does it silently.
 */
export function QuestionEditor({ draft, subjects, categories, onChange, onSave, onClose, busy, error }: {
  draft: QuestionDraft;
  subjects: Subject[];
  categories: QuestionCategory[];
  onChange(next: QuestionDraft): void;
  onSave(): void;
  onClose(): void;
  busy: boolean;
  error: string | null;
}) {
  const [tagText, setTagText] = useState(draft.tags.join(', '));
  const problems = validateDraft(draft);
  const isChoice = draft.questionType === 'multiple_choice' || draft.questionType === 'multiple_select';
  const relevantCategories = categories.filter(
    (category) => category.status === 'active'
      && (category.subjectId === null || category.subjectId === draft.subjectId)
  );

  function setType(questionType: QuestionType) {
    onChange({
      ...draft, questionType,
      answerKey: [],
      choices: questionType === 'true_false'
        ? [{ id: 'true', text: 'ถูก' }, { id: 'false', text: 'ผิด' }]
        : (draft.choices.length >= MINIMUM_CHOICES
          ? draft.choices
          : [{ id: 'a', text: '' }, { id: 'b', text: '' }])
    });
  }

  function setChoiceText(id: string, text: string) {
    onChange({ ...draft, choices: draft.choices.map((choice) => choice.id === id ? { ...choice, text } : choice) });
  }

  function toggleAnswer(id: string) {
    const selected = draft.answerKey.includes(id);
    if (draft.questionType === 'multiple_select') {
      onChange({
        ...draft,
        answerKey: selected ? draft.answerKey.filter((answer) => answer !== id) : [...draft.answerKey, id]
      });
      return;
    }
    onChange({ ...draft, answerKey: selected ? [] : [id] });
  }

  function addChoice() {
    const used = new Set(draft.choices.map((choice) => choice.id));
    const next = CHOICE_IDS.find((id) => !used.has(id));
    if (!next) return;
    onChange({ ...draft, choices: [...draft.choices, { id: next, text: '' }] });
  }

  function removeChoice(id: string) {
    onChange({
      ...draft,
      choices: draft.choices.filter((choice) => choice.id !== id),
      answerKey: draft.answerKey.filter((answer) => answer !== id)
    });
  }

  return (
    <Modal
      wide
      title={draft.id ? 'แก้ไขคำถาม' : 'เพิ่มคำถามใหม่'}
      description="คำถามในคลังใช้ซ้ำได้ทั้งกิจกรรมและข้อสอบ · แก้ทีหลังไม่กระทบข้อสอบที่สอบไปแล้ว"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={onSave} loading={busy} disabled={problems.length > 0}>
            บันทึกคำถาม
          </Button>
        </>
      }
    >
      <Field label="ชนิดคำถาม">
        <Segmented options={typeOptions} value={draft.questionType} onChange={setType} ariaLabel="ชนิดคำถาม" />
      </Field>

      <Field label="คำถาม" hint="พิมพ์คำถามให้อ่านออกเสียงได้ นักเรียนจะเห็นข้อความนี้ตรง ๆ">
        <textarea
          rows={3} value={draft.prompt} placeholder="เช่น ดาวเคราะห์ดวงใดอยู่ใกล้ดวงอาทิตย์ที่สุด"
          onChange={(event) => onChange({ ...draft, prompt: event.target.value })} required
        />
      </Field>

      {isChoice && (
        <div className="choice-editor">
          <div className="choice-editor-head">
            <span>ตัวเลือก · กดวงกลมหน้าข้อเพื่อทำเครื่องหมายว่าเป็นคำตอบที่ถูก</span>
            <Button
              size="sm" onClick={addChoice}
              disabled={draft.choices.length >= MAXIMUM_CHOICES}
            >
              เพิ่มตัวเลือก
            </Button>
          </div>
          {draft.choices.map((choice) => {
            const correct = draft.answerKey.includes(choice.id);
            return (
              <div key={choice.id} className={`choice-row ${correct ? 'correct' : ''}`.trim()}>
                <button
                  type="button" className="choice-mark" onClick={() => toggleAnswer(choice.id)}
                  aria-pressed={correct}
                  aria-label={`ทำเครื่องหมายว่าตัวเลือก ${choice.id.toUpperCase()} เป็นคำตอบที่ถูก`}
                >
                  {choice.id.toUpperCase()}
                </button>
                <input
                  value={choice.text} placeholder={`ตัวเลือก ${choice.id.toUpperCase()}`}
                  onChange={(event) => setChoiceText(choice.id, event.target.value)}
                />
                <Button
                  size="sm" variant="ghost" onClick={() => removeChoice(choice.id)}
                  disabled={draft.choices.length <= MINIMUM_CHOICES}
                >
                  ลบ
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {draft.questionType === 'true_false' && (
        <Field label="คำตอบที่ถูก">
          <Segmented
            options={[{ value: 'true', label: 'ถูก' }, { value: 'false', label: 'ผิด' }]}
            value={draft.answerKey[0] ?? ''}
            onChange={(value) => onChange({ ...draft, answerKey: [value] })}
            ariaLabel="คำตอบที่ถูก"
          />
        </Field>
      )}

      {draft.questionType === 'short_answer' && (
        <Field
          label="คำตอบที่ยอมรับ"
          hint="คั่นด้วยเครื่องหมายจุลภาคเพื่อรับได้หลายคำตอบ เช่น ดาวพุธ, พุธ, Mercury"
        >
          <input
            value={draft.answerKey.join(', ')}
            placeholder="ดาวพุธ, Mercury"
            onChange={(event) => onChange({
              ...draft, answerKey: event.target.value.split(',').map((answer) => answer.trim())
            })}
          />
        </Field>
      )}

      <div className="form-grid">
        <Field label="รายวิชา">
          <select
            value={draft.subjectId ?? ''}
            onChange={(event) => onChange({
              ...draft, subjectId: event.target.value || null,
              // A category belonging to the old subject would file this question out of sight.
              categoryId: null
            })}
          >
            <option value="">ไม่ระบุรายวิชา</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </Field>
        <Field label="หมวดหมู่" hint={relevantCategories.length === 0 ? 'ยังไม่มีหมวดหมู่สำหรับรายวิชานี้' : undefined}>
          <select
            value={draft.categoryId ?? ''}
            onChange={(event) => onChange({ ...draft, categoryId: event.target.value || null })}
          >
            <option value="">ไม่ระบุหมวดหมู่</option>
            {relevantCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="form-grid">
        <Field label="ระดับชั้น"><input value={draft.gradeLevel} placeholder="เช่น ป.4" onChange={(event) => onChange({ ...draft, gradeLevel: event.target.value })} /></Field>
        <Field label="หน่วยการเรียน"><input value={draft.unit} placeholder="เช่น หน่วยที่ 3" onChange={(event) => onChange({ ...draft, unit: event.target.value })} /></Field>
      </div>

      <div className="form-grid">
        <Field label="เรื่อง"><input value={draft.topic} placeholder="เช่น ระบบสุริยะ" onChange={(event) => onChange({ ...draft, topic: event.target.value })} /></Field>
        <Field label="คะแนน">
          <input
            type="number" min={0.5} step={0.5} value={draft.points}
            onChange={(event) => onChange({ ...draft, points: Number(event.target.value) })}
          />
        </Field>
      </div>

      <Field label="ระดับความยาก">
        <Segmented
          options={difficultyOptions} value={draft.difficulty}
          onChange={(difficulty) => onChange({ ...draft, difficulty })} ariaLabel="ระดับความยาก"
        />
      </Field>

      <Field label="คำอธิบายเฉลย" hint="นักเรียนเห็นหลังทำเสร็จเท่านั้น ช่วยให้ทบทวนได้ด้วยตัวเอง">
        <textarea
          rows={2} value={draft.explanation}
          placeholder="เช่น ดาวพุธโคจรใกล้ดวงอาทิตย์ที่สุดในบรรดาดาวเคราะห์ทั้งแปด"
          onChange={(event) => onChange({ ...draft, explanation: event.target.value })}
        />
      </Field>

      <Field label="ป้ายกำกับ" hint="คั่นด้วยจุลภาค ใช้ค้นหาทีหลัง เช่น ดาราศาสตร์, ทบทวนกลางภาค">
        <input
          value={tagText}
          onChange={(event) => {
            setTagText(event.target.value);
            onChange({ ...draft, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) });
          }}
        />
      </Field>

      {problems.length > 0 && (
        <div className="alert warning" role="status">
          ยังบันทึกไม่ได้: {problems.join(' · ')}
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      {draft.id && <p className="fine-print"><Badge tone="neutral">แก้ไขคำถามเดิม</Badge> ข้อสอบที่สอบไปแล้วใช้สำเนาของคำถามตอนนั้น จะไม่เปลี่ยนตาม</p>}
    </Modal>
  );
}
