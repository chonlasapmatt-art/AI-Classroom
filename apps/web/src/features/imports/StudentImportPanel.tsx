// Bringing a roster in from whatever file the school already has.
//
// The shape of this screen is the point: a file is read, what was found is shown, the teacher fixes
// what the reader got wrong, and only then does anything reach the database. Nothing is saved from
// the preview — every accepted row goes through the same repository call the manual student form
// uses, so validation, the sync queue and the audit trail all behave exactly as they always do.

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses } from '../../data/selectors';
import {
  acceptedImportExtensions, readImportFile, UnsupportedImportFile, type ParsedImportFile
} from '../../data/importParsing';
import type { ImportRun } from '../../domain/types';
import {
  buildDraftRows, buildErrorReport, classifyRows, displayNameOf, isRunnable, looksLikeHeaderRow,
  studentImportFields, suggestMapping, summarize,
  type ColumnMapping, type DraftRow, type MappingTarget, type RowAction
} from './importPlan';

const statusLabels: Record<DraftRow['status'], string> = {
  new: 'ใหม่', existing: 'มีอยู่แล้ว', changed: 'ข้อมูลเปลี่ยน', review: 'ต้องตรวจสอบ'
};
const statusTone: Record<DraftRow['status'], string> = {
  new: 'success', existing: '', changed: 'warning', review: 'danger'
};
const actionLabels: Record<RowAction, string> = {
  create: 'สร้างใหม่', update: 'อัปเดตข้อมูลเดิม', skip: 'ข้าม'
};

interface RunResult { created: number; updated: number; skipped: number; failed: number; report: string }

export function StudentImportPanel() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const classes = activeClasses(snapshot);
  const term = snapshot.terms.find((item) => item.status === 'active') ?? snapshot.terms[0];

  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [headerIsData, setHeaderIsData] = useState(false);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [classId, setClassId] = useState('');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<ImportRun[]>([]);
  const [dragging, setDragging] = useState(false);
  const startedAt = useRef<string>('');

  const canImport = membership.role === 'admin' || membership.role === 'teacher';
  const selectedClassId = classId || classes[0]?.id || '';
  const existing = useMemo(
    () => snapshot.students.map((student) => ({
      id: student.id, studentCode: student.studentCode, displayName: student.displayName
    })),
    [snapshot.students]
  );

  const loadHistory = useCallback(() => {
    void repository.listImportRuns(5).then(setHistory).catch(() => setHistory([]));
  }, [repository]);
  useEffect(loadHistory, [loadHistory]);

  /** Re-runs the status pass. Called after every edit so the preview always states the truth. */
  const reclassify = useCallback((next: DraftRow[]) => {
    setRows(classifyRows(next, existing, classes.map((item) => item.name)));
  }, [classes, existing]);

  async function readFile(file: File) {
    setReading(true); setError(null); setResult(null);
    startedAt.current = new Date().toISOString();
    try {
      const outcome = await readImportFile(file);
      const headerless = !looksLikeHeaderRow(outcome.table.columns);
      const suggestion = suggestMapping(
        headerless ? [] : outcome.table.columns,
        headerless ? [outcome.table.columns, ...outcome.table.rows] : outcome.table.rows
      );
      setParsed(outcome);
      setFileName(file.name);
      setHeaderIsData(headerless);
      setMappings(suggestion);
      reclassify(buildDraftRows(outcome.table, suggestion, headerless, {
        lowConfidence: outcome.confidence === 'low'
      }));
    } catch (reason) {
      setParsed(null); setRows([]); setMappings([]);
      setError(reason instanceof UnsupportedImportFile || reason instanceof Error
        ? reason.message : 'อ่านไฟล์ไม่สำเร็จ');
    } finally {
      setReading(false);
    }
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = '';
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  function changeMapping(index: number, target: MappingTarget) {
    const next = mappings.map((mapping) => {
      if (mapping.index === index) return { ...mapping, target, inferred: false };
      // A field can only come from one column, so claiming it releases whoever held it.
      if (target !== 'ignore' && mapping.target === target) return { ...mapping, target: 'ignore' as const };
      return mapping;
    });
    setMappings(next);
    if (parsed) {
      reclassify(buildDraftRows(parsed.table, next, headerIsData, {
        lowConfidence: parsed.confidence === 'low'
      }));
    }
  }

  function editCell(rowId: string, key: 'studentCode' | 'firstName' | 'lastName' | 'className', value: string) {
    reclassify(rows.map((row) => (row.rowId === rowId ? { ...row, [key]: value, lowConfidence: false } : row)));
  }

  function setAction(rowId: string, action: RowAction) {
    setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, action } : row)));
  }

  function reset() {
    setParsed(null); setRows([]); setMappings([]); setFileName(''); setError(null);
  }

  /**
   * Runs the accepted rows one at a time through the ordinary student path. A row that fails is
   * counted and the run continues — one bad name in a file of forty must not cost the other 39.
   */
  async function runImport() {
    setBusy(true); setError(null);
    let created = 0; let updated = 0; let skipped = 0; let failed = 0;
    for (const row of rows) {
      if (!isRunnable(row)) { skipped += 1; continue; }
      try {
        const id = row.action === 'update' && row.matchedStudentId ? row.matchedStudentId : crypto.randomUUID();
        await repository.saveStudent({
          id, studentCode: row.studentCode.trim(), displayName: displayNameOf(row),
          avatarIndex: (snapshot.students.length + created) * 7
        });
        const named = row.className.trim().toLowerCase();
        const targetClass = classes.find((item) => item.name.trim().toLowerCase() === named)?.id ?? selectedClassId;
        if (targetClass && term) await repository.enrollStudent(id, targetClass, term.id);
        if (row.action === 'update') updated += 1; else created += 1;
      } catch {
        failed += 1;
      }
    }
    const report = buildErrorReport(rows);
    try {
      await repository.recordImportRun({
        target: 'student', actorProfileId: membership.profileId, fileName,
        fileKind: parsed?.kind ?? 'unknown', startedAt: startedAt.current || new Date().toISOString(),
        rowsDetected: rows.length, created, updated, skipped, failed,
        notes: parsed?.notes.join(' · ') ?? ''
      });
    } catch { /* the receipt is a convenience; never fail an import over it */ }
    setResult({ created, updated, skipped, failed, report });
    setRows([]); setParsed(null); setMappings([]);
    setBusy(false);
    loadHistory();
  }

  function downloadReport() {
    if (!result) return;
    // The byte-order mark is what makes Excel open a Thai CSV as UTF-8 instead of mojibake.
    const bom = String.fromCharCode(0xfeff);
    const blob = new Blob([`${bom}${result.report}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const summary = summarize(rows);
  const columnCount = Math.max(mappings.length, 0);

  return (
    <>
      <div
        className={`dropzone ${dragging ? 'active' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <span aria-hidden="true">↥</span>
        <strong>ลากไฟล์มาวางที่นี่</strong>
        <p>รองรับ Excel (.xlsx), CSV, TSV, TXT, Word (.docx) และ PDF ที่มีตัวอักษร</p>
        <label className="upload-button">
          เลือกไฟล์
          <input type="file" accept={acceptedImportExtensions} onChange={pickFile} disabled={!canImport || reading} />
        </label>
        {mode === 'cloud' && <p className="field-hint">อ่านไฟล์และเตรียมรายชื่อได้แม้ไม่มีอินเทอร์เน็ต ข้อมูลจะซิงก์ให้เองเมื่อกลับมาออนไลน์</p>}
      </div>

      {reading && <section className="panel"><p>ระบบกำลังอ่านรายชื่อ...</p></section>}
      {error && <div className="alert error" role="alert">{error}</div>}

      {parsed && rows.length > 0 && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>พบข้อมูลนักเรียน {rows.length} คน</h2>
              <button className="text-button" onClick={reset}>เลือกไฟล์ใหม่</button>
            </div>
            <p className="muted">{fileName}</p>
            {headerIsData && <p className="field-hint">ไฟล์นี้ไม่มีหัวตาราง ระบบเดาความหมายของแต่ละคอลัมน์จากข้อมูล กรุณาตรวจสอบก่อนบันทึก</p>}
            {parsed.notes.map((note) => <p key={note} className="field-hint">{note}</p>)}
          </section>

          <section className="panel">
            <div className="panel-heading"><h2>จับคู่คอลัมน์</h2></div>
            <div className="mapping-grid">
              {Array.from({ length: columnCount }, (_, index) => {
                const mapping = mappings.find((item) => item.index === index);
                if (!mapping) return null;
                const preview = (headerIsData ? parsed.table.columns[index] : parsed.table.rows[0]?.[index]) ?? '';
                return (
                  <label key={index} className="mapping-row">
                    <span className="mapping-source">
                      <strong>{mapping.header || `คอลัมน์ ${index + 1}`}</strong>
                      <small>{preview || '—'}</small>
                    </span>
                    <select value={mapping.target} onChange={(event) => changeMapping(index, event.target.value as MappingTarget)}>
                      <option value="ignore">ไม่ต้องนำเข้าคอลัมน์นี้</option>
                      {studentImportFields.map((field) => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="panel data-panel">
            <div className="panel-heading">
              <h2>ตรวจสอบก่อนบันทึก</h2>
              <span className="status-chip">สร้าง {summary.create} · อัปเดต {summary.update} · ข้าม {summary.skip} · ตรวจสอบ {summary.review}</span>
            </div>
            <div className="toolbar">
              <label>
                ห้องเรียนปลายทาง (ใช้เมื่อไฟล์ไม่ได้ระบุห้อง)
                <select value={selectedClassId} onChange={(event) => setClassId(event.target.value)}>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <button className="primary-button" disabled={busy || !canImport || summary.create + summary.update === 0} onClick={() => void runImport()}>
                {busy ? 'กำลังบันทึก...' : `บันทึก ${summary.create + summary.update} รายการ`}
              </button>
            </div>
            <div className="table-scroll">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th>#</th><th>รหัสนักเรียน</th><th>ชื่อ</th><th>นามสกุล</th><th>ห้อง</th>
                    <th>สถานะ</th><th>จะทำอะไร</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.rowId} className={row.status === 'review' ? 'row-warning' : ''}>
                      <td>{index + 1}</td>
                      <td><input value={row.studentCode} onChange={(event) => editCell(row.rowId, 'studentCode', event.target.value)} /></td>
                      <td><input value={row.firstName} onChange={(event) => editCell(row.rowId, 'firstName', event.target.value)} /></td>
                      <td><input value={row.lastName} onChange={(event) => editCell(row.rowId, 'lastName', event.target.value)} /></td>
                      <td><input value={row.className} onChange={(event) => editCell(row.rowId, 'className', event.target.value)} /></td>
                      <td>
                        <span className={`status-chip ${statusTone[row.status]}`}>{statusLabels[row.status]}</span>
                        {row.issues.map((issue) => <small key={issue} className="row-issue">⚠ {issue}</small>)}
                      </td>
                      <td>
                        <select value={row.action} onChange={(event) => setAction(row.rowId, event.target.value as RowAction)}>
                          <option value="create">{actionLabels.create}</option>
                          {row.matchedStudentId && <option value="update">{actionLabels.update}</option>}
                          <option value="skip">{actionLabels.skip}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {result && (
        <section className="panel">
          <div className="panel-heading"><h2>ผลการนำเข้า</h2></div>
          <ul className="result-list">
            <li>นำเข้าสำเร็จ {result.created} คน</li>
            <li>อัปเดตข้อมูลเดิม {result.updated} คน</li>
            <li>ข้าม {result.skipped} คน</li>
            {result.failed > 0 && <li>บันทึกไม่สำเร็จ {result.failed} คน</li>}
          </ul>
          <div className="record-actions">
            <a className="secondary-button" href="/students">ดูรายชื่อนักเรียน</a>
            <button className="text-button" onClick={downloadReport}>ดาวน์โหลดรายงานข้อผิดพลาด</button>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel data-panel">
          <div className="panel-heading"><h2>ประวัติการนำเข้า</h2></div>
          <ul className="record-list">
            {history.map((run) => (
              <li key={run.id}>
                <div className="record-main">
                  <div>
                    <strong>{run.fileName || 'ไม่ทราบชื่อไฟล์'}</strong>
                    <span>{new Date(run.startedAt).toLocaleString('th-TH')} · {run.fileKind}</span>
                    <span>พบ {run.rowsDetected} แถว · สร้าง {run.created} · อัปเดต {run.updated} · ข้าม {run.skipped}{run.failed > 0 ? ` · ไม่สำเร็จ ${run.failed}` : ''}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
