// Bringing a school's existing question bank in from a file.
//
// The shape is the roster importer's, for the same reason: a file is read, what was understood is
// shown, the teacher fixes what the reader got wrong, and only then does anything reach the
// database. Nothing is saved from the preview — every accepted row goes through `saveBankQuestion`,
// the same call the manual editor makes, so the subject-owner check and the audit trail behave
// exactly as they always do.
//
// Rows the reader could not make sense of stay on screen with the reason. A file of three hundred
// questions with four bad rows is a successful import and four rows to fix, and an importer that
// quietly dropped them would leave a teacher believing all three hundred arrived.

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { readSheetFile, type SheetTable } from '../../data/spreadsheet';
import { Badge, Button, Card, CardHeader, DataTable, Field, Modal, Toolbar } from '../../ui/components';
import {
  difficultyLabels, questionTypeLabels, saveBankQuestion, saveQuestionCategory,
  type QuestionCategory
} from './questionBank';
import {
  importTemplateCsv, matchCategoryId, newCategoryNames, planColumns, planImport,
  type ColumnPlan, type ImportPlan
} from './questionImport';

interface Subject { id: string; name: string }

const fieldLabels: Record<string, string> = {
  prompt: 'คำถาม', questionType: 'ชนิดคำถาม', answer: 'เฉลย', points: 'คะแนน',
  difficulty: 'ระดับความยาก', category: 'หมวดหมู่', gradeLevel: 'ระดับชั้น',
  unit: 'บทเรียน', topic: 'หัวข้อ', explanation: 'คำอธิบาย', tags: 'แท็ก'
};

export function QuestionImportPanel({ schoolId, subjects, categories, onClose, onImported }: {
  schoolId: string;
  subjects: Subject[];
  categories: QuestionCategory[];
  onClose(): void;
  onImported(message: string): void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<SheetTable | null>(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ColumnPlan | null>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [createCategories, setCreateCategories] = useState(true);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const result: ImportPlan | null = useMemo(
    () => (table && plan ? planImport(table, plan, subjectId || null, false) : null),
    [table, plan, subjectId]
  );
  const missingCategories = useMemo(
    () => (result ? newCategoryNames(result.rows, categories) : []),
    [result, categories]
  );

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true); setError(null);
    try {
      const sheet = await readSheetFile(file);
      if (sheet.rows.length === 0) throw new Error('ไฟล์นี้ไม่มีข้อมูลใต้หัวตาราง');
      setTable(sheet);
      setPlan(planColumns(sheet.columns));
      setFileName(file.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'อ่านไฟล์ไม่สำเร็จ');
      setTable(null); setPlan(null);
    } finally {
      setReading(false);
      // Clearing lets the same file be picked again after a correction, which is what a teacher
      // fixing their spreadsheet actually does next.
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function repoint(field: string, column: number) {
    setPlan((current) => (current ? { ...current, fields: { ...current.fields, [field]: column } } : current));
  }

  function repointChoice(slot: number, column: number) {
    setPlan((current) => {
      if (!current) return current;
      const choices = [...current.choices];
      choices[slot] = column;
      return { ...current, choices };
    });
  }

  async function run() {
    if (!result) return;
    setBusy(true); setError(null); setProgress(0);
    try {
      // Categories first: a question saved before the category it names exists would be filed
      // under nothing, and the teacher would have to sort three hundred of them by hand.
      let known = categories.map((category) => ({ id: category.id, name: category.name }));
      if (createCategories) {
        for (const name of missingCategories) {
          const id = await saveQuestionCategory({ schoolId, subjectId: subjectId || null, name });
          known = [...known, { id, name }];
        }
      }

      const ready = result.rows.filter((row) => row.problems.length === 0);
      let saved = 0;
      const failures: string[] = [];
      for (const row of ready) {
        try {
          await saveBankQuestion(schoolId, {
            ...row.draft,
            categoryId: matchCategoryId(row.categoryName, known)
          });
          saved += 1;
        } catch (reason) {
          // One refused row does not abandon the rest. The server refuses per question — a subject
          // this teacher does not own, most often — and stopping would leave a half-imported file
          // with no way to tell which half.
          failures.push(`บรรทัด ${row.line}: ${reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ'}`);
        }
        setProgress(saved + failures.length);
      }

      const parts = [`นำเข้าสำเร็จ ${saved} ข้อ`];
      if (result.blocked > 0) parts.push(`ข้าม ${result.blocked} ข้อที่ยังมีปัญหา`);
      if (failures.length > 0) parts.push(`เซิร์ฟเวอร์ปฏิเสธ ${failures.length} ข้อ`);
      onImported(parts.join(' · '));
      if (failures.length > 0) setError(failures.slice(0, 5).join('\n'));
      else onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    // A byte order mark, because Excel on Windows opens a UTF-8 CSV without one as mojibake and a
    // template a school cannot read is worse than no template. Written as an escape rather than
    // pasted: a literal BOM inside a source file is invisible and reads as a stray character.
    const byteOrderMark = '\uFEFF';
    const blob = new Blob([`${byteOrderMark}${importTemplateCsv()}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question-bank-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      title="นำเข้าคำถามจากไฟล์"
      description="รองรับ .csv .tsv และ .xlsx · ไฟล์ที่โรงเรียนมีอยู่แล้วใช้ได้เลย ไม่ต้องจัดคอลัมน์ใหม่"
      onClose={onClose}
      wide
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>ปิด</Button>
          <Button
            variant="primary" loading={busy}
            disabled={!result || result.ready === 0 || busy}
            onClick={() => void run()}
          >
            {busy ? `กำลังนำเข้า ${progress}/${result?.ready ?? 0}` : `นำเข้า ${result?.ready ?? 0} ข้อ`}
          </Button>
        </>
      }
    >
      <Toolbar>
        <Field label="ไฟล์คำถาม">
          <input
            ref={fileInput} type="file" accept=".csv,.tsv,.txt,.xlsx"
            onChange={(event) => void readFile(event)} disabled={reading || busy}
          />
        </Field>
        <Field label="วิชา" hint="คำถามที่นำเข้าทั้งไฟล์จะถูกผูกกับวิชานี้">
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={busy}>
            <option value="">ไม่ระบุวิชา</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </Field>
        <Button onClick={downloadTemplate}>ดาวน์โหลดไฟล์ตัวอย่าง</Button>
      </Toolbar>

      {error && <div className="alert error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</div>}

      {!table ? (
        <p className="field-hint">
          เลือกไฟล์เพื่อดูตัวอย่างก่อนบันทึก · ระบบเดาคอลัมน์ให้เอง และแก้เองได้ถ้าเดาผิด
          {' '}เฉลยเขียนเป็นตัวอักษรข้อ (A หรือ A,C), เลข (1 หรือ 1,3) หรือข้อความของตัวเลือกก็ได้
        </p>
      ) : (
        <>
          <Card padded={false}>
            <CardHeader
              title={`อ่านได้ ${result?.rows.length ?? 0} แถวจาก ${fileName}`}
              description={
                result && result.blocked > 0
                  ? `พร้อมนำเข้า ${result.ready} ข้อ · ยังมีปัญหา ${result.blocked} ข้อ (ข้ามไปก่อนได้ แล้วแก้ในไฟล์แล้วนำเข้าใหม่)`
                  : `พร้อมนำเข้าทั้งหมด ${result?.ready ?? 0} ข้อ`
              }
            />
          </Card>

          <details className="access-code-options">
            <summary>คอลัมน์ที่ระบบเดาไว้ · กดเพื่อแก้</summary>
            <div className="import-mapping-grid">
              {Object.entries(fieldLabels).map(([field, label]) => (
                <Field key={field} label={label}>
                  <select
                    value={plan?.fields[field] ?? -1}
                    onChange={(event) => repoint(field, Number(event.target.value))}
                    disabled={busy}
                  >
                    <option value={-1}>— ไม่มีในไฟล์ —</option>
                    {table.columns.map((column, index) => (
                      <option key={index} value={index}>{column || `คอลัมน์ ${index + 1}`}</option>
                    ))}
                  </select>
                </Field>
              ))}
              {(plan?.choices ?? []).map((column, slot) => (
                <Field key={`choice-${slot}`} label={`ตัวเลือก ${String.fromCharCode(65 + slot)}`}>
                  <select
                    value={column} onChange={(event) => repointChoice(slot, Number(event.target.value))}
                    disabled={busy}
                  >
                    <option value={-1}>— ไม่มีในไฟล์ —</option>
                    {table.columns.map((name, index) => (
                      <option key={index} value={index}>{name || `คอลัมน์ ${index + 1}`}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </details>

          {missingCategories.length > 0 && (
            <div className="alert warning" role="note">
              <label>
                <input
                  type="checkbox" checked={createCategories} disabled={busy}
                  onChange={(event) => setCreateCategories(event.target.checked)}
                />
                {' '}สร้างหมวดหมู่ใหม่ {missingCategories.length} หมวดที่ยังไม่มีในคลัง
              </label>
              <p className="field-hint">{missingCategories.join(' · ')}</p>
            </div>
          )}

          <DataTable
            caption="ตัวอย่างคำถามที่จะนำเข้า"
            head={<tr><th>บรรทัด</th><th>คำถาม</th><th>ชนิด</th><th>เฉลย</th><th>คะแนน</th><th>ระดับ</th><th>หมวดหมู่</th><th>สถานะ</th></tr>}
          >
            {(result?.rows ?? []).slice(0, 50).map((row) => (
              <tr key={row.line}>
                <td>{row.line}</td>
                <td>{row.draft.prompt || <span className="field-hint">— ว่าง —</span>}</td>
                <td>{questionTypeLabels[row.draft.questionType]}</td>
                <td>
                  {row.draft.answerKey.length > 0
                    ? row.draft.answerKey.map((key) => key.toUpperCase()).join(', ')
                    : <span className="field-hint">—</span>}
                </td>
                <td>{row.draft.points}</td>
                <td>{difficultyLabels[row.draft.difficulty]}</td>
                <td>{row.categoryName || <span className="field-hint">—</span>}</td>
                <td>
                  {row.problems.length === 0
                    ? <Badge tone="success">พร้อม</Badge>
                    : <Badge tone="danger">{row.problems[0]}</Badge>}
                </td>
              </tr>
            ))}
          </DataTable>
          {(result?.rows.length ?? 0) > 50 && (
            <p className="field-hint">แสดง 50 แถวแรกจาก {result?.rows.length} แถว · การนำเข้าจะทำครบทุกแถวที่พร้อม</p>
          )}
        </>
      )}
    </Modal>
  );
}
