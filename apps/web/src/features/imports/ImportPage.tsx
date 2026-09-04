import { useState, type ChangeEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { matchColumn, type SheetTable } from '../../data/spreadsheet';
import { acceptedImportExtensions, readImportFile, type ParsedImportFile } from '../../data/importParsing';
import { StudentImportPanel } from './StudentImportPanel';
import {
  Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, PageHeader, Segmented, Stat, Toolbar
} from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

type ImportTarget = 'student' | 'teacher' | 'parent';
type StaffTarget = Exclude<ImportTarget, 'student'>;

interface FieldSpec { key: string; label: string; required: boolean; aliases: string[] }

// All roster targets use the same local reader now. Student lists get the full mapping assistant;
// teacher and parent lists get the lighter review table with automatic header/header-less detection.
const staffTargets: Record<StaffTarget, { label: string; hint: string; fields: FieldSpec[] }> = {
  teacher: {
    label: 'ครู',
    hint: 'คอลัมน์ที่ใช้: teacher_code, display_name, email, subject',
    fields: [
      { key: 'teacherCode', label: 'รหัสครู', required: true, aliases: ['teacher_code', 'code', 'รหัสครู'] },
      { key: 'displayName', label: 'ชื่อ-สกุล', required: true, aliases: ['display_name', 'name', 'ชื่อ', 'ชื่อ-สกุล'] },
      { key: 'email', label: 'อีเมล', required: false, aliases: ['email', 'mail', 'อีเมล'] },
      { key: 'subject', label: 'กลุ่มสาระ', required: false, aliases: ['subject', 'วิชา', 'กลุ่มสาระ'] }
    ]
  },
  parent: {
    label: 'ผู้ปกครอง',
    hint: 'คอลัมน์ที่ใช้: student_code, parent_name, relationship, contact',
    fields: [
      { key: 'studentCode', label: 'รหัสนักเรียน', required: true, aliases: ['student_code', 'รหัสนักเรียน'] },
      { key: 'parentName', label: 'ชื่อผู้ปกครอง', required: true, aliases: ['parent_name', 'name', 'ชื่อผู้ปกครอง'] },
      { key: 'relationship', label: 'ความสัมพันธ์', required: false, aliases: ['relationship', 'relation', 'ความสัมพันธ์'] },
      { key: 'contact', label: 'เบอร์ติดต่อ', required: false, aliases: ['contact', 'phone', 'tel', 'เบอร์', 'เบอร์ติดต่อ'] }
    ]
  }
};

const targetLabels: Record<ImportTarget, string> = { student: 'นักเรียน', teacher: 'ครู', parent: 'ผู้ปกครอง' };

type DraftRow = Record<string, string> & { rowId: string };

function looksLikeCode(value: string): boolean {
  const clean = value.trim();
  return /^\d{3,}$/.test(clean) || /^[a-z]{1,8}[-\s]?\d{3,}$/i.test(clean);
}

function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/** Maps both headed and header-less staff lists without making the user build a mapping first. */
function buildStaffRows(table: SheetTable, fields: FieldSpec[]): { rows: DraftRow[]; headerless: boolean } {
  const hasHeader = fields.some((field) => matchColumn(table.columns, field.aliases) >= 0);
  const sourceRows = hasHeader ? table.rows : [table.columns, ...table.rows];
  const width = Math.max(table.columns.length, ...sourceRows.map((row) => row.length), 0);
  const samples = sourceRows.slice(0, 20);
  const indexByField = new Map<string, number>();

  if (hasHeader) {
    for (const field of fields) indexByField.set(field.key, matchColumn(table.columns, field.aliases));
  } else {
    const used = new Set<number>();
    const findColumn = (predicate: (value: string) => boolean): number => {
      for (let index = 0; index < width; index += 1) {
        if (used.has(index)) continue;
        const values = samples.map((row) => row[index] ?? '').filter((value) => value.trim().length > 0);
        if (values.length > 0 && values.filter(predicate).length / values.length >= 0.6) {
          used.add(index);
          return index;
        }
      }
      return -1;
    };
    const codeField = fields.find((field) => field.key === 'teacherCode' || field.key === 'studentCode');
    const emailField = fields.find((field) => field.key === 'email');
    const contactField = fields.find((field) => field.key === 'contact');
    const nameField = fields.find((field) => field.key === 'displayName' || field.key === 'parentName');
    if (codeField) indexByField.set(codeField.key, findColumn(looksLikeCode));
    if (emailField) indexByField.set(emailField.key, findColumn(looksLikeEmail));
    if (contactField) indexByField.set(contactField.key, findColumn((value) => /\d[\d\s-]{5,}/.test(value)));
    if (nameField) indexByField.set(nameField.key, findColumn((value) => /[\p{L}]/u.test(value) && !looksLikeCode(value)));
    for (const field of fields) {
      if (!indexByField.has(field.key)) indexByField.set(field.key, findColumn((value) => value.trim().length > 0));
    }
  }

  return {
    headerless: !hasHeader,
    rows: sourceRows
      .filter((row) => row.some((cell) => cell.trim().length > 0))
      .map((row, index) => {
        const draft: DraftRow = { rowId: `row-${index}` };
        for (const field of fields) {
          const columnIndex = indexByField.get(field.key) ?? -1;
          draft[field.key] = columnIndex >= 0 ? (row[columnIndex] ?? '').trim() : '';
        }
        return draft;
      })
  };
}

export function ImportPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [target, setTarget] = useState<ImportTarget>('student');
  const [table, setTable] = useState<SheetTable | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedImportFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [headerless, setHeaderless] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const spec = target === 'student' ? null : staffTargets[target];
  const canImport = membership.role === 'admin' || membership.role === 'teacher';

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !spec) return;

    try {
      const parsed = await readImportFile(file);
      const built = buildStaffRows(parsed.table, spec.fields);
      setParsedFile(parsed);
      setFileName(file.name);
      setTable(parsed.table);
      setHeaderless(built.headerless);
      setRows(built.rows);
      const missing = spec.fields.filter((field) => field.required && !built.rows.some((row) => (row[field.key] ?? '').trim())).map((field) => field.label);
      if (missing.length > 0) toast(`ยังไม่พบข้อมูล${missing.join(', ')} — ตรวจแก้ในตารางก่อนนำเข้าได้`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'อ่านไฟล์ไม่สำเร็จ', { tone: 'error' });
    }
    event.target.value = '';
  }

  function editCell(rowId: string, key: string, value: string) {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, [key]: value } : row)));
  }

  function removeRow(rowId: string) {
    setRows((current) => current.filter((row) => row.rowId !== rowId));
  }

  async function runImport() {
    if (!spec) return;
    setBusy(true);
    let imported = 0;
    let skipped = 0;
    try {
      for (const row of rows) {
        const missingRequired = spec.fields.some((field) => field.required && !(row[field.key] ?? '').trim());
        if (missingRequired) { skipped += 1; continue; }

        if (target === 'teacher') {
          await repository.saveTeacher({
            teacherCode: row.teacherCode!.trim(), displayName: row.displayName!.trim(),
            email: (row.email ?? '').trim(), subject: (row.subject ?? '').trim()
          });
        } else {
          const student = snapshot.students.find((item) => item.studentCode === (row.studentCode ?? '').trim());
          if (!student) { skipped += 1; continue; }
          await repository.saveParentLink({
            studentId: student.id, parentName: row.parentName!.trim(),
            relationship: (row.relationship ?? 'ผู้ปกครอง').trim(), contact: (row.contact ?? '').trim()
          });
        }
        imported += 1;
      }
      setRows([]);
      setTable(null);
      toast(`นำเข้า ${imported} รายการ${skipped > 0 ? ` · ข้าม ${skipped} แถว` : ''}`);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'นำเข้าไม่สำเร็จ', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Why one row will not be written, in the words of the person reading the table.
   *
   * The import used to count these silently and report "ข้าม 12 แถว" once it was over, which told
   * nobody which twelve or what was wrong with them. Now the row says so while it can still be
   * fixed in place.
   */
  function rowProblem(row: DraftRow): string | null {
    if (!spec) return null;
    const missing = spec.fields.filter((field) => field.required && !(row[field.key] ?? '').trim());
    if (missing.length > 0) return `ยังไม่มี${missing.map((field) => field.label).join(' และ ')}`;
    if (target === 'parent') {
      const code = (row.studentCode ?? '').trim();
      if (!snapshot.students.some((item) => item.studentCode === code)) return `ไม่พบนักเรียนรหัส ${code} ในโรงเรียนนี้`;
    }
    return null;
  }

  const problems = rows.map(rowProblem);
  const readyCount = problems.filter((problem) => problem === null).length;

  return (
    <>
      <PageHeader
        eyebrow="นำเข้าข้อมูล"
        title="นำเข้ารายชื่อ"
        description="อ่านไฟล์ให้อัตโนมัติ · ตรวจแก้ได้ทุกช่องก่อนบันทึก · บันทึกผ่านระบบเดิมทั้งหมด"
      />

      <Toolbar>
        {/* Was three hand-built buttons whose selected state borrowed the attendance "present" green,
            so the chosen tab looked like somebody had been marked in. */}
        <Segmented
          ariaLabel="ประเภทรายชื่อที่จะนำเข้า"
          value={target}
          onChange={(next) => { setTarget(next); setRows([]); setTable(null); setParsedFile(null); setFileName(''); setHeaderless(false); }}
          options={(Object.keys(targetLabels) as ImportTarget[]).map((key) => ({ value: key, label: targetLabels[key] }))}
        />
      </Toolbar>

      {target === 'student' ? <StudentImportPanel /> : (
        <>
          <Card>
            <CardHeader
              title={`นำเข้ารายชื่อ${targetLabels[target]}`}
              description={spec!.hint}
              {...(fileName ? { action: <Badge tone="info">{fileName}</Badge> } : {})}
            />
            <Field label="ไฟล์รายชื่อ" hint="รองรับ Excel, CSV, TSV, TXT, Word และ PDF ที่มีตัวอักษร (ไม่ใช่ภาพสแกน)">
              <input type="file" accept={acceptedImportExtensions} onChange={(event) => void pickFile(event)} disabled={!canImport} />
            </Field>
            {table && <p className="field-hint">คอลัมน์ที่พบในไฟล์: {table.columns.join(', ') || '—'}</p>}
            {parsedFile?.notes.map((note) => <p key={note} className="field-hint">{note}</p>)}
            {headerless && (
              <p className="import-guess-note">
                <Icon name="info" size={16} />
                ไฟล์นี้ไม่มีหัวตาราง ระบบเดาคอลัมน์จากข้อมูลให้แล้ว กรุณาตรวจสอบก่อนบันทึก
              </p>
            )}
            {!table && (
              <EmptyState
                icon={<Icon name="import" size={28} />}
                title="ยังไม่ได้เลือกไฟล์"
                description="เลือกไฟล์รายชื่อด้านบน ระบบจะอ่านและจับคู่คอลัมน์ให้เอง แล้วให้ตรวจแก้ก่อนบันทึกเสมอ"
              />
            )}
          </Card>

          {rows.length > 0 && (
            <>
              <div className="ui-stat-grid">
                <Stat label="แถวในไฟล์" value={rows.length} hint="ไม่นับแถวว่าง" tone="brand" icon={<Icon name="import" size={18} />} />
                <Stat label="พร้อมนำเข้า" value={readyCount} hint="ข้อมูลครบตามที่ต้องการ" tone={readyCount > 0 ? 'success' : 'neutral'} icon={<Icon name="check" size={18} />} />
                <Stat
                  label="ต้องแก้ก่อน"
                  value={rows.length - readyCount}
                  hint={rows.length === readyCount ? 'ไม่มีแถวที่ติดปัญหา' : 'ดูเหตุผลท้ายแถว'}
                  tone={rows.length === readyCount ? 'success' : 'warning'}
                  icon={<Icon name="warning" size={18} />}
                />
              </div>

              <Card>
                <CardHeader
                  title={`ตรวจสอบ ${rows.length} แถว`}
                  description="แก้ไขในตารางได้ทันที แถวที่ยังติดปัญหาจะไม่ถูกบันทึกและไม่กระทบแถวอื่น"
                  action={(
                    <Button
                      variant="primary"
                      loading={busy}
                      disabled={!canImport || readyCount === 0}
                      icon={<Icon name="upload" size={16} />}
                      onClick={() => void runImport()}
                    >
                      นำเข้า {readyCount} รายการ
                    </Button>
                  )}
                />
                <DataTable
                  caption={`รายชื่อ${targetLabels[target]}ที่กำลังจะนำเข้า`}
                  head={(
                    <tr>
                      {spec!.fields.map((field) => <th key={field.key}>{field.label}{field.required ? ' *' : ''}</th>)}
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  )}
                >
                  {rows.map((row, index) => {
                    const problem = problems[index] ?? null;
                    return (
                      <tr key={row.rowId} className={problem ? 'import-row-problem' : ''}>
                        {spec!.fields.map((field) => (
                          <td key={field.key}>
                            <input
                              value={row[field.key] ?? ''}
                              // Without this every cell in the column announced itself identically,
                              // so there was no way to hear which row was being edited.
                              aria-label={`${field.label} แถวที่ ${index + 1}`}
                              onChange={(event) => editCell(row.rowId, field.key, event.target.value)}
                            />
                          </td>
                        ))}
                        <td>
                          {problem
                            ? <Badge tone="warning">{problem}</Badge>
                            : <Badge tone="success">พร้อม</Badge>}
                        </td>
                        <td>
                          <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={() => removeRow(row.rowId)}>
                            ลบแถว
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              </Card>
            </>
          )}
        </>
      )}

    </>
  );
}
