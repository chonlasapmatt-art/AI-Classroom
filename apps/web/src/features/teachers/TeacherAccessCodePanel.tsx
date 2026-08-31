import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../app/SessionContext';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Modal } from '../../ui/components';
import {
  describeTeacherAccessCode, issueTeacherAccessCode, revealTeacherAccessCode, revokeTeacherAccessCode,
  teacherAccessCodeHistory, TeacherCodeError,
  type TeacherAccessCode, type TeacherAccessCodeHistory
} from './teacherAccessCode';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * The dialog that shows a code.
 *
 * It exists as its own component because the code is shown at two different moments — the first time
 * an administrator reaches their school, and any time afterwards from teacher management — and both
 * must show the same thing. Copying is the primary action, because sending the code to teachers is
 * the only reason to open this at all.
 */
export function TeacherAccessCodeDialog({ code, onClose, onManage }: {
  code: TeacherAccessCode; onClose(): void; onManage?(): void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!code.code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      // Clipboard access can be refused. The code is on screen either way, so say so rather than
      // pretending the copy worked.
      setCopied(false);
    }
  }

  return (
    <Modal
      title="รหัสสำหรับครู"
      description="ส่งรหัสนี้ให้ครูที่ได้รับอนุญาต เพื่อใช้สมัคร Smart Classroom ครั้งแรก"
      onClose={onClose}
      actions={
        <>
          {onManage && <Button variant="secondary" onClick={onManage}>จัดการรหัส</Button>}
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="primary" onClick={() => void copy()} disabled={!code.code}>
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
          </Button>
        </>
      }
    >
      <div className="access-code-display">
        <strong className="access-code-value">{code.code ?? code.hint}</strong>
        <p className="field-hint">{describeTeacherAccessCode(code)}</p>
      </div>
      {code.unreadable && (
        <div className="alert warning" role="alert">
          อ่านรหัสเดิมไม่ได้ด้วยคีย์ปัจจุบันของเซิร์ฟเวอร์ กรุณากด “จัดการรหัส” แล้วสร้างรหัสใหม่
        </div>
      )}
      <p className="fine-print">
        รหัสนี้ใช้ร่วมกันได้ · ครูแต่ละคนยังมีบัญชีและรหัสผ่านของตัวเอง · รหัสนี้ไม่ให้สิทธิ์ผู้ดูแลโรงเรียน
        และใช้กับโรงเรียนอื่นไม่ได้
      </p>
    </Modal>
  );
}

/**
 * Teacher access code management, as an administrator sees it.
 *
 * A teacher signed into the same school reaches this component too, and is shown why they cannot use
 * it rather than nothing at all: hiding the section would make it look as though the school has no
 * code, which is a different and misleading thing to say.
 */
export function TeacherAccessCodePanel() {
  const { membership, mode } = useSession();
  const schoolId = membership.schoolId;
  const isAdmin = membership.role === 'admin';
  const [code, setCode] = useState<TeacherAccessCode | null>(null);
  const [history, setHistory] = useState<TeacherAccessCodeHistory>({ codes: [], uses: [] });
  const [dialog, setDialog] = useState<TeacherAccessCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [label, setLabel] = useState('');

  const load = useCallback(async () => {
    if (mode !== 'cloud' || !isAdmin) return;
    setLoading(true); setError(null);
    try {
      const [current, past] = await Promise.all([
        revealTeacherAccessCode(schoolId), teacherAccessCodeHistory(schoolId)
      ]);
      setCode(current); setHistory(past);
    } catch (reason) {
      setError(reason instanceof TeacherCodeError ? reason.message : 'โหลดรหัสสำหรับครูไม่สำเร็จ');
    } finally { setLoading(false); }
  }, [isAdmin, mode, schoolId]);

  useEffect(() => { void load(); }, [load]);

  async function issue() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const limit = maxUses.trim() === '' ? null : Number(maxUses.trim());
      const issued = await issueTeacherAccessCode({
        schoolId, label: label.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        maxUses: limit
      });
      setCode(issued); setDialog(issued);
      setMessage(code ? 'สร้างรหัสใหม่แล้ว รหัสเดิมถูกยกเลิกทันที' : 'สร้างรหัสสำหรับครูแล้ว');
      await load();
    } catch (reason) {
      setError(reason instanceof TeacherCodeError ? reason.message : 'สร้างรหัสไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function reveal() {
    setBusy(true); setError(null);
    try {
      const current = await revealTeacherAccessCode(schoolId);
      setCode(current);
      if (current) setDialog(current); else setMessage('โรงเรียนนี้ยังไม่มีรหัสสำหรับครู');
    } catch (reason) {
      setError(reason instanceof TeacherCodeError ? reason.message : 'อ่านรหัสไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function revoke() {
    if (!code) return;
    const reason = window.prompt(
      'ยกเลิกรหัสสำหรับครู\nครูที่สมัครไปแล้วยังใช้งานได้ตามปกติ แต่จะไม่มีใครสมัครด้วยรหัสนี้ได้อีก\n\nระบุเหตุผล',
      'รหัสรั่วไหล'
    );
    if (reason === null) return;
    setBusy(true); setError(null);
    try {
      await revokeTeacherAccessCode({ schoolId, codeId: code.codeId, reason });
      setCode(null); setMessage('ยกเลิกรหัสแล้ว ครูใหม่จะสมัครไม่ได้จนกว่าจะสร้างรหัสใหม่');
      await load();
    } catch (reason2) {
      setError(reason2 instanceof TeacherCodeError ? reason2.message : 'ยกเลิกรหัสไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  if (mode !== 'cloud') {
    return (
      <Card>
        <CardHeader title="รหัสสำหรับครู" description="ใช้ได้เฉพาะเมื่อเชื่อมต่อระบบจริง" />
        <EmptyState title="โหมดตัวอย่างไม่มีรหัสจริง" description="เข้าสู่ระบบด้วยบัญชีผู้ดูแลโรงเรียนเพื่อสร้างและส่งรหัสให้ครู" />
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader title="รหัสสำหรับครู" description="ผู้ดูแลโรงเรียนเป็นผู้สร้างและส่งรหัสนี้" />
        <p className="field-hint">
          ครูสร้างรหัสสำหรับครูไม่ได้ หากต้องการรหัสให้เพื่อนครูคนใหม่ กรุณาขอจากผู้ดูแลโรงเรียน
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="รหัสสำหรับครู"
        description="ครูใหม่ต้องใช้รหัสนี้ตอนสมัครครั้งแรก ครั้งต่อไปเข้าสู่ระบบด้วยชื่อกับรหัสผ่านเท่านั้น"
        action={
          <>
            <Button variant="secondary" onClick={() => void reveal()} disabled={busy || loading}>ดูรหัสปัจจุบัน</Button>
            <Button variant="primary" onClick={() => void issue()} loading={busy}>
              {code ? 'สร้างรหัสใหม่' : 'สร้างรหัส'}
            </Button>
          </>
        }
      />

      {error && <div className="alert error" role="alert">{error}</div>}
      {message && <div className="alert success" role="status">{message}</div>}

      {loading ? <p className="field-hint">กำลังโหลด...</p> : (
        <div className="access-code-summary">
          {code ? (
            <>
              <strong className="access-code-value">{code.hint}</strong>
              <p className="field-hint">{describeTeacherAccessCode(code)}</p>
              <Button variant="danger" onClick={() => void revoke()} disabled={busy}>ยกเลิกรหัสนี้</Button>
            </>
          ) : (
            <EmptyState
              title="ยังไม่มีรหัสสำหรับครู"
              description="สร้างรหัสแล้วส่งให้ครูที่ได้รับอนุญาต ครูที่ไม่มีรหัสจะสมัครเข้าโรงเรียนนี้ไม่ได้"
            />
          )}
        </div>
      )}

      <details className="access-code-options">
        <summary>ตั้งค่าเพิ่มเติมก่อนสร้างรหัสใหม่</summary>
        <Field label="ชื่อกำกับรหัส" hint="ไว้จำว่ารหัสนี้ออกให้ใคร เช่น “ครูใหม่ภาคเรียนที่ 1”">
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="เช่น ครูใหม่ภาคเรียนที่ 1" />
        </Field>
        <Field label="วันหมดอายุ" hint="เว้นว่างไว้ = ไม่มีวันหมดอายุ">
          <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </Field>
        <Field label="จำกัดจำนวนครูที่ใช้ได้" hint="เว้นว่างไว้ = ใช้ได้ไม่จำกัดจำนวนครู">
          <input type="number" min={1} max={10000} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="เช่น 12" />
        </Field>
      </details>

      {history.codes.length > 0 && (
        <DataTable
          caption="ประวัติรหัสสำหรับครู"
          head={<tr><th>รหัส</th><th>สถานะ</th><th>ใช้ไปแล้ว</th><th>สร้างเมื่อ</th><th>ยกเลิกเมื่อ</th></tr>}
        >
          {history.codes.map((row) => (
            <tr key={row.codeId}>
              <td>{row.hint}{row.label && <span className="fine-print"> · {row.label}</span>}</td>
              <td><Badge tone={row.status === 'active' ? 'success' : 'neutral'}>{row.status === 'active' ? 'ใช้งานอยู่' : 'ยกเลิกแล้ว'}</Badge></td>
              <td>{row.useCount}{row.maxUses === null ? '' : ` / ${row.maxUses}`}</td>
              <td>{formatDate(row.createdAt)}</td>
              <td>{formatDate(row.revokedAt)}{row.revokedReason ? ` · ${row.revokedReason}` : ''}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {history.uses.length > 0 && (
        <DataTable
          caption="ครูที่สมัครด้วยรหัส"
          head={<tr><th>ชื่อครู</th><th>ใช้รหัส</th><th>เมื่อ</th></tr>}
        >
          {history.uses.map((row, index) => (
            <tr key={`${row.codeId}-${row.usedAt}-${index}`}>
              <td>{row.displayName || 'ครู'}</td>
              <td>{history.codes.find((item) => item.codeId === row.codeId)?.hint ?? '—'}</td>
              <td>{formatDate(row.usedAt)}</td>
            </tr>
          ))}
        </DataTable>
      )}

      {dialog && <TeacherAccessCodeDialog code={dialog} onClose={() => setDialog(null)} />}
    </Card>
  );
}
