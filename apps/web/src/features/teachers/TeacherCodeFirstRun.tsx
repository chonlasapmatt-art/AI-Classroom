import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { Button, Modal } from '../../ui/components';
import { TeacherAccessCodeDialog } from './TeacherAccessCodePanel';
import { issueTeacherAccessCode, revealTeacherAccessCode, type TeacherAccessCode } from './teacherAccessCode';

const seenKey = (schoolId: string) => `teacher-code-offered:${schoolId}`;

/**
 * The first thing a new school administrator is shown once their school exists.
 *
 * A school with no teacher code has no way to admit a teacher, and an administrator who does not know
 * codes exist will not go looking for one. So the offer comes to them, once, the first time they
 * reach the app — and once they have answered it, this never appears again. Declining is a real
 * answer: teacher management carries the same controls whenever they want them.
 */
export function TeacherCodeFirstRun() {
  const { membership, mode } = useSession();
  const navigate = useNavigate();
  const schoolId = membership.schoolId;
  const [offer, setOffer] = useState(false);
  const [issued, setIssued] = useState<TeacherAccessCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'cloud' || membership.role !== 'admin' || !schoolId) return;
    let cancelled = false;
    // Asked once per school per device. A school that already has a code never sees this at all,
    // which is what keeps it out of the way of an administrator who has been here before.
    try { if (localStorage.getItem(seenKey(schoolId))) return; } catch { return; }
    void revealTeacherAccessCode(schoolId)
      .then((existing) => { if (!cancelled && !existing) setOffer(true); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [membership.role, mode, schoolId]);

  function dismiss() {
    try { localStorage.setItem(seenKey(schoolId), new Date().toISOString()); } catch { /* private mode */ }
    setOffer(false);
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      const code = await issueTeacherAccessCode({ schoolId, label: 'รหัสแรกของโรงเรียน' });
      dismiss();
      setIssued(code);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'สร้างรหัสไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  if (issued) {
    return (
      <TeacherAccessCodeDialog
        code={issued}
        onClose={() => setIssued(null)}
        onManage={() => { setIssued(null); navigate('/teachers'); }}
      />
    );
  }

  if (!offer) return null;

  return (
    <Modal
      title="สร้างรหัสสำหรับครู"
      description="ครูใหม่ต้องใช้รหัสนี้ตอนสมัครครั้งแรก โรงเรียนนี้ยังไม่มีรหัส"
      onClose={dismiss}
      actions={
        <>
          <Button variant="secondary" onClick={dismiss}>ไว้ทีหลัง</Button>
          <Button variant="primary" onClick={() => void create()} loading={busy}>สร้างรหัสเลย</Button>
        </>
      }
    >
      <p>
        ถ้ายังไม่มีรหัส ครูจะสมัครเข้าโรงเรียนนี้ไม่ได้ · รหัสหนึ่งใช้ได้กับครูหลายคน
        โดยครูแต่ละคนยังมีบัญชีและรหัสผ่านของตัวเอง
      </p>
      <p className="fine-print">
        สร้างทีหลังได้ที่เมนู “ครู” · ยกเลิกหรือเปลี่ยนรหัสได้ตลอดเวลา
      </p>
      {error && <div className="alert error" role="alert">{error}</div>}
    </Modal>
  );
}
