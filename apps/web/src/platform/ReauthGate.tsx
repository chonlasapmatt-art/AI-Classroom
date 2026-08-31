import { useState } from 'react';
import { Button, Modal } from '../ui/components';
import type { DangerousAction } from './consoleHelpers';
import { PlatformError, reauthenticate } from './platformClient';

/**
 * The gate in front of every action that is hard to take back.
 *
 * Three things are asked for, and each is asked for a different reason. The password is asked
 * because a console left open on a desk should not be able to suspend a school; the database checks
 * that answer, not this component. The reason is asked because the school on the receiving end is
 * entitled to know why. And the summary is shown because an operator who has clicked the wrong row
 * should find that out here rather than afterwards.
 */
export function DangerousActionDialog({ action, onClose, onDone }: {
  action: DangerousAction; onClose(): void; onDone(message: string): void;
}) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minimum = action.minimumReasonLength ?? 8;
  const ready = password.length >= 1 && reason.trim().length >= minimum;

  async function confirm() {
    setBusy(true); setError(null);
    try {
      // Re-authenticating first means a wrong password costs nothing: the action has not started.
      await reauthenticate(password);
      await action.run(reason.trim());
      onDone(`${action.confirmLabel}เรียบร้อย`);
      onClose();
    } catch (reason2) {
      setError(reason2 instanceof PlatformError ? reason2.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <Modal
      title={action.confirmLabel}
      description={action.summary}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} disabled={!ready}>
            {action.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="alert warning" role="alert">{action.consequence}</div>
      <label>
        เหตุผล
        <textarea
          value={reason} onChange={(event) => setReason(event.target.value)} rows={3}
          placeholder="เช่น โรงเรียนแจ้งขอระงับการใช้งานชั่วคราวระหว่างตรวจสอบข้อมูล"
          aria-describedby="reason-hint" required
        />
      </label>
      <p className="field-hint" id="reason-hint">
        อย่างน้อย {minimum} ตัวอักษร · เหตุผลนี้ถูกบันทึกถาวรและโรงเรียนตรวจสอบย้อนหลังได้
      </p>
      <label>
        รหัสผ่านของคุณ
        <input
          type="password" autoComplete="current-password" value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="ยืนยันว่าเป็นคุณจริง" required
        />
      </label>
      <p className="field-hint">ยืนยันรหัสผ่านมีอายุ 15 นาที ใช้ได้กับรายการที่ต้องยืนยันทุกรายการในช่วงนั้น</p>
      {error && <div className="alert error" role="alert">{error}</div>}
    </Modal>
  );
}
