import { useState, type ChangeEvent } from 'react';
import { acceptedImportExtensions, readImportFile } from '../../data/importParsing';
import { Badge, Button, Modal } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';
import { buildRosterRows, rosterRowProblem, rosterSpecs, type RosterRow, type RosterTarget } from './rosterFile';

/**
 * "Add these from a file", beside the form that adds one.
 *
 * Importing a roster used to be its own screen, which meant leaving the teachers page to add
 * teachers. It is a button here instead: pick the file, read what it found, and write it — with
 * every row that will be skipped saying why while it is still on screen, rather than a count
 * afterwards.
 *
 * The writing itself belongs to the page: this hands back the rows that passed, and the teachers
 * page saves teachers while the guardians page links guardians. That keeps one reader and one
 * preview for both, without this component knowing anything about either record.
 */
export function RosterFileButton({ target, knownStudentCodes, onSave, disabled }: {
  target: RosterTarget;
  /** Parent lists name a child by code; a code this school does not have links nobody. */
  knownStudentCodes?: Set<string>;
  onSave: (rows: RosterRow[]) => Promise<{ saved: number; skipped: number }>;
  disabled?: boolean;
}) {
  const spec = rosterSpecs[target];
  const { toast } = useToast();
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [headerless, setHeaderless] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReading(true);
    try {
      const parsed = await readImportFile(file);
      const built = buildRosterRows(parsed.table, spec.fields);
      if (built.rows.length === 0) {
        toast('ไม่พบรายชื่อในไฟล์นี้', { tone: 'error' });
        return;
      }
      setRows(built.rows);
      setHeaderless(built.headerless);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'อ่านไฟล์ไม่สำเร็จ', { tone: 'error' });
    } finally {
      setReading(false);
    }
  }

  const problems = rows?.map((row) => rosterRowProblem(row, spec, knownStudentCodes)) ?? [];
  const ready = rows?.filter((_row, index) => problems[index] === null) ?? [];
  const blocked = rows?.length ? rows.length - ready.length : 0;

  async function save() {
    if (!rows || ready.length === 0) return;
    setSaving(true);
    try {
      const result = await onSave(ready);
      toast(`เพิ่ม${spec.label} ${result.saved} คนแล้ว${result.skipped > 0 ? ` · ข้าม ${result.skipped} แถว` : ''}`);
      setRows(null);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <label className={`roster-file-button ${disabled ? 'is-disabled' : ''}`.trim()}>
        <input
          type="file"
          accept={acceptedImportExtensions}
          hidden
          disabled={disabled || reading}
          onChange={(event) => void pick(event)}
        />
        <span className="ui-button ui-button-secondary ui-size-md">
          <Icon name="import" size={16} />
          {reading ? 'กำลังอ่านไฟล์…' : `เพิ่ม${spec.label}จากไฟล์`}
        </span>
      </label>

      {rows && (
        <Modal
          title={`เพิ่ม${spec.label}จากไฟล์`}
          description={`อ่านได้ ${rows.length} แถว · ${spec.hint}`}
          onClose={() => setRows(null)}
          wide
          actions={(
            <>
              <Button variant="ghost" onClick={() => setRows(null)}>ยกเลิก</Button>
              <Button variant="primary" loading={saving} disabled={ready.length === 0} onClick={() => void save()}>
                บันทึก {ready.length} รายชื่อ
              </Button>
            </>
          )}
        >
          {headerless && (
            <p className="ui-field-hint">
              ไฟล์นี้ไม่มีหัวตาราง · ระบบเดาคอลัมน์จากรูปแบบข้อมูล กรุณาตรวจก่อนบันทึก
            </p>
          )}
          {blocked > 0 && (
            <p className="ui-field-hint">
              มี {blocked} แถวที่ยังบันทึกไม่ได้ · แถวเหล่านั้นบอกเหตุผลไว้ด้านล่าง แก้ในไฟล์แล้วเลือกใหม่ได้
            </p>
          )}
          <ol className="roster-file-preview">
            {rows.slice(0, 50).map((row, index) => (
              <li key={row.rowId} data-blocked={problems[index] ? 'true' : 'false'}>
                <span className="roster-file-copy">
                  <strong>
                    {target === 'teacher' ? row.displayName || '—' : row.parentName || '—'}
                  </strong>
                  <small>
                    {spec.fields
                      .filter((field) => field.key !== 'displayName' && field.key !== 'parentName')
                      .map((field) => `${field.label} ${row[field.key]?.trim() || '—'}`)
                      .join(' · ')}
                  </small>
                </span>
                {problems[index]
                  ? <Badge tone="warning">{problems[index]}</Badge>
                  : <Badge tone="success">พร้อมบันทึก</Badge>}
              </li>
            ))}
            {rows.length > 50 && <li className="roster-file-more">และอีก {rows.length - 50} แถว</li>}
          </ol>
        </Modal>
      )}
    </>
  );
}
