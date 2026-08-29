import { useMemo, useState, type ChangeEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import { matchColumn, readSheetFile, type SheetTable } from '../../data/spreadsheet';

type ImportTarget = 'student' | 'teacher' | 'parent';

interface FieldSpec { key: string; label: string; required: boolean; aliases: string[] }

const targets: Record<ImportTarget, { label: string; hint: string; fields: FieldSpec[] }> = {
  student: {
    label: 'นักเรียน',
    hint: 'คอลัมน์ที่ใช้: student_code, display_name (ไม่บังคับ: class)',
    fields: [
      { key: 'studentCode', label: 'รหัสนักเรียน', required: true, aliases: ['student_code', 'studentcode', 'รหัสนักเรียน', 'รหัส'] },
      { key: 'displayName', label: 'ชื่อ-สกุล', required: true, aliases: ['display_name', 'name', 'fullname', 'ชื่อ', 'ชื่อสกุล', 'ชื่อ-สกุล'] },
      { key: 'className', label: 'ห้องเรียน', required: false, aliases: ['class', 'classroom', 'ห้อง', 'ห้องเรียน'] }
    ]
  },
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

type DraftRow = Record<string, string> & { rowId: string };

export function ImportPage() {
  const { membership } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const [target, setTarget] = useState<ImportTarget>('student');
  const [table, setTable] = useState<SheetTable | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [classId, setClassId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spec = targets[target];
  const canImport = membership.role === 'admin' || membership.role === 'teacher';
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];
  const selectedClassId = classId || classes[0]?.id || '';

  const duplicates = useMemo(() => {
    if (target !== 'student') return new Set<string>();
    const existing = new Set(snapshot.students.map((item) => item.studentCode));
    return new Set(rows.filter((row) => existing.has(row.studentCode ?? '')).map((row) => row.rowId));
  }, [rows, snapshot.students, target]);

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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
    setBusy(true);
    let imported = 0;
    let skipped = 0;
    try {
      for (const row of rows) {
        const missingRequired = spec.fields.some((field) => field.required && !(row[field.key] ?? '').trim());
        if (missingRequired) { skipped += 1; continue; }

        if (target === 'student') {
          if (duplicates.has(row.rowId)) { skipped += 1; continue; }
          const id = crypto.randomUUID();
          await repository.saveStudent({
            id, studentCode: row.studentCode!.trim(), displayName: row.displayName!.trim(),
            avatarIndex: (snapshot.students.length + imported) * 7
          });
          const named = (row.className ?? '').trim();
          const targetClass = classes.find((item) => item.name === named)?.id ?? selectedClassId;
          if (targetClass && term) await repository.enrollStudent(id, targetClass, term.id);
        } else if (target === 'teacher') {
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
          <p>รองรับ CSV, TSV และ Excel (.xlsx) · ตรวจแก้และลบแถวได้ก่อนบันทึก</p>
        </div>
      </section>

      <div className="toolbar">
        <div className="segmented">
          {(Object.keys(targets) as ImportTarget[]).map((key) => (
            <button
              key={key}
              className={target === key ? 'active present' : ''}
              onClick={() => { setTarget(key); setRows([]); setTable(null); }}
            >
              {targets[key].label}
            </button>
          ))}
        </div>
        {target === 'student' && (
          <label>
            เข้าห้องเรียน
            <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <label className="upload-button">
          เลือกไฟล์
          <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(event) => void pickFile(event)} disabled={!canImport} />
        </label>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>รูปแบบไฟล์ {spec.label}</h2>
          <span className="status-chip">{spec.hint}</span>
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
                  {spec.fields.map((field) => <th key={field.key}>{field.label}{field.required ? ' *' : ''}</th>)}
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.rowId} className={duplicates.has(row.rowId) ? 'row-warning' : ''}>
                    {spec.fields.map((field) => (
                      <td key={field.key}>
                        <input
                          value={row[field.key] ?? ''}
                          onChange={(event) => editCell(row.rowId, field.key, event.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      {duplicates.has(row.rowId) && <span className="status-chip warning">รหัสซ้ำ</span>}
                      <button className="text-button" onClick={() => removeRow(row.rowId)}>ลบแถว</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
