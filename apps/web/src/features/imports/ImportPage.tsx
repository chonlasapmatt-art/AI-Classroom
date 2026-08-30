import { useState, type ChangeEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { matchColumn, readSheetFile, type SheetTable } from '../../data/spreadsheet';
import { StudentImportPanel } from './StudentImportPanel';

type ImportTarget = 'student' | 'teacher' | 'parent';
type StaffTarget = Exclude<ImportTarget, 'student'>;

interface FieldSpec { key: string; label: string; required: boolean; aliases: string[] }

// The student roster gets its own assistant — more formats, a mapping step, a row-by-row review —
// because it is the import a school actually runs and the one that arrives in the messiest shape.
// Teacher and parent lists are entered rarely and from a spreadsheet somebody made deliberately, so
// they stay on the straightforward path they have always used.
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

export function ImportPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [target, setTarget] = useState<ImportTarget>('student');
  const [table, setTable] = useState<SheetTable | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spec = target === 'student' ? null : staffTargets[target];
  const canImport = membership.role === 'admin' || membership.role === 'teacher';

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !spec) return;
    setMessage(null);
    try {
      const parsed = await readSheetFile(file);
      setTable(parsed);
      const mapping = spec.fields.map((field) => ({ field, index: matchColumn(parsed.columns, field.aliases) }));
      setRows(parsed.rows.map((row, index) => {
        const draft: DraftRow = { rowId: `row-${index}` };
        for (const { field, index: columnIndex } of mapping) {
          draft[field.key] = columnIndex >= 0 ? (row[columnIndex] ?? '') : '';
        }
        return draft;
      }));
      const missing = mapping.filter((item) => item.field.required && item.index < 0).map((item) => item.field.label);
      if (missing.length > 0) setMessage(`ไม่พบคอลัมน์: ${missing.join(', ')} — แก้ไขในตารางก่อนนำเข้าได้`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'อ่านไฟล์ไม่สำเร็จ');
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
      setMessage(`นำเข้า ${imported} รายการ${skipped > 0 ? ` · ข้าม ${skipped} แถว` : ''}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">นำเข้าข้อมูล</span>
          <h1>นำเข้ารายชื่อ</h1>
          <p>อ่านไฟล์ให้อัตโนมัติ · ตรวจแก้ได้ทุกช่องก่อนบันทึก · บันทึกผ่านระบบนักเรียนเดิม</p>
        </div>
      </section>

      <div className="toolbar">
        <div className="segmented">
          {(Object.keys(targetLabels) as ImportTarget[]).map((key) => (
            <button
              key={key}
              className={target === key ? 'active present' : ''}
              onClick={() => { setTarget(key); setRows([]); setTable(null); setMessage(null); }}
            >
              {targetLabels[key]}
            </button>
          ))}
        </div>
        {spec && (
          <label className="upload-button">
            เลือกไฟล์
            <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(event) => void pickFile(event)} disabled={!canImport} />
          </label>
        )}
      </div>

      {target === 'student' ? <StudentImportPanel /> : (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>รูปแบบไฟล์ {spec!.label}</h2>
              <span className="status-chip">{spec!.hint}</span>
            </div>
            {table && <p className="muted">คอลัมน์ที่พบในไฟล์: {table.columns.join(', ') || '—'}</p>}
            {!table && <p className="muted">ยังไม่ได้เลือกไฟล์ · แถวแรกของไฟล์ต้องเป็นหัวตาราง</p>}
          </section>

          {rows.length > 0 && (
            <section className="panel data-panel">
              <div className="panel-heading">
                <h2>ตรวจสอบ {rows.length} แถว</h2>
                <button className="primary-button" disabled={busy || !canImport} onClick={() => void runImport()}>
                  {busy ? 'กำลังนำเข้า...' : `นำเข้า ${rows.length} รายการ`}
                </button>
              </div>
              <div className="table-scroll">
                <table className="grid-table">
                  <thead>
                    <tr>
                      {spec!.fields.map((field) => <th key={field.key}>{field.label}{field.required ? ' *' : ''}</th>)}
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowId}>
                        {spec!.fields.map((field) => (
                          <td key={field.key}>
                            <input
                              value={row[field.key] ?? ''}
                              onChange={(event) => editCell(row.rowId, field.key, event.target.value)}
                            />
                          </td>
                        ))}
                        <td><button className="text-button" onClick={() => removeRow(row.rowId)}>ลบแถว</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
