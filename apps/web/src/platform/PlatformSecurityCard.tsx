// Setting up the operator's second factor, and seeing which operators still have not.
//
// The roster is the part that matters and the part a personal settings screen would omit. "MFA is
// available" is not a security property. "Every account that can suspend a school has one" is, and
// an operator who can only see their own status has no way to know which of those two they are
// living in — so the card shows every active operator and whether they have enrolled.
//
// Nothing here invents a factor. GoTrue enrols it, GoTrue verifies the code, and the result is an
// `aal2` claim inside the token — which is the reason the database can be told the assurance level
// and believe it. A boolean this screen set would be worth exactly as much as the browser's word.

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, DataTable, Field, Skeleton } from '../ui/components';
import { formatMoment } from './consoleHelpers';
import { platformMfaStatus, type PlatformMfaStatus } from './platformClient';
import { beginEnrolment, listFactors, removeFactor, verifyEnrolment, MfaError, type MfaEnrolment } from './platformMfa';

export function PlatformSecurityCard() {
  const [status, setStatus] = useState<PlatformMfaStatus | null>(null);
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    return platformMfaStatus()
      .then(setStatus)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'อ่านสถานะไม่สำเร็จ'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function start() {
    setBusy(true); setError(null); setNotice(null);
    try {
      // An abandoned attempt leaves an unverified factor behind, which grants nothing but does
      // occupy the name. Clearing those first keeps a second attempt from failing on a collision.
      for (const factor of await listFactors()) {
        if (factor.status !== 'verified') await removeFactor(factor.id);
      }
      setEnrolment(await beginEnrolment(`Operations console · ${new Date().toLocaleDateString('th-TH')}`));
    } catch (reason) {
      setError(reason instanceof MfaError ? reason.message : 'เริ่มตั้งค่าไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function finish() {
    if (!enrolment) return;
    setBusy(true); setError(null);
    try {
      await verifyEnrolment(enrolment.factorId, code.trim());
      setEnrolment(null); setCode('');
      setNotice('เปิดตัวยืนยันสองชั้นแล้ว · ตั้งแต่นี้รายการที่ต้องยืนยันจะขอรหัส 6 หลักด้วย');
      await refresh();
    } catch (reason) {
      setError(reason instanceof MfaError ? reason.message : 'ยืนยันไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(null); setNotice(null);
    try {
      for (const factor of await listFactors()) await removeFactor(factor.id);
      setNotice('ปิดตัวยืนยันสองชั้นแล้ว · บัญชีนี้กลับไปใช้รหัสผ่านอย่างเดียว');
      await refresh();
    } catch (reason) {
      setError(reason instanceof MfaError ? reason.message : 'ลบตัวยืนยันไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  const withoutMfa = (status?.operators ?? []).filter((operator) => !operator.enrolled);

  return (
    <Card>
      <CardHeader
        title="ตัวยืนยันสองชั้นของผู้ดูแลแพลตฟอร์ม"
        description="บัญชีที่ระงับโรงเรียนไหนก็ได้ ไม่ควรมีแค่รหัสผ่านเป็นด่านเดียว"
        action={<Button onClick={() => void refresh()} disabled={busy}>รีเฟรช</Button>}
      />

      {notice && <div className="alert success" role="status">{notice}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}

      {!status ? <Skeleton lines={4} /> : (
        <>
          {status.enrolled ? (
            <div className="alert success" role="status">
              บัญชีนี้เปิดตัวยืนยันสองชั้นแล้ว · เซสชันปัจจุบันอยู่ระดับ {status.sessionAal}
            </div>
          ) : (
            <div className="alert warning" role="alert">
              บัญชีนี้ยังไม่ได้เปิดตัวยืนยันสองชั้น · รหัสผ่านที่รั่วออกไปเปิดคอนโซลนี้ได้ทันที
            </div>
          )}

          {enrolment ? (
            <>
              <p className="field-hint">
                สแกน QR ด้วยแอปยืนยันตัวตน (Google Authenticator, Microsoft Authenticator, 1Password ฯลฯ)
                แล้วกรอกรหัส 6 หลักที่แอปแสดงเพื่อยืนยัน
              </p>
              <div className="mfa-enrolment">
                <img src={enrolment.qrCode} alt="QR สำหรับตั้งค่าตัวยืนยันสองชั้น" width={200} height={200} />
                <div>
                  <p className="field-hint">สแกนไม่ได้ ใช้รหัสนี้กรอกเองในแอป:</p>
                  <code className="one-time-secret-value">{enrolment.secret}</code>
                </div>
              </div>
              <Field label="รหัส 6 หลักจากแอป">
                <input
                  inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                />
              </Field>
              <div className="one-time-secret-actions">
                <Button variant="primary" loading={busy} disabled={code.trim().length < 6} onClick={() => void finish()}>
                  ยืนยันและเปิดใช้งาน
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => { setEnrolment(null); setCode(''); }}>
                  ยกเลิก
                </Button>
              </div>
            </>
          ) : (
            <div className="one-time-secret-actions">
              {status.enrolled
                ? <Button variant="danger" loading={busy} onClick={() => void remove()}>ปิดตัวยืนยันสองชั้น</Button>
                : <Button variant="primary" loading={busy} onClick={() => void start()}>เปิดตัวยืนยันสองชั้น</Button>}
            </div>
          )}

          {withoutMfa.length > 0 && (
            <div className="alert warning" role="note">
              ยังมีผู้ดูแลแพลตฟอร์ม {withoutMfa.length} บัญชีที่ไม่ได้เปิดตัวยืนยันสองชั้น
            </div>
          )}

          <DataTable
            caption="ผู้ดูแลแพลตฟอร์มทั้งหมด"
            head={<tr><th>ชื่อ</th><th>ตัวยืนยันสองชั้น</th><th>ยืนยันตัวตนล่าสุด</th></tr>}
          >
            {(status.operators ?? []).map((operator) => (
              <tr key={operator.profileId}>
                <td>{operator.displayName ?? '—'}</td>
                <td>
                  <Badge tone={operator.enrolled ? 'success' : 'warning'}>
                    {operator.enrolled ? 'เปิดแล้ว' : 'ยังไม่เปิด'}
                  </Badge>
                </td>
                <td>
                  {formatMoment(operator.lastReauthAt)}
                  {operator.lastReauthAal && ` · ${operator.lastReauthAal}`}
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </Card>
  );
}
