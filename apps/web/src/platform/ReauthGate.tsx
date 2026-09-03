import { useEffect, useState } from 'react';
import { Button, Modal, PasswordInput } from '../ui/components';
import type { DangerousAction } from './consoleHelpers';
import { hasFreshPlatformReauthentication, PlatformError, reauthenticate } from './platformClient';
import { assuranceLevels, challenge, listFactors, MfaError } from './platformMfa';

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
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  // Set when this account has a verified factor that this session has not answered. The password
  // alone will be refused in that state, so asking for the code here saves a pointless round trip
  // and, more to the point, an operator staring at a refusal that does not say what to do.
  const [factorId, setFactorId] = useState<string | null>(null);
  const minimum = action.minimumReasonLength ?? 8;

  useEffect(() => {
    let mounted = true;
    void hasFreshPlatformReauthentication().then((value) => { if (mounted) setFresh(value); }).catch(() => undefined);
    void (async () => {
      const levels = await assuranceLevels().catch(() => null);
      if (!mounted || !levels?.needsChallenge) return;
      const verified = (await listFactors().catch(() => [])).find((item) => item.status === 'verified');
      if (mounted && verified) setFactorId(verified.id);
    })();
    return () => { mounted = false; };
  }, []);

  const needsCode = factorId !== null;
  const ready = (fresh || (password.length >= 1 && (!needsCode || code.trim().length >= 6)))
    && reason.trim().length >= minimum;

  async function confirm() {
    setBusy(true); setError(null);
    try {
      // In order, and each step cheap to fail: the second factor raises the session, the password
      // proves the person, and only then does the action start.
      if (!fresh && factorId) {
        await challenge(factorId, code.trim());
        setFactorId(null);
      }
      if (!fresh) await reauthenticate(password);
      await action.run(reason.trim());
      onDone(`${action.confirmLabel}เรียบร้อย`);
      onClose();
    } catch (reason2) {
      const message = reason2 instanceof PlatformError || reason2 instanceof MfaError
        ? reason2.message
        : 'ดำเนินการไม่สำเร็จ';
      setError(reason2 instanceof PlatformError && reason2.code === 'MFA_REQUIRED'
        ? 'บัญชีนี้ตั้งตัวยืนยันสองชั้นไว้ กรุณากรอกรหัส 6 หลักจากแอปก่อน'
        : message);
    } finally {
      setBusy(false);
      setPassword('');
      setCode('');
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
      {fresh ? (
        <div className="alert success" role="status">ยืนยันตัวตนล่าสุดแล้ว · ใช้งานหน้าต่างความปลอดภัยได้อีกไม่เกิน 15 นาที</div>
      ) : (
        <>
          <label>
            รหัสผ่านของคุณ
            <PasswordInput
              value={password} onChange={setPassword}
              autoComplete="current-password" placeholder="ยืนยันว่าเป็นคุณจริง" required
            />
          </label>
          {needsCode && (
            <>
              <label>
                รหัส 6 หลักจากแอปยืนยันตัวตน
                <input
                  inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="000000" required
                />
              </label>
              <p className="field-hint">บัญชีนี้ตั้งตัวยืนยันสองชั้นไว้ · รหัสผ่านอย่างเดียวจะถูกปฏิเสธ</p>
            </>
          )}
          <p className="field-hint">ยืนยันรหัสผ่านมีอายุ 15 นาที ใช้ได้กับรายการที่ต้องยืนยันทุกรายการในช่วงนั้น</p>
        </>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
    </Modal>
  );
}
