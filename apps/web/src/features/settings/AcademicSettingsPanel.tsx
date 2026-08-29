import { useState } from 'react';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeSubjects } from '../../data/selectors';
import { categoryLabels, categoryWeightsFrom, gradeCategories, totalWeight } from '../../academic/gradebook';
import { gradeSchemeFrom } from '../../academic/gradeScheme';
import { rubricMaxScore } from '../../academic/rubric';
import { Badge, Button, Card, CardHeader, Field, FieldGroup, Modal } from '../../ui/components';
import type { Rubric, RubricCriterion } from '../../domain/types';

/**
 * Admin-facing academic configuration: the grading scheme, the gradebook weights and the rubric
 * templates teachers reuse. All three are stored as school records, never hard-coded in a screen.
 */
export function AcademicSettingsPanel({ canEdit, onMessage }: { canEdit: boolean; onMessage(message: string): void }) {
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const subjects = activeSubjects(snapshot);
  const scheme = gradeSchemeFrom(snapshot.settings);
  const weights = categoryWeightsFrom(snapshot.settings);

  const [editingRubric, setEditingRubric] = useState<Rubric | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveScheme(form: HTMLFormElement) {
    const data = new FormData(form);
    const bands = scheme.bands.map((band) => ({
      grade: band.grade,
      minPercentage: Number(data.get(`band-${band.grade}`) ?? band.minPercentage),
      label: band.label
    }));
    await repository.saveSetting('grade_scheme', { bands, belowGrade: scheme.belowGrade });
    onMessage('บันทึกเกณฑ์การตัดเกรดแล้ว');
  }

  async function saveWeights(form: HTMLFormElement) {
    const data = new FormData(form);
    const next = Object.fromEntries(gradeCategories.map((category) => [category, Number(data.get(category) ?? 0)]));
    const sum = Object.values(next).reduce((total, value) => total + value, 0);
    if (sum !== 100) { setError(`น้ำหนักรวมต้องเท่ากับ 100 (ตอนนี้ ${sum})`); return; }
    setError(null);
    await repository.saveSetting('gradebook_weights', next);
    onMessage('บันทึกสัดส่วนคะแนนแล้ว');
  }

  return (
    <>
      <Card>
        <CardHeader title="เกณฑ์การตัดเกรด" description="ใช้กับทุกหน้าจอ ทั้งของครู นักเรียน และผู้ปกครอง" />
        <form onSubmit={(event) => { event.preventDefault(); void saveScheme(event.currentTarget); }}>
          <FieldGroup columns={3}>
            {scheme.bands.map((band) => (
              <Field key={band.grade} label={`${band.grade} ตั้งแต่ (%)`}>
                <input name={`band-${band.grade}`} type="number" min="0" max="100" defaultValue={band.minPercentage} disabled={!canEdit} />
              </Field>
            ))}
          </FieldGroup>
          <p className="ui-field-hint">ต่ำกว่าเกณฑ์ต่ำสุดจะแสดงเป็น “{scheme.belowGrade}”</p>
          <Button variant="primary" disabled={!canEdit}>บันทึกเกณฑ์</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="สัดส่วนคะแนนในสมุดเกรด" description={`รวมปัจจุบัน ${totalWeight(weights)}%`} />
        <form onSubmit={(event) => { event.preventDefault(); void saveWeights(event.currentTarget); }}>
          <FieldGroup columns={3}>
            {gradeCategories.map((category) => (
              <Field key={category} label={`${categoryLabels[category]} (%)`}>
                <input name={category} type="number" min="0" max="100" defaultValue={weights[category]} disabled={!canEdit} />
              </Field>
            ))}
          </FieldGroup>
          {error && <p className="ui-field-message" role="alert">{error}</p>}
          <Button variant="primary" disabled={!canEdit}>บันทึกสัดส่วน</Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="เกณฑ์ให้คะแนน (rubric)"
          description="ครูเลือกใช้ซ้ำได้เมื่อสร้างงานหรือโครงงาน"
          action={canEdit && <Button variant="secondary" onClick={() => setCreating(true)}>+ สร้าง rubric</Button>}
        />
        {snapshot.rubrics.length === 0 ? (
          <p className="ui-field-hint">ยังไม่มี rubric · สร้างเกณฑ์แรกเพื่อให้คะแนนแยกตามหัวข้อ</p>
        ) : (
          <ul className="record-list">
            {snapshot.rubrics.map((rubric) => (
              <li key={rubric.id}>
                <div className="record-main">
                  <div>
                    <strong>{rubric.title}</strong>
                    <span>
                      {rubric.criteria.map((criterion) => `${criterion.label} ${criterion.maxScore}`).join(' · ')}
                      {' · รวม '}{rubricMaxScore(rubric)}{' คะแนน'}
                    </span>
                  </div>
                  <Badge tone={rubric.status === 'active' ? 'success' : 'neutral'}>
                    {rubric.status === 'active' ? 'ใช้งาน' : 'เก็บถาวร'}
                  </Badge>
                </div>
                {canEdit && (
                  <div className="record-actions">
                    <Button size="sm" variant="ghost" onClick={() => setEditingRubric(rubric)}>แก้ไข</Button>
                    {rubric.status === 'active' && (
                      <Button size="sm" variant="ghost" onClick={() => void repository.archiveRubric(rubric.id)}>เก็บถาวร</Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(creating || editingRubric) && (
        <RubricEditor
          rubric={editingRubric}
          subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
          onClose={() => { setCreating(false); setEditingRubric(null); }}
          onSave={async (input) => {
            await repository.saveRubric(input);
            onMessage(editingRubric ? 'แก้ไข rubric แล้ว' : 'สร้าง rubric แล้ว');
            setCreating(false);
            setEditingRubric(null);
          }}
        />
      )}
    </>
  );
}

function RubricEditor({ rubric, subjects, onClose, onSave }: {
  rubric: Rubric | null;
  subjects: Array<{ id: string; name: string }>;
  onClose(): void;
  onSave(input: { id?: string; title: string; subjectId: string | null; criteria: RubricCriterion[] }): Promise<void>;
}) {
  const [title, setTitle] = useState(rubric?.title ?? '');
  const [subjectId, setSubjectId] = useState(rubric?.subjectId ?? '');
  const [criteria, setCriteria] = useState<RubricCriterion[]>(
    rubric?.criteria ?? [{ id: 'content', label: 'เนื้อหา', maxScore: 10, description: '' }]
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = criteria.reduce((sum, criterion) => sum + (criterion.maxScore || 0), 0);

  return (
    <Modal
      wide
      title={rubric ? `แก้ไข ${rubric.title}` : 'สร้าง rubric'}
      description={`คะแนนเต็มรวม ${total} คะแนน · งานที่ใช้ rubric จะใช้ผลรวมนี้เป็นคะแนนเต็ม`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              onSave({ ...(rubric ? { id: rubric.id } : {}), title, subjectId: subjectId || null, criteria })
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ'))
                .finally(() => setBusy(false));
            }}
          >
            บันทึก
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field label="ชื่อเกณฑ์">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เกณฑ์ให้คะแนนโครงงาน" />
        </Field>
        <Field label="รายวิชา">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">ใช้ได้ทุกวิชา</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </Field>
      </FieldGroup>

      <div className="rubric-grid">
        {criteria.map((criterion, index) => (
          <div key={criterion.id} className="rubric-row">
            <div>
              <input
                value={criterion.label}
                placeholder="หัวข้อ"
                onChange={(event) => setCriteria((current) => current.map((item, position) =>
                  position === index ? { ...item, label: event.target.value } : item))}
              />
              <input
                value={criterion.description}
                placeholder="คำอธิบายสั้น ๆ"
                onChange={(event) => setCriteria((current) => current.map((item, position) =>
                  position === index ? { ...item, description: event.target.value } : item))}
              />
            </div>
            <input
              type="number" min="1" value={criterion.maxScore}
              onChange={(event) => setCriteria((current) => current.map((item, position) =>
                position === index ? { ...item, maxScore: Number(event.target.value) } : item))}
            />
            <Button
              size="sm" variant="ghost"
              onClick={() => setCriteria((current) => current.filter((_, position) => position !== index))}
            >
              ลบ
            </Button>
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        onClick={() => setCriteria((current) => [
          ...current,
          { id: `criterion-${current.length + 1}-${Math.random().toString(36).slice(2, 6)}`, label: '', maxScore: 5, description: '' }
        ])}
      >
        + เพิ่มหัวข้อ
      </Button>

      {error && <p className="ui-field-message" role="alert">{error}</p>}
    </Modal>
  );
}
