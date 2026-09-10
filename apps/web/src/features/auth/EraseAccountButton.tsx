import { useState } from 'react';
import { eraseManagedAccount, type ManagedAccountRole } from './adminAccount';
import { Button } from '../../ui/components';

/**
 * Deletes the account behind one roster row, after asking twice in the same button.
 *
 * The two states are the whole safeguard, and they are enough: the second press is a deliberate act
 * on a control that has just told the administrator what it is about to do. A dialog would say the
 * same sentence with more ceremony.
 *
 * What this removes is the way in — the sign-in identity, the school membership, the personal
 * account. The teacher, student or guardian stays on the roster with their history, and the log
 * keeps their name against everything they did. Nothing here is recoverable.
 */
export function EraseAccountButton({ schoolId, role, profileId, displayName, onDone }: {
  schoolId: string;
  role: ManagedAccountRole;
  profileId: string;
  displayName: string;
  onDone: (message: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function erase() {
    setBusy(true);
    try {
      await eraseManagedAccount({ schoolId, role, profileId });
      onDone(`ลบบัญชีของ ${displayName} แล้ว · ชื่อยังอยู่ในรายชื่อ แต่เข้าสู่ระบบไม่ได้อีก`);
    } catch (reason) {
      onDone(reason instanceof Error ? reason.message : 'ลบบัญชีไม่สำเร็จ');
    } finally {
      setBusy(false);
      setArmed(false);
    }
  }

  /*
   * It lives in rows of pill buttons, so it is one too.
   *
   * As a bare `.text-button` it was a coloured word standing among controls with borders — which
   * read as a link to somewhere rather than as the most destructive thing on the row, and made
   * every roster row look like it had been assembled from two different products.
   */
  if (!armed) {
    return (
      <Button variant="ghost" size="sm" className="erase-account" disabled={busy} onClick={() => setArmed(true)}>
        ลบบัญชี
      </Button>
    );
  }
  return (
    <>
      <span className="ui-field-hint">ลบบัญชีถาวร ย้อนกลับไม่ได้ · ชื่อยังอยู่ในรายชื่อโรงเรียน</span>
      <Button variant="danger" size="sm" loading={busy} onClick={() => void erase()}>
        {busy ? 'กำลังลบ...' : 'ยืนยันลบถาวร'}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setArmed(false)}>
        ยกเลิก
      </Button>
    </>
  );
}
